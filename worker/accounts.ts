import { ApiError } from "./errors";
import type { Row } from "./ruleContext";
type AuthEnv = {
  DB: D1Database;
  REGISTRATION_PLAYER_KEY?: string;
  REGISTRATION_DM_KEY?: string;
};
const token = () => crypto.randomUUID() + crypto.randomUUID();
export async function tokenHash(value: string) {
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return "pbkdf2:100000:" + btoa(String.fromCharCode(...new Uint8Array(bits)));
}
export async function passwordMatches(
  password: string,
  salt: string,
  stored: string,
) {
  return equal(
    stored,
    stored.startsWith("pbkdf2:100000:")
      ? await passwordHash(password, salt)
      : await tokenHash(`${salt}:${password}`),
  );
}
export async function authRateLimit(db: D1Database, ip: string, scope: string) {
  const now = new Date().toISOString(),
    key = await tokenHash(`${ip}:${scope}`);
  const result = await db
    .prepare(
      `INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts`,
    )
    .bind(key, new Date(Date.now() + 15 * 60000).toISOString(), now, now)
    .first<{ attempts: number }>();
  if (result!.attempts > 10)
    throw new ApiError(
      429,
      "Too many account requests. Wait 15 minutes before trying again.",
      900,
    );
}
function text(value: unknown, min = 1, max = 1024): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  )
    throw new ApiError(400, "Check the account information and try again.");
  return value;
}
function normalizedAnswer(value: unknown) {
  return text(value, 2).trim().toLowerCase().replace(/\s+/g, " ");
}
export async function createPasswordChallenge(db: D1Database, player: Row) {
  const passwordChangeToken = token();
  await db
    .prepare(
      "INSERT INTO auth_challenges(token_hash,player_id,password_hash,expires_at) VALUES(?,?,?,?)",
    )
    .bind(
      await tokenHash(passwordChangeToken),
      player.id,
      player.password_hash,
      new Date(Date.now() + 15 * 60000).toISOString(),
    )
    .run();
  return { ok: true, mustChangePassword: true, passwordChangeToken };
}
export async function accountAction(
  env: AuthEnv,
  input: Row,
  action: string,
  ip: string,
): Promise<Row> {
  const db = env.DB;
  await authRateLimit(db, ip, action);
  if (action === "auth.register") {
    const displayName = text(input.displayName, 1, 80).trim(),
      email = text(input.email, 3, 254).trim().toLowerCase(),
      setup = text(input.setupPassword);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ApiError(400, "Enter a valid email address.");
    if (!env.REGISTRATION_PLAYER_KEY && !env.REGISTRATION_DM_KEY)
      throw new ApiError(
        503,
        "Registration is not configured. Ask the campaign administrator to set the registration secrets.",
      );
    const role =
      env.REGISTRATION_DM_KEY &&
      equal(await tokenHash(setup), await tokenHash(env.REGISTRATION_DM_KEY))
        ? "dm"
        : env.REGISTRATION_PLAYER_KEY &&
            equal(
              await tokenHash(setup),
              await tokenHash(env.REGISTRATION_PLAYER_KEY),
            )
          ? "player"
          : "";
    if (!role) throw new ApiError(400, "The shared setup password is invalid.");
    const id = "player-" + crypto.randomUUID(),
      salt = token(),
      hash = await passwordHash(setup, salt);
    const data = {
      playerId: id,
      displayName,
      email,
      role,
      active: true,
      territoriesEnabled: false,
      retainersEnabled: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    };
    const change = token();
    try {
      await db.batch([
        db
          .prepare(
            "INSERT INTO players(id,email,role,active,password_salt,password_hash,data) VALUES(?,?,?,1,?,?,?)",
          )
          .bind(id, email, role, salt, hash, JSON.stringify(data)),
        db
          .prepare("INSERT INTO auth_challenges VALUES(?,?,?,?)")
          .bind(
            await tokenHash(change),
            id,
            hash,
            new Date(Date.now() + 15 * 60000).toISOString(),
          ),
      ]);
    } catch (error) {
      if (
        await db
          .prepare("SELECT id FROM players WHERE email=? COLLATE NOCASE")
          .bind(email)
          .first()
      )
        throw new ApiError(
          409,
          "That email is already registered. Select the account and sign in, or use password recovery.",
        );
      throw error;
    }
    return { ok: true, mustChangePassword: true, passwordChangeToken: change };
  }
  if (action === "auth.password.change") {
    const hash = await tokenHash(text(input.passwordChangeToken));
    const challenge = await db
      .prepare(
        "SELECT c.player_id,c.password_hash,p.data FROM auth_challenges c JOIN players p ON p.id=c.player_id WHERE c.token_hash=? AND c.expires_at>? AND p.active=1 AND c.password_hash=p.password_hash",
      )
      .bind(hash, new Date().toISOString())
      .first<Row>();
    if (!challenge)
      throw new ApiError(
        401,
        "The password-change request has expired. Sign in again.",
      );
    const newPassword = text(input.newPassword, 10),
      question = text(input.recoveryQuestion, 5, 160).trim(),
      answer = normalizedAnswer(input.recoveryAnswer);
    const salt = token(),
      recoverySalt = token(),
      data = JSON.parse(challenge.data);
    Object.assign(data, {
      mustChangePassword: false,
      recoveryQuestion: question,
      recoveryAnswerSalt: recoverySalt,
      recoveryAnswerHash: await passwordHash(answer, recoverySalt),
    });
    const newHash = await passwordHash(newPassword, salt),
      sessionToken = token(),
      guard = token();
    await db.batch([
      db
        .prepare(
          "INSERT INTO transaction_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM auth_challenges c JOIN players p ON p.id=c.player_id WHERE c.token_hash=? AND c.expires_at>? AND c.password_hash=p.password_hash AND p.active=1) THEN 1 ELSE 0 END)",
        )
        .bind(guard, hash, new Date().toISOString()),
      db
        .prepare(
          "UPDATE players SET password_salt=?,password_hash=?,data=? WHERE id=?",
        )
        .bind(salt, newHash, JSON.stringify(data), challenge.player_id),
      db
        .prepare("DELETE FROM sessions WHERE player_id=?")
        .bind(challenge.player_id),
      db
        .prepare("DELETE FROM auth_challenges WHERE player_id=?")
        .bind(challenge.player_id),
      db
        .prepare("INSERT INTO sessions VALUES(?,?,?)")
        .bind(
          await tokenHash(sessionToken),
          challenge.player_id,
          new Date(Date.now() + 30 * 86400000).toISOString(),
        ),
      db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
    ]);
    return { ok: true, sessionToken, playerId: challenge.player_id };
  }
  const id = text(input.playerId, 1, 120),
    email = text(input.email, 3, 254).trim().toLowerCase();
  const player = await db
    .prepare(
      "SELECT * FROM players WHERE id=? AND email=? COLLATE NOCASE AND active=1",
    )
    .bind(id, email)
    .first<Row>();
  const data = player ? JSON.parse(player.data) : {};
  if (action === "auth.recovery.question") {
    if (!data.recoveryQuestion || !data.recoveryAnswerHash)
      throw new ApiError(
        400,
        "Password recovery is not available for that account.",
      );
    return { ok: true, recoveryQuestion: data.recoveryQuestion };
  }
  if (action === "auth.recovery.reset") {
    const answer = normalizedAnswer(input.recoveryAnswer),
      newPassword = text(input.newPassword, 10);
    if (
      !player ||
      !data.recoveryAnswerHash ||
      !(await passwordMatches(
        answer,
        String(data.recoveryAnswerSalt),
        data.recoveryAnswerHash,
      ))
    )
      throw new ApiError(
        400,
        "The account information or recovery answer is incorrect.",
      );
    const salt = token(),
      hash = await passwordHash(newPassword, salt),
      guard = token();
    data.mustChangePassword = false;
    await db.batch([
      db
        .prepare(
          "INSERT INTO transaction_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM players WHERE id=? AND password_hash=? AND data=? AND active=1) THEN 1 ELSE 0 END)",
        )
        .bind(guard, id, player.password_hash, player.data),
      db
        .prepare(
          "UPDATE players SET password_salt=?,password_hash=?,data=? WHERE id=?",
        )
        .bind(salt, hash, JSON.stringify(data), id),
      db.prepare("DELETE FROM sessions WHERE player_id=?").bind(id),
      db.prepare("DELETE FROM auth_challenges WHERE player_id=?").bind(id),
      db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
    ]);
    return { ok: true };
  }
  throw new ApiError(400, "Unknown account action.");
}

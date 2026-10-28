import {
  RecordFieldError,
  canonicalJSON,
  validateWalletBackupFields,
} from "../shared/records.mjs";
import { ApiError } from "./errors";
import { gameMutation, migratedGameActions } from "./game";
import {
  accountAction,
  createPasswordChallenge,
  passwordHash,
  passwordMatches,
} from "./accounts";
import { adminAction, adminActions } from "./admin";
import { mediaAction, mediaActions, serveMedia } from "./media";
import { deliverNotifications, queueJournal } from "./notifications";
import { runScheduled } from "./scheduled";
import { backendStatus } from "./backendStatus";
/** Campaign API and uploaded file storage backed by D1. */
export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  REGISTRATION_PLAYER_KEY?: string;
  REGISTRATION_DM_KEY?: string;
}
type Data = Record<string, any>;
type Player = {
  id: string;
  email: string;
  role: "dm" | "player";
  active: number;
  password_salt: string;
  password_hash: string;
  data: string;
  webhook_configured?: number;
};
type RecordRow = { id: string; updated_at: string; data: string };
function nextVersion(previous: string) {
  const parsed = Date.parse(previous);
  return new Date(
    Math.max(Date.now(), Number.isFinite(parsed) ? parsed + 1 : 0),
  ).toISOString();
}
const tabs = ["wallet", "journal", "retainers", "territories"];
const text = (value: unknown, max = 120) => {
  if (typeof value !== "string" || value.length > max)
    throw new ApiError(400, "Invalid text field.");
  return value.trim();
};
const required = (value: unknown, max = 120) => {
  const result = text(value, max);
  if (!result) throw new ApiError(400, "A required field is empty.");
  return result;
};
const number = (value: unknown, min: number, max: number) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new ApiError(400, "Invalid number field.");
  return value;
};
export function hexKey(value: string) {
  const key = value.trim().toLowerCase();
  return key && Number.isFinite(Number(key)) ? String(Number(key)) : key;
}
export async function digest(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function publicPlayer(player: Player) {
  const data = JSON.parse(player.data);
  return {
    playerId: player.id,
    displayName: String(data.displayName || ""),
    email: player.email,
    role: player.role,
    active: !!player.active,
    territoriesEnabled: !!data.territoriesEnabled,
    retainersEnabled: true,
    discordWebhookConfigured: !!player.webhook_configured,
  };
}
function publicCharacter(row: { data: string; version?: number }, dm: boolean) {
  const data = JSON.parse(row.data);
  const result: Data = {
    characterId: data.characterId,
    version: row.version ?? 1,
    playerId: data.playerId,
    name: data.name,
    class: data.class,
    level: data.level,
    portraitFileId: data.portraitFileId || "",
    portraitFileName: data.portraitFileName || "",
    discordConfigured:
      !!data.discordThreadId && !!(row as any).webhook_configured,
  };
  if (data.portraitFileId && /^(?:d1|r2):/.test(data.portraitFileId))
    result.portraitUrl = data.portraitUrl || "";
  else if (data.portraitFileId)
    result.portraitUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(data.portraitFileId)}&sz=w500`;
  if (dm) result.discordThreadId = data.discordThreadId || "";
  return result;
}
async function all<T>(
  db: D1Database,
  sql: string,
  ...args: any[]
): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
async function account(db: D1Database, player: Player) {
  const dm = player.role === "dm";
  const [players, characters] = await Promise.all([
    dm
      ? all<Player>(
          db,
          "SELECT p.*,EXISTS(SELECT 1 FROM discord_webhooks w WHERE w.player_id=p.id) AS webhook_configured FROM players p WHERE active = 1 ORDER BY id",
        )
      : Promise.resolve([]),
    all<{ data: string; version: number }>(
      db,
      `SELECT data, version, EXISTS(SELECT 1 FROM discord_webhooks w WHERE w.player_id=characters.player_id) AS webhook_configured FROM characters WHERE active = 1 ${dm ? "" : "AND player_id = ?"} ORDER BY id`,
      ...(dm ? [] : [player.id]),
    ),
  ]);
  return {
    currentPlayer: publicPlayer(player),
    players: players.map(publicPlayer),
    characters: characters.map((row) => publicCharacter(row, dm)),
  };
}
async function authenticated(
  db: D1Database,
  token: unknown,
  includeWebhook = true,
) {
  if (typeof token !== "string" || token.length > 200 || !token)
    throw new ApiError(401, "Session expired.");
  const player = await db
    .prepare(
      `SELECT p.*,${includeWebhook ? "EXISTS(SELECT 1 FROM discord_webhooks w WHERE w.player_id=p.id)" : "0"} AS webhook_configured FROM players p JOIN sessions s ON s.player_id = p.id WHERE s.token_hash = ? AND s.expires_at > ? AND p.active = 1`,
    )
    .bind(await digest(token), new Date().toISOString())
    .first<Player>();
  if (!player) throw new ApiError(401, "Session expired.");
  return player;
}
async function characterAccess(db: D1Database, player: Player, id: string) {
  const row = await db
    .prepare("SELECT * FROM characters WHERE id = ? AND active = 1")
    .bind(id)
    .first<{ id: string; player_id: string; data: string }>();
  if (!row || (player.role !== "dm" && row.player_id !== player.id))
    throw new ApiError(403, "Access denied.");
  return row;
}
const requireDm = (player: Player) => {
  if (player.role !== "dm")
    throw new ApiError(403, "Only the DM can perform this action.");
};
async function records(db: D1Database, kind: string, char: string) {
  return (
    await all<RecordRow>(
      db,
      `SELECT id, data, updated_at FROM records WHERE kind = ? AND character_id = ? ORDER BY ${kind === "journal" ? "updated_at DESC, id" : "id"}`,
      kind,
      char,
    )
  )
    .map((row) => JSON.parse(row.data))
    .filter((row) => kind !== "journal" || !row.deleted);
}
async function wallet(db: D1Database, char: string) {
  const [allTransactions, recurringExpenses] = await Promise.all([
    records(db, "transaction", char),
    records(db, "recurring", char),
  ]);
  const transactions = allTransactions
    .filter((row) => !row.deleted)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const balance = { pp: 0, gp: 0, sp: 0, cp: 0 };
  for (const row of transactions)
    for (const coin of ["pp", "gp", "sp", "cp"] as const)
      balance[coin] += row[coin];
  return { balance, transactions, recurringExpenses };
}
async function retainers(db: D1Database, char: string) {
  return (await records(db, "retainer", char))
    .filter((row) => row.active !== false)
    .map((row) => {
      delete row.loyalty;
      return row;
    });
}
async function territoryStatus(db: D1Database, player: Player, char: string) {
  const dm = player.role === "dm";
  const available = dm || publicPlayer(player).territoriesEnabled;
  const base = {
    retainers: await retainers(db, char),
    territories: [] as Data[],
    scoutingMissions: [] as Data[],
    customMissions: [] as Data[],
    territoryHexes: [] as Data[],
  };
  if (!available) return base;
  const [territoryRows, scouts, custom, hexes] = await Promise.all([
    all<{ data: string }>(
      db,
      "SELECT data FROM territories WHERE character_id = ? AND active = 1 ORDER BY id",
      char,
    ),
    records(db, "scouting", char),
    records(db, "custom", char),
    records(db, "hex", char),
  ]);
  const territories = territoryRows.map((row) => {
    const data = JSON.parse(row.data);
    data.scoutingWebhookConfigured = !!data.scoutingWebhookUrl;
    delete data.scoutingWebhookUrl;
    for (const name of ["map", "poiMap"])
      if (data[name + "FileId"] && !/^(?:d1|r2):/.test(data[name + "FileId"]))
        data[name + "Url"] =
          `https://drive.google.com/thumbnail?id=${encodeURIComponent(data[name + "FileId"])}&sz=w2400`;
    if (!dm)
      for (const name of [
        "poiMapFileId",
        "poiMapFileName",
        "workbookFileId",
        "workbookFileName",
      ])
        delete data[name];
    return data;
  });
  const activeIds = new Set(territories.map((row) => row.territoryId));
  const revealed = new Set(territories.map((row) => `${row.territoryId}::4.4`));
  for (const row of scouts)
    if (row.status === "completed" && row.resultsViewedAt)
      revealed.add(`${row.territoryId}::${hexKey(row.hexNumber)}`);
  for (const row of hexes)
    if (row.dmRevealed)
      revealed.add(`${row.territoryId}::${hexKey(row.hexNumber)}`);
  const territoryHexes = hexes
    .filter((row) => activeIds.has(row.territoryId))
    .map((row) => {
      row.isDiscovered = revealed.has(
        `${row.territoryId}::${hexKey(row.hexNumber)}`,
      );
      if (!dm) {
        delete row.dmOnlyInformation;
        delete row.reaction;
      }
      return row;
    })
    .filter((row) => dm || row.isDiscovered);
  const scoutingMissions = scouts
    .filter(
      (row) => activeIds.has(row.territoryId) && row.status !== "cancelled",
    )
    .map((row) => {
      if (!dm)
        for (const name of [
          "startedAt",
          "startedBy",
          "durationDays",
          "completesAt",
          "completedAt",
          "encounterRoll",
          "encounterOccurred",
          "reactionDisposition",
          "reactionModifier",
          "reactionRoll",
          "adjustedReactionRoll",
          "reactionResult",
          "attackThac0",
          "attackRoll",
          "attackNeeded",
          "attackHit",
          "attackTargetArmorClass",
          "attackTargetSoldierType",
          "scoutMoraleRoll",
          "scoutMoraleBonus",
          "scoutMoralePassed",
          "attackerMoraleRoll",
          "attackerMoraleBonus",
          "attackerMoralePassed",
          "casualtyRoll",
          "serjeantsChecked",
          "serjeantsKilled",
          "resolvedAt",
        ])
          delete row[name];
      return row;
    });
  return {
    ...base,
    territories,
    territoryHexes,
    scoutingMissions,
    customMissions: custom.filter((row) =>
      ["scheduled", "active"].includes(row.status),
    ),
  };
}
async function revision(db: D1Database, char: string) {
  const result: Data = { wallet: 0, journal: 0, retainers: 0, territories: 0 };
  for (const row of await all<{ tab: string; revision: number }>(
    db,
    "SELECT tab, revision FROM revisions WHERE character_id = ?",
    char,
  ))
    result[row.tab] = row.revision;
  return result;
}
async function login(db: D1Database, input: Data, ip: string) {
  const id = input.playerId === undefined ? null : required(input.playerId);
  const email = required(input.email, 254).toLowerCase();
  if (
    typeof input.password !== "string" ||
    !input.password ||
    input.password.length > 1024
  )
    throw new ApiError(400, "Invalid password field.");
  const password = input.password;
  const now = new Date().toISOString();
  // Persist throttling across Worker instances. Never store the raw address or credentials.
  // Old and new clients share the same normalized account throttle bucket.
  const key = await digest("login:" + ip + ":" + email);
  const attempt = await db
    .prepare(
      `INSERT INTO login_attempts(key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING attempts, expires_at`,
    )
    .bind(key, new Date(Date.now() + 15 * 60 * 1000).toISOString(), now, now)
    .first<{ attempts: number; expires_at: string }>();
  if (attempt!.attempts > 10)
    throw new ApiError(
      429,
      "Too many sign-in attempts. Wait up to 15 minutes before trying again.",
      Math.max(
        1,
        Math.ceil((Date.parse(attempt!.expires_at) - Date.now()) / 1000),
      ),
    );
  const player = await db
    .prepare(
      "SELECT * FROM players WHERE email = ? COLLATE NOCASE AND active = 1 AND (? IS NULL OR id = ?)",
    )
    .bind(email, id, id)
    .first<Player>();
  if (
    !player ||
    !(await passwordMatches(
      password,
      player.password_salt,
      player.password_hash,
    ))
  )
    throw new ApiError(400, "Incorrect email or password.");
  if (JSON.parse(player.data).mustChangePassword)
    return createPasswordChallenge(db, player);
  // Upgrade imported hashes after a successful login without invalidating an
  // intervening password reset. Existing sessions remain hashed in D1.
  if (!player.password_hash.startsWith("pbkdf2:")) {
    const salt = crypto.randomUUID(),
      upgraded = await passwordHash(password, salt);
    const updated = await db
      .prepare(
        "UPDATE players SET password_salt=?,password_hash=? WHERE id=? AND password_hash=? RETURNING id",
      )
      .bind(salt, upgraded, player.id, player.password_hash)
      .first();
    if (!updated)
      throw new ApiError(409, "Account credentials changed. Sign in again.");
    player.password_salt = salt;
    player.password_hash = upgraded;
  }
  const sessionToken = crypto.randomUUID() + crypto.randomUUID();
  const sessionWrite = await db.batch([
    db
      .prepare(
        "INSERT INTO sessions(token_hash, player_id, expires_at) SELECT ?,id,? FROM players WHERE id=? AND active=1 AND password_hash=?",
      )
      .bind(
        await digest(sessionToken),
        new Date(Date.now() + 30 * 86400000).toISOString(),
        player.id,
        player.password_hash,
      ),
    db
      .prepare("DELETE FROM login_attempts WHERE key = ? OR expires_at <= ?")
      .bind(key, now),
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
  ]);
  if (sessionWrite[0].meta.changes !== 1)
    throw new ApiError(409, "Account credentials changed. Sign in again.");
  return {
    ok: true,
    mustChangePassword: false,
    sessionToken,
    ...(await account(db, player)),
  };
}
async function journalMutation(
  db: D1Database,
  player: Player,
  input: Data,
  action: string,
  char: string,
) {
  if (action === "journal.create") {
    const mutation = required(input.clientMutationId);
    const title = required(input.title, 160),
      notes = required(input.notes, 12000),
      category = text(input.category || "", 500);
    const owner = await characterAccess(db, player, char);
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const entry = {
      entryId: id,
      characterId: char,
      playerId: owner.player_id,
      title,
      category,
      notes,
      clientMutationId: mutation,
      createdAt: now,
      updatedAt: now,
    };
    await db
      .prepare(
        `INSERT INTO records(kind,id,character_id,mutation_id,updated_at,data) VALUES ('journal',?,?,?,?,?)
      ON CONFLICT(kind,character_id,mutation_id) WHERE mutation_id IS NOT NULL DO NOTHING`,
      )
      .bind(id, char, mutation, now, JSON.stringify(entry))
      .run();
    const saved = await db
      .prepare(
        "SELECT data FROM records WHERE kind = 'journal' AND character_id = ? AND mutation_id = ?",
      )
      .bind(char, mutation)
      .first<{ data: string }>();
    const result = JSON.parse(saved!.data);
    if (result.deleted)
      throw new ApiError(
        409,
        "Conflict: this journal entry was deleted in the campaign.",
      );
    if (
      result.title !== title ||
      result.notes !== notes ||
      result.category !== category
    )
      throw new ApiError(
        409,
        "Conflict: this mutation ID was used for another change.",
      );
    return { ok: true, entry: result };
  }
  const id = required(input.entryId),
    expected = required(input.expectedUpdatedAt, 80);
  const row = await db
    .prepare(
      "SELECT data, updated_at FROM records WHERE kind = 'journal' AND id = ? AND character_id = ?",
    )
    .bind(id, char)
    .first<RecordRow>();
  if (!row || JSON.parse(row.data).deleted || row.updated_at !== expected)
    throw new ApiError(409, "Conflict: the journal changed in the campaign.");
  const updatedAt = nextVersion(row.updated_at);
  if (action === "journal.delete") {
    const result = await db
      .prepare(
        "UPDATE records SET data = json_set(data, '$.deleted', json('true'), '$.updatedAt', ?), updated_at = ? WHERE kind = 'journal' AND id = ? AND character_id = ? AND updated_at = ? AND COALESCE(json_extract(data, '$.deleted'),0) = 0",
      )
      .bind(updatedAt, updatedAt, id, char, expected)
      .run();
    if (!result.meta.changes)
      throw new ApiError(409, "Conflict: the journal changed in the campaign.");
    return { ok: true, deletedEntryId: id };
  }
  const entry = {
    ...JSON.parse(row.data),
    title: required(input.title, 160),
    category: text(input.category || "", 500),
    notes: required(input.notes, 12000),
    updatedAt,
  };
  const result = await db
    .prepare(
      "UPDATE records SET data = ?, updated_at = ? WHERE kind = 'journal' AND id = ? AND character_id = ? AND updated_at = ? AND COALESCE(json_extract(data, '$.deleted'),0) = 0",
    )
    .bind(JSON.stringify(entry), updatedAt, id, char, expected)
    .run();
  if (!result.meta.changes)
    throw new ApiError(409, "Conflict: the journal changed in the campaign.");
  return { ok: true, entry };
}
async function upsertHex(
  db: D1Database,
  player: Player,
  input: Data,
  char: string,
) {
  requireDm(player);
  const territory = required(input.territoryId),
    hex = required(input.hexNumber, 40);
  const parent = await db
    .prepare(
      "SELECT id FROM territories WHERE id = ? AND character_id = ? AND active = 1",
    )
    .bind(territory, char)
    .first();
  if (!parent) throw new ApiError(400, "Territory not found.");
  if (input.revealOnly !== undefined && typeof input.revealOnly !== "boolean")
    throw new ApiError(400, "Invalid reveal mode.");
  const revealOnly =
    input.revealOnly === true ||
    (input.dmRevealed !== undefined &&
      input.title === undefined &&
      input.contents === undefined);
  if (
    (revealOnly || input.dmRevealed !== undefined) &&
    typeof input.dmRevealed !== "boolean"
  )
    throw new ApiError(400, "Invalid reveal flag.");
  const expected =
    input.expectedUpdatedAt === undefined
      ? ""
      : text(input.expectedUpdatedAt, 80);
  for (let attempt = 0; attempt < (revealOnly ? 3 : 1); attempt++) {
    const existing = await db
      .prepare(
        "SELECT id, data, updated_at FROM records WHERE kind = 'hex' AND territory_id = ? AND character_id = ? AND hex_key = ?",
      )
      .bind(territory, char, hexKey(hex))
      .first<RecordRow>();
    if (
      !revealOnly &&
      (existing ? existing.updated_at !== expected : !!expected)
    )
      throw new ApiError(
        409,
        "Conflict: the hex changed in the campaign. Load the latest hex before editing.",
      );
    const now = existing
      ? nextVersion(existing.updated_at)
      : new Date().toISOString();
    const patch: Data = { updatedAt: now };
    if (revealOnly) patch.dmRevealed = input.dmRevealed;
    else {
      patch.hexNumber = hex;
      patch.mapX = number(input.mapX, 0, 100);
      patch.mapY = number(input.mapY, 0, 100);
      for (const name of ["title", "contents"])
        if (input[name] !== undefined)
          patch[name] = text(input[name], name === "title" ? 160 : 12000);
      if (input.dmRevealed !== undefined) patch.dmRevealed = input.dmRevealed;
    }
    const base = {
      hexId: crypto.randomUUID(),
      characterId: char,
      territoryId: territory,
      hexNumber: hex,
      mapX: existing ? 0 : number(input.mapX, 0, 100),
      mapY: existing ? 0 : number(input.mapY, 0, 100),
      title: "",
      contents: "",
      dmRevealed: false,
      createdAt: now,
      ...patch,
    };
    // Conditional mutation protects edits. Reveal retries re-read versions and patch visibility only.
    const row = await db
      .prepare(
        `INSERT INTO records(kind,id,character_id,territory_id,hex_key,updated_at,data) VALUES ('hex',?,?,?,?,?,?)
      ON CONFLICT(territory_id,hex_key) WHERE kind = 'hex' DO UPDATE SET data = json_patch(records.data, ?), updated_at = excluded.updated_at
      WHERE records.updated_at = ? RETURNING data`,
      )
      .bind(
        base.hexId,
        char,
        territory,
        hexKey(hex),
        now,
        JSON.stringify(base),
        JSON.stringify(patch),
        existing?.updated_at ?? null,
      )
      .first<{ data: string }>();
    if (row) return { ok: true, hex: JSON.parse(row.data) };
  }
  throw new ApiError(
    409,
    "Conflict: the hex changed in the campaign. Retry after checking the latest copy.",
  );
}

async function characterMutation(
  db: D1Database,
  player: Player,
  input: Data,
  action: string,
) {
  if (action === "character.create") {
    const mutationId = required(input.clientMutationId);
    const owner = input.targetPlayerId
      ? required(input.targetPlayerId)
      : player.id;
    if (owner !== player.id) requireDm(player);
    const exists = await db
      .prepare("SELECT id FROM players WHERE id = ? AND active = 1")
      .bind(owner)
      .first();
    if (!exists) throw new ApiError(400, "Player not found.");
    const data = {
      characterId: crypto.randomUUID(),
      playerId: owner,
      name: required(input.name),
      class: required(input.class, 80),
      level: number(input.level, 1, 100),
      active: true,
      createdAt: new Date().toISOString(),
    };
    if (!Number.isInteger(data.level))
      throw new ApiError(400, "Level must be a whole number.");
    const payloadHash = await digest(
      canonicalJSON({
        owner,
        name: data.name,
        class: data.class,
        level: data.level,
      }),
    );
    await db
      .prepare(
        `INSERT INTO characters(id,player_id,active,data,creation_player_id,creation_mutation_id,creation_payload_hash) VALUES (?,?,1,?,?,?,?)
      ON CONFLICT(creation_player_id,creation_mutation_id) WHERE creation_mutation_id IS NOT NULL DO NOTHING`,
      )
      .bind(
        data.characterId,
        owner,
        JSON.stringify(data),
        player.id,
        mutationId,
        payloadHash,
      )
      .run();
    const saved = await db
      .prepare(
        "SELECT data,version,active,creation_payload_hash FROM characters WHERE creation_player_id = ? AND creation_mutation_id = ?",
      )
      .bind(player.id, mutationId)
      .first<{
        data: string;
        version: number;
        active: number;
        creation_payload_hash: string;
      }>();
    if (!saved || !saved.active || saved.creation_payload_hash !== payloadHash)
      throw new ApiError(
        409,
        "Conflict: this character creation request was already used or the character was deleted. Check the roster before creating another character.",
      );
    return {
      ok: true,
      character: publicCharacter(saved, player.role === "dm"),
    };
  }
  const id = required(input.characterId);
  await characterAccess(db, player, id);
  const expectedVersion = number(
    input.expectedVersion,
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if (!Number.isSafeInteger(expectedVersion))
    throw new ApiError(
      400,
      "Invalid character version. Refresh the roster before trying again.",
    );
  if (action === "character.delete") {
    // Retain related history and the account, but remove the character from active access.
    const result = await db
      .prepare(
        "UPDATE characters SET active = 0, version = version + 1, data = json_set(data,'$.active',json('false')) WHERE id = ? AND active = 1 AND version = ?",
      )
      .bind(id, expectedVersion)
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        409,
        "Conflict: the character changed. Refresh the roster and review it before deleting.",
      );
    return { ok: true, deletedCharacterId: id };
  }
  const patch = {
    name: required(input.name),
    class: required(input.class, 80),
    level: number(input.level, 1, 100),
  };
  if (!Number.isInteger(patch.level))
    throw new ApiError(400, "Level must be a whole number.");
  const row = await db
    .prepare(
      "UPDATE characters SET data = json_patch(data,?), version = version + 1 WHERE id = ? AND active = 1 AND version = ? RETURNING data,version",
    )
    .bind(JSON.stringify(patch), id, expectedVersion)
    .first<{ data: string; version: number }>();
  if (!row)
    throw new ApiError(409, "Conflict: the character changed in the campaign.");
  return { ok: true, character: publicCharacter(row, player.role === "dm") };
}
type BackupRow = {
  id: string;
  backed_up_at: string;
  data: string;
  payload_hash: string;
  sequence: number;
  base_backup_id: string | null;
};
async function walletBackup(
  db: D1Database,
  player: Player,
  input: Data,
  action: string,
  char: string,
) {
  if (action === "wallet.backup.load") {
    const row = await db
      .prepare(
        "SELECT id,backed_up_at,data FROM wallet_backups WHERE character_id = ? ORDER BY sequence DESC LIMIT 1",
      )
      .bind(char)
      .first<BackupRow>();
    if (!row)
      throw new ApiError(404, "No wallet backup exists for this character.");
    const payload = JSON.parse(row.data);
    validateWalletBackupFields(
      payload.transactions,
      payload.recurringExpenses,
      char,
    );
    return {
      ok: true,
      characterId: char,
      backupId: row.id,
      backedUpAt: row.backed_up_at,
      transactions: payload.transactions,
      recurringExpenses: payload.recurringExpenses,
    };
  }
  const mutationId = required(input.clientMutationId);
  const expectedBackupId = text(input.expectedBackupId);
  try {
    validateWalletBackupFields(
      input.transactions,
      input.recurringExpenses,
      char,
    );
  } catch (error) {
    if (!(error instanceof RecordFieldError)) throw error;
    throw new ApiError(
      400,
      `Wallet backup ${error.path}: expected ${error.expected}. The saved backup was kept.`,
    );
  }
  const payload = canonicalJSON({
    transactions: input.transactions,
    recurringExpenses: input.recurringExpenses,
  });
  const hash = await digest(payload),
    now = new Date().toISOString(),
    id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO wallet_backups(id,character_id,player_id,mutation_id,payload_hash,backed_up_at,data,base_backup_id)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ? AND active = 1)
      AND COALESCE((SELECT id FROM wallet_backups WHERE character_id = ? ORDER BY sequence DESC LIMIT 1),'') = ?
    ON CONFLICT(character_id,player_id,mutation_id) DO NOTHING`,
    )
    .bind(
      id,
      char,
      player.id,
      mutationId,
      hash,
      now,
      payload,
      expectedBackupId,
      char,
      char,
      expectedBackupId,
    )
    .run();
  const saved = await db
    .prepare(
      "SELECT id,backed_up_at,payload_hash,sequence,base_backup_id FROM wallet_backups WHERE character_id = ? AND player_id = ? AND mutation_id = ?",
    )
    .bind(char, player.id, mutationId)
    .first<BackupRow>();
  if (!saved)
    throw new ApiError(
      409,
      "Conflict: a newer campaign wallet backup exists or this character is no longer available. Your local wallet was kept. Review the campaign backup before replacing it.",
    );
  if (saved.payload_hash !== hash || saved.base_backup_id !== expectedBackupId)
    throw new ApiError(
      409,
      "Conflict: this backup request ID was already used for a different ledger. Your saved backup was kept.",
    );
  const latest = await db
    .prepare(
      "SELECT id FROM wallet_backups WHERE character_id = ? ORDER BY sequence DESC LIMIT 1",
    )
    .bind(char)
    .first<{ id: string }>();
  return {
    ok: true,
    characterId: char,
    backupId: saved.id,
    isLatest: latest?.id === saved.id,
    backedUpAt: saved.backed_up_at,
    transactionCount: input.transactions.length,
    recurringExpenseCount: input.recurringExpenses.length,
  };
}
async function dispatch(request: Request, env: Env, input: Data) {
  const db = env.DB,
    action = String(input.action || "health"),
    read = request.method === "GET";
  if (read && action === "health")
    return {
      ok: true,
      service: "Player Character Manager D1",
      stage: "migration",
    };
  if (read && action === "auth.options") {
    const rows = await all<Player>(
      db,
      "SELECT p.*,EXISTS(SELECT 1 FROM discord_webhooks w WHERE w.player_id=p.id) AS webhook_configured FROM players p WHERE active = 1 ORDER BY id",
    );
    return {
      ok: true,
      players: rows.map((row) => ({
        playerId: row.id,
        displayName: publicPlayer(row).displayName,
      })),
    };
  }
  if (!read && action === "auth.login")
    return login(db, input, request.headers.get("CF-Connecting-IP") || "local");
  if (!read && action === "auth.logout") {
    if (typeof input.sessionToken === "string")
      await db
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .bind(await digest(input.sessionToken))
        .run();
    return { ok: true };
  }
  if (
    !read &&
    [
      "auth.register",
      "auth.password.change",
      "auth.recovery.question",
      "auth.recovery.reset",
    ].includes(action)
  ) {
    const result = await accountAction(
      env,
      input,
      action,
      request.headers.get("CF-Connecting-IP") || "local",
    );
    if (action === "auth.password.change") {
      const current = await authenticated(db, result.sessionToken);
      return {
        ok: true,
        sessionToken: result.sessionToken,
        ...(await account(db, current)),
      };
    }
    return result;
  }
  const player = await authenticated(
    db,
    input.sessionToken,
    action !== "backend.status",
  );
  if (read && action === "backend.status") {
    requireDm(player);
    return backendStatus(db);
  }
  if (!read && adminActions.has(action)) {
    const result = await adminAction(db, input, action, player);
    if (result.playerRow)
      return { ok: true, player: publicPlayer(result.playerRow as Player) };
    if (result.characterRow)
      return {
        ok: true,
        character: publicCharacter(result.characterRow as any, true),
      };
    return result;
  }
  if (!read && mediaActions.has(action)) {
    const char = required(input.characterId);
    await characterAccess(db, player, char);
    const result = await mediaAction(
      request,
      env,
      {
        ...publicPlayer(player),
        playerId: player.id,
        sessionHash: await digest(input.sessionToken),
      },
      input,
      action,
    );
    if (result.character) {
      const row = await db
        .prepare(
          "SELECT data,version,EXISTS(SELECT 1 FROM discord_webhooks w WHERE w.player_id=characters.player_id) AS webhook_configured FROM characters WHERE id=?",
        )
        .bind(char)
        .first<{ data: string; version: number }>();
      result.character = publicCharacter(row!, player.role === "dm");
    }
    if (result.territory) {
      result.territory.scoutingWebhookConfigured =
        !!result.territory.scoutingWebhookUrl;
      delete result.territory.scoutingWebhookUrl;
    }
    return result;
  }
  if (!read && action === "journal.discord.send") {
    await characterAccess(db, player, required(input.characterId));
    const ids = await queueJournal(db, player, input);
    for (const id of ids) await deliverNotifications(db, fetch, id);
    const sent = await db
      .prepare(
        "SELECT count(*) AS n FROM notification_outbox WHERE id IN(SELECT value FROM json_each(?)) AND status='sent'",
      )
      .bind(JSON.stringify(ids))
      .first<{ n: number }>();
    if (sent?.n !== ids.length)
      throw new ApiError(
        503,
        "The Discord message is queued but delivery is not confirmed. Try again later.",
      );
    return { ok: true, messagesSent: ids.length };
  }
  if (!read && migratedGameActions.has(action)) {
    const char = required(input.characterId);
    await characterAccess(db, player, char);
    return gameMutation(
      db,
      {
        ...publicPlayer(player),
        playerId: player.id,
        sessionHash: await digest(input.sessionToken),
      },
      input,
      action,
    );
  }
  if (
    !read &&
    ["character.create", "character.update", "character.delete"].includes(
      action,
    )
  )
    return characterMutation(db, player, input, action);
  if (read && ["account-roster", "player-roster"].includes(action))
    return { ok: true, ...(await account(db, player)) };
  if (read && action === "bootstrap") {
    const roster = await account(db, player);
    const char = input.characterId || roster.characters[0]?.characterId || "";
    if (char) await characterAccess(db, player, char);
    const [money, territory, journal, settings] = await Promise.all([
      wallet(db, char),
      territoryStatus(db, player, char),
      records(db, "journal", char),
      all<{ key: string; value: string }>(db, "SELECT key,value FROM settings"),
    ]);
    const config = Object.fromEntries(
      settings.map((row) => [row.key, row.value]),
    );
    return {
      ok: true,
      ...roster,
      selectedCharacterId: char,
      ...money,
      ...territory,
      journal,
      campaignName: config.campaignName || "Player Character Manager",
      coinWeightPerPound: Number(config.coinWeightPerPound) || 10,
      discordWebhookConfigured: !!player.webhook_configured,
      permissions: {
        isDm: player.role === "dm",
        territories:
          player.role === "dm" || publicPlayer(player).territoriesEnabled,
        retainers: true,
        playerManagement: player.role === "dm",
      },
    };
  }
  const supported = read
    ? [
        "journal-status",
        "retainer-status",
        "territory-status",
        "wallet",
        "sync-revisions",
      ]
    : [
        "journal.create",
        "journal.update",
        "journal.delete",
        "territory.hex.upsert",
        "tab.push",
        "wallet.backup.save",
        "wallet.backup.load",
      ];
  if (!supported.includes(action))
    throw new ApiError(400, "Unknown campaign operation.");
  const char = required(input.characterId);
  await characterAccess(db, player, char);
  if (read) {
    if (action === "journal-status")
      return {
        ok: true,
        characterId: char,
        journal: await records(db, "journal", char),
      };
    if (action === "retainer-status")
      return {
        ok: true,
        characterId: char,
        retainers: await retainers(db, char),
      };
    if (action === "territory-status")
      return {
        ok: true,
        characterId: char,
        ...(await territoryStatus(db, player, char)),
      };
    if (action === "wallet")
      return { ok: true, characterId: char, ...(await wallet(db, char)) };
    if (action === "sync-revisions")
      return {
        ok: true,
        characterId: char,
        revisions: await revision(db, char),
      };
  } else {
    if (["wallet.backup.save", "wallet.backup.load"].includes(action))
      return walletBackup(db, player, input, action, char);
    if (["journal.create", "journal.update", "journal.delete"].includes(action))
      return journalMutation(db, player, input, action, char);
    if (action === "territory.hex.upsert")
      return upsertHex(db, player, input, char);
    if (action === "tab.push") {
      requireDm(player);
      if (!tabs.includes(input.tab)) throw new ApiError(400, "Unknown tab.");
      const updatedAt = new Date().toISOString();
      const row = await db
        .prepare(
          `INSERT INTO revisions(character_id,tab,revision,updated_at) VALUES (?,?,1,?)
        ON CONFLICT(character_id,tab) DO UPDATE SET revision = revision+1, updated_at = excluded.updated_at RETURNING revision`,
        )
        .bind(char, input.tab, updatedAt)
        .first<{ revision: number }>();
      return {
        ok: true,
        characterId: char,
        tab: input.tab,
        revision: row!.revision,
        updatedAt,
      };
    }
  }
  throw new ApiError(400, "Unknown campaign operation.");
}
const knownActions = new Set([
  ...migratedGameActions,
  ...adminActions,
  ...mediaActions,
  "journal.discord.send",
  "health",
  "backend.status",
  "auth.options",
  "auth.login",
  "auth.logout",
  "auth.register",
  "auth.password.change",
  "auth.recovery.question",
  "auth.recovery.reset",
  "character.create",
  "character.update",
  "character.delete",
  "account-roster",
  "player-roster",
  "bootstrap",
  "journal-status",
  "retainer-status",
  "territory-status",
  "wallet",
  "sync-revisions",
  "journal.create",
  "journal.update",
  "journal.delete",
  "territory.hex.upsert",
  "tab.push",
  "wallet.backup.save",
  "wallet.backup.load",
]);
function failureMetadata(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const failure = /no such table|no such column|schema/i.test(message)
    ? "database_schema"
    : /constraint|foreign key|unique/i.test(message)
      ? "database_constraint"
      : /limit|quota|too many/i.test(message)
        ? "database_limit"
        : /D1|database|SQLITE/i.test(message)
          ? "database_error"
          : "internal_error";
  const table = /no such table:\s*([a-z_]+)/i.exec(message)?.[1];
  const resource =
    table &&
    [
      "players",
      "characters",
      "territories",
      "records",
      "revisions",
      "sessions",
      "settings",
      "migration_archive",
      "login_attempts",
      "wallet_backups",
    ].includes(table)
      ? table
      : undefined;
  return { failure, ...(resource ? { resource } : {}) };
}
const errorCodes: Record<number, string> = {
  400: "invalid_request",
  404: "not_found",
  401: "session_expired",
  403: "permission_denied",
  405: "invalid_request",
  409: "conflict",
  413: "invalid_request",
  429: "rate_limited",
  501: "not_implemented",
  503: "service_unavailable",
};
export default {
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx?: ExecutionContext,
  ) {
    await runScheduled(env.DB);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    let action = "unknown";
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Request-ID": requestId,
    });
    if (origin && allowed.includes(origin)) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Content-Type");
      headers.set("Access-Control-Expose-Headers", "X-Request-ID, Retry-After");
    }
    try {
      if (origin && !allowed.includes(origin))
        throw new ApiError(403, "Origin is not allowed.");
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      const mediaPath = /^\/files\/([a-f0-9-]{36})$/.exec(
        new URL(request.url).pathname,
      );
      if (request.method === "GET" && mediaPath) {
        const response = await serveMedia(request, env, mediaPath[1]);
        for (const [name, value] of headers)
          if (
            name.startsWith("access-control-") ||
            name === "vary" ||
            name === "x-request-id"
          )
            response.headers.set(name, value);
        return response;
      }
      if (!["GET", "POST"].includes(request.method))
        throw new ApiError(405, "Method not allowed.");
      let input: Data;
      if (request.method === "GET")
        input = Object.fromEntries(new URL(request.url).searchParams);
      else {
        // Enforce a limit while streaming, including requests without Content-Length.
        const reader = request.body?.getReader();
        if (!reader) throw new ApiError(400, "Missing JSON request.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 8 * 1024 * 1024) {
            await reader.cancel();
            throw new ApiError(413, "Request too large.");
          }
          chunks.push(value);
        }
        const buffer = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          buffer.set(chunk, offset);
          offset += chunk.length;
        }
        try {
          input = JSON.parse(new TextDecoder().decode(buffer));
        } catch {
          throw new ApiError(400, "Invalid JSON request.");
        }
        if (!input || typeof input !== "object" || Array.isArray(input))
          throw new ApiError(400, "Invalid JSON request.");
      }
      action = knownActions.has(input.action)
        ? input.action
        : input.action
          ? "unknown"
          : "health";
      const data = await dispatch(request, env, input);
      return new Response(JSON.stringify(data), { headers });
    } catch (error) {
      const known = error instanceof ApiError;
      if (!known)
        console.error("campaign_request_failed", {
          requestId,
          action,
          ...failureMetadata(error),
        });
      if (known && error.retryAfterSeconds !== undefined)
        headers.set("Retry-After", String(error.retryAfterSeconds));
      return new Response(
        JSON.stringify({
          ok: false,
          code: known
            ? errorCodes[error.status] || "invalid_request"
            : "internal_error",
          requestId,
          error: known
            ? error.message
            : `The campaign service could not complete the request. Reference: ${requestId}.`,
        }),
        { status: known ? error.status : 500, headers },
      );
    }
  },
};

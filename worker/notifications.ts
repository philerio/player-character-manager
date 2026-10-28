import { ApiError } from "./errors";
import { validWebhook } from "./admin";
import type { Row } from "./ruleContext";
export async function queueJournal(db: D1Database, player: Row, input: Row) {
  const row = await db
    .prepare(
      "SELECT data,updated_at FROM records WHERE kind='journal' AND id=? AND character_id=? AND NOT COALESCE(json_extract(data,'$.deleted'),0)",
    )
    .bind(String(input.entryId || ""), String(input.characterId || ""))
    .first<{ data: string; updated_at: string }>();
  if (!row) throw new ApiError(404, "Journal entry not found.");
  const entry = JSON.parse(row.data);
  const baseId = `journal:${entry.entryId}:${row.updated_at}`;
  const character = await db
    .prepare("SELECT data FROM characters WHERE id=?")
    .bind(input.characterId)
    .first<{ data: string }>();
  const characterData = JSON.parse(character!.data);
  const configured = await db
    .prepare("SELECT url FROM discord_webhooks WHERE player_id=?")
    .bind(characterData.playerId)
    .first();
  if (!configured || !/^\d{17,20}$/.test(characterData.discordThreadId || ""))
    throw new ApiError(
      400,
      "The DM has not configured Discord for this character.",
    );
  const now = new Date().toISOString();
  const parts = String(entry.notes || "").match(/[\s\S]{1,3500}/gu) || [""];
  const ids = parts.map((_, index) => baseId + ":" + index);
  await db.batch(
    parts.map((notes, index) =>
      db
        .prepare(
          "INSERT INTO notification_outbox(id,character_id,event,data,next_attempt_at,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          ids[index],
          input.characterId,
          "journal",
          JSON.stringify({
            ...entry,
            notes,
            title:
              entry.title +
              (parts.length > 1 ? ` (${index + 1}/${parts.length})` : ""),
          }),
          now,
          now,
        ),
    ),
  );
  return ids;
}
/** Durable delivery, with a lease to prevent concurrent cron/request sends. */
export async function deliverNotifications(
  db: D1Database,
  send: typeof fetch = fetch,
  onlyId?: string,
  limit = 5,
) {
  const now = new Date().toISOString();
  const pending = await db
    .prepare(
      `SELECT id FROM notification_outbox WHERE status='pending' AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?) ${onlyId ? "AND id=?" : ""} ORDER BY created_at LIMIT ?`,
    )
    .bind(
      now,
      now,
      ...(onlyId ? [onlyId] : []),
      Math.min(5, Math.max(1, limit)),
    )
    .all<{ id: string }>();
  for (const item of pending.results) {
    const lease = new Date(Date.now() + 60000).toISOString();
    const event = await db
      .prepare(
        "UPDATE notification_outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND (lease_until IS NULL OR lease_until<=?) RETURNING *",
      )
      .bind(lease, item.id, now)
      .first<Row>();
    if (!event) continue;
    const row = await db
      .prepare(
        "SELECT c.data,w.url FROM characters c LEFT JOIN discord_webhooks w ON w.player_id=c.player_id WHERE c.id=? AND c.active=1",
      )
      .bind(event.character_id)
      .first<{ data: string; url: string | null }>();
    if (!row) {
      await db
        .prepare(
          "UPDATE notification_outbox SET status='cancelled',lease_until=NULL WHERE id=? AND lease_until=?",
        )
        .bind(item.id, lease)
        .run();
      continue;
    }
    const character = JSON.parse(row.data),
      data = JSON.parse(event.data);
    let webhook = row.url || "";
    if (event.event === "scouting" && data.territoryId) {
      const t = await db
        .prepare(
          "SELECT data FROM territories WHERE id=? AND character_id=? AND active=1",
        )
        .bind(data.territoryId, event.character_id)
        .first<{ data: string }>();
      if (t) webhook = JSON.parse(t.data).scoutingWebhookUrl || webhook;
    }
    try {
      if (!webhook) throw new Error("not_configured");
      const url = new URL(validWebhook(webhook));
      if (character.discordThreadId) {
        if (!/^\d{17,20}$/.test(character.discordThreadId))
          throw new Error("not_configured");
        url.searchParams.set("thread_id", character.discordThreadId);
      }
      url.searchParams.set("wait", "true");
      const title =
        event.event === "journal"
          ? String(data.title)
          : event.event === "custom"
            ? "Orders issued"
            : "Scouting mission";
      const detail =
        event.event === "journal"
          ? String(data.notes || "")
          : event.event === "custom"
            ? `${data.objective}\n${data.missionLocation}\nStart: ${data.startDate}\n${String(data.additionalNotes || "").slice(0, 1024)}`
            : `Sub-hex ${data.hexNumber}: ${data.men} soldiers. Status: ${data.status || "active"}.`;
      const content = `${title} — ${character.name}\n${detail}`;
      if (content.length > 19000) throw new Error("message_too_long");
      // Discord content is capped at 2,000 characters. One embed permits a
      // longer journal while preventing campaign text from pinging members.
      const response = await send(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          embeds: [
            {
              title: `${title} — ${character.name}`.slice(0, 256),
              description: detail.slice(0, 4000),
            },
          ],
          allowed_mentions: { parse: [] },
        }),
      });
      if (!response.ok) {
        const retry = Number(response.headers.get("Retry-After"));
        const delay =
          Number.isFinite(retry) && retry > 0
            ? Math.min(retry, 86400)
            : Math.min(3600, 30 * 2 ** Math.min(event.attempts, 7));
        await db
          .prepare(
            "UPDATE notification_outbox SET status=?,lease_until=NULL,next_attempt_at=?,last_error=? WHERE id=? AND lease_until=?",
          )
          .bind(
            response.status === 429 || response.status >= 500
              ? "pending"
              : "failed",
            new Date(Date.now() + delay * 1000).toISOString(),
            `discord_${response.status}`,
            item.id,
            lease,
          )
          .run();
        continue;
      }
      await db
        .prepare(
          "UPDATE notification_outbox SET status='sent',lease_until=NULL,last_error=NULL WHERE id=? AND lease_until=?",
        )
        .bind(item.id, lease)
        .run();
    } catch (error) {
      if (
        error instanceof ApiError ||
        (error instanceof Error && error.message === "not_configured")
      ) {
        await db
          .prepare(
            "UPDATE notification_outbox SET status='blocked',lease_until=NULL,last_error='not_configured' WHERE id=? AND lease_until=?",
          )
          .bind(item.id, lease)
          .run();
        continue;
      }
      await db
        .prepare(
          "UPDATE notification_outbox SET lease_until=NULL,next_attempt_at=?,last_error='delivery_unconfirmed' WHERE id=? AND lease_until=?",
        )
        .bind(new Date(Date.now() + 300000).toISOString(), item.id, lease)
        .run();
    }
  }
}

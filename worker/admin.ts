import { ApiError } from "./errors";
import type { Row } from "./ruleContext";
export const adminActions = new Set([
  "campaign.update",
  "player.access.update",
  "discord.webhook.update",
  "discord.thread.update",
]);
export function validWebhook(value: unknown) {
  if (typeof value !== "string" || value.length > 600)
    throw new ApiError(400, "Enter a valid Discord webhook URL.");
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError(400, "Enter a valid Discord webhook URL.");
  }
  if (
    url.protocol !== "https:" ||
    !["discord.com", "discordapp.com"].includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/webhooks\/\d{17,20}\/[A-Za-z0-9_-]+$/.test(url.pathname)
  )
    throw new ApiError(400, "Enter a Discord webhook URL from discord.com.");
  return url.toString();
}
export async function adminAction(
  db: D1Database,
  input: Row,
  action: string,
  player: Row,
) {
  if (player.role !== "dm")
    throw new ApiError(403, "Only the DM can change campaign settings.");
  if (action === "campaign.update") {
    if (
      typeof input.campaignName !== "string" ||
      !input.campaignName.trim() ||
      input.campaignName.length > 120
    )
      throw new ApiError(
        400,
        "Enter a campaign name of 120 characters or fewer.",
      );
    const name = input.campaignName.trim();
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('campaignName',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .bind(name)
      .run();
    return { ok: true, campaignName: name };
  }
  if (action === "discord.thread.update") {
    const thread = String(input.threadId || "").trim();
    if (thread && !/^\d{17,20}$/.test(thread))
      throw new ApiError(400, "Enter a valid Discord thread ID.");
    const row = await db
      .prepare(
        "UPDATE characters SET data=json_set(data,'$.discordThreadId',?),version=version+1 WHERE id=? AND active=1 RETURNING data,version,EXISTS(SELECT 1 FROM discord_webhooks w WHERE w.player_id=characters.player_id) AS webhook_configured",
      )
      .bind(thread, String(input.characterId || ""))
      .first<{ data: string; version: number }>();
    if (!row) throw new ApiError(404, "Character not found.");
    return { ok: true, characterRow: row };
  }
  const target = String(input.targetPlayerId || "");
  if (
    !(await db
      .prepare("SELECT id FROM players WHERE id=? AND active=1")
      .bind(target)
      .first())
  )
    throw new ApiError(404, "Player account not found.");
  if (action === "player.access.update") {
    if (typeof input.territoriesEnabled !== "boolean")
      throw new ApiError(400, "Select whether territories are enabled.");
    const row = await db
      .prepare(
        "UPDATE players SET data=json_set(data,'$.territoriesEnabled',json(?)) WHERE id=? AND active=1 RETURNING *",
      )
      .bind(String(input.territoriesEnabled), target)
      .first<Row>();
    return { ok: true, playerRow: row };
  }
  const url = validWebhook(input.webhookUrl);
  if (url)
    await db
      .prepare(
        "INSERT INTO discord_webhooks(player_id,url) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET url=excluded.url",
      )
      .bind(target, url)
      .run();
  else
    await db
      .prepare("DELETE FROM discord_webhooks WHERE player_id=?")
      .bind(target)
      .run();
  if (url)
    await db
      .prepare(
        "UPDATE notification_outbox SET status='pending',next_attempt_at=?,lease_until=NULL WHERE status='blocked' AND character_id IN(SELECT id FROM characters WHERE player_id=?)",
      )
      .bind(new Date().toISOString(), target)
      .run();
  return { ok: true, configured: !!url };
}

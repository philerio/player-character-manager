import { commitGame, loadGameContext } from "./game";
import { runGameRules } from "./gameRules";
import { deliverNotifications } from "./notifications";
import type { Row } from "./ruleContext";
/** Cursor limits work per invocation; clocks make repeated/overlapping runs safe. */
export async function runScheduled(db: D1Database) {
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO settings(key,value) VALUES('backend.scheduler',json_object('runId',?,'lastStartedAt',?,'lastFinishedAt',NULL,'lastSucceededAt',NULL,'outcome','running','failureCount',0,'lastFailureCharacterId',NULL,'lastFailureCategory',NULL)) ON CONFLICT(key) DO UPDATE SET value=json_set(value,'$.runId',?,'$.lastStartedAt',?,'$.outcome','running')",
    )
    .bind(runId, startedAt, runId, startedAt)
    .run();
  let failureCount = 0,
    failedCharacter: string | null = null,
    category: string | null = null;
  let fatal = false;
  try {
    const cursor = await db
      .prepare("SELECT value FROM settings WHERE key='jobCursor'")
      .first<{ value: string }>();
    const rows = await db
      .prepare(
        "SELECT c.id,p.id AS player_id,p.role,p.data FROM characters c JOIN players p ON p.id=c.player_id WHERE c.active=1 AND p.active=1 AND c.id>? ORDER BY c.id LIMIT 1",
      )
      .bind(cursor?.value || "")
      .all<Row>();
    for (const row of rows.results) {
      try {
        const player = {
          ...JSON.parse(row.data),
          playerId: row.player_id,
          role: row.role,
        };
        const { context, clock } = await loadGameContext(db, player, row.id);
        const before = JSON.parse(JSON.stringify(context.sheets));
        runGameRules(context, "scheduled", {
          characterId: row.id,
          authPlayer: player,
        });
        await commitGame(db, context, before, clock, row.id, player);
      } catch (error) {
        failureCount++;
        failedCharacter = row.id;
        category =
          error instanceof Error && error.message.includes("changed")
            ? "conflict"
            : "processing_error";
        // Sanitized category only. A conflict is retried on the next cursor pass.
        console.error(
          JSON.stringify({
            event: "campaign_scheduled_failed",
            category,
          }),
        );
      }
    }
    const next = rows.results.at(-1)?.id || "";
    await db
      .prepare(
        "INSERT INTO settings(key,value) VALUES('jobCursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .bind(next)
      .run();
    await deliverNotifications(db, undefined, undefined, 2);
    // D1 cascades deletion to file parts. Bound each cleanup to one retired file.
    await db
      .prepare(
        "DELETE FROM media_files WHERE id IN(SELECT id FROM media_files WHERE active=0 AND storage='d1' LIMIT 1)",
      )
      .run();
    await db
      .prepare("DELETE FROM auth_challenges WHERE expires_at<=?")
      .bind(new Date().toISOString())
      .run();
  } catch (error) {
    fatal = true;
    failureCount++;
    category = "processing_error";
    throw error;
  } finally {
    const finishedAt = new Date().toISOString();
    await db
      .prepare(
        "UPDATE settings SET value=json_set(value,'$.lastFinishedAt',?,'$.lastSucceededAt',CASE WHEN ?=0 THEN ? ELSE json_extract(value,'$.lastSucceededAt') END,'$.outcome',?,'$.failureCount',?,'$.lastFailureCharacterId',?,'$.lastFailureCategory',?) WHERE key='backend.scheduler' AND json_extract(value,'$.runId')=?",
      )
      .bind(
        finishedAt,
        failureCount,
        finishedAt,
        fatal ? "failed" : failureCount ? "partial" : "ok",
        failureCount,
        failedCharacter,
        category,
        runId,
      )
      .run();
  }
}

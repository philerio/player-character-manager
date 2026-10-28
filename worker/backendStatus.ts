import type { BackendStatus } from "../shared/backendStatus";
import { FILE_STORAGE_BUDGET } from "./fileStorage";
export const expectedMigrations = [
  "0001_initial.sql",
  "0002_wallet_backups.sql",
  "0003_write_versions.sql",
  "0004_game_operations.sql",
  "0005_account_challenges.sql",
  "0006_d1_file_storage.sql",
];
// Structural checks also work for imported databases without a Wrangler ledger.
const requiredTables = [
  "players",
  "characters",
  "territories",
  "records",
  "migration_archive",
  "revisions",
  "sessions",
  "settings",
  "login_attempts",
  "wallet_backups",
  "command_receipts",
  "transaction_guards",
  "campaign_clocks",
  "notification_outbox",
  "discord_webhooks",
  "auth_challenges",
  "media_files",
  "media_file_parts",
];
const requiredTriggers = [
  "records_clock_insert",
  "records_clock_update",
  "records_clock_delete",
  "territories_clock_insert",
  "territories_clock_update",
  "territories_clock_delete",
  "characters_clock_insert",
  "characters_clock_update",
];
export async function backendStatus(db: D1Database): Promise<BackendStatus> {
  const schema = await db
    .prepare(
      "SELECT name,type FROM sqlite_master WHERE type IN('table','trigger','index')",
    )
    .all<{ name: string; type: string }>();
  const tables = new Set(
    schema.results.filter((r) => r.type === "table").map((r) => r.name),
  );
  const triggers = new Set(
    schema.results.filter((r) => r.type === "trigger").map((r) => r.name),
  );
  const missing = [
    ...requiredTables.filter((n) => !tables.has(n)),
    ...requiredTriggers.filter((n) => !triggers.has(n)),
  ];
  const indexes = new Set(
    schema.results.filter((r) => r.type === "index").map((r) => r.name),
  );
  for (const name of [
    "unique_hex",
    "unique_mutation",
    "character_creation_retry",
  ])
    if (!indexes.has(name)) missing.push(name);
  for (const [table, required] of Object.entries({
    characters: [
      "version",
      "creation_player_id",
      "creation_mutation_id",
      "creation_payload_hash",
    ],
    wallet_backups: ["base_backup_id"],
    media_files: [
      "storage",
      "byte_length",
      "encoded_length",
      "part_count",
      "sha256",
    ],
  })) {
    if (!tables.has(table)) continue;
    const columns = await db
      .prepare(`PRAGMA table_info(${table})`)
      .all<{ name: string }>();
    for (const name of required)
      if (!columns.results.some((c) => c.name === name))
        missing.push(table + "." + name);
  }
  const appliedMigrations = tables.has("d1_migrations")
    ? (
        await db
          .prepare("SELECT name FROM d1_migrations ORDER BY id")
          .all<{ name: string }>()
      ).results.map((r) => r.name)
    : null;
  const pendingMigrations = appliedMigrations
    ? expectedMigrations.filter((n) => !appliedMigrations.includes(n))
    : [];
  const result: BackendStatus = {
    ok: true,
    checkedAt: new Date().toISOString(),
    schema: {
      ready: !missing.length && !pendingMigrations.length,
      missing,
      appliedMigrations,
      pendingMigrations,
    },
    scheduler: null,
    notifications: null,
    storage: null,
    activeCharacters: null,
  };
  if (!result.schema.ready) return result;
  const heartbeat = await db
    .prepare("SELECT value FROM settings WHERE key='backend.scheduler'")
    .first<{ value: string }>();
  result.scheduler = heartbeat
    ? JSON.parse(heartbeat.value)
    : {
        lastStartedAt: null,
        lastFinishedAt: null,
        lastSucceededAt: null,
        outcome: null,
        failureCount: 0,
        lastFailureCharacterId: null,
        lastFailureCategory: null,
      };
  const notices = await db
    .prepare(
      "SELECT status,count(*) AS n,min(created_at) AS oldest FROM notification_outbox WHERE status IN('pending','failed','blocked') GROUP BY status",
    )
    .all<{ status: string; n: number; oldest: string }>();
  result.notifications = {
    pending: 0,
    failed: 0,
    blocked: 0,
    oldestPendingAt: null,
  };
  for (const row of notices.results) {
    result.notifications[row.status as "pending" | "failed" | "blocked"] =
      row.n;
    if (row.status === "pending")
      result.notifications.oldestPendingAt = row.oldest;
  }
  const storage = await db
    .prepare(
      "SELECT COALESCE(sum(encoded_length),0) AS encodedBytes,count(*) AS files FROM media_files WHERE storage='d1'",
    )
    .first<{ encodedBytes: number; files: number }>();
  result.storage = { ...storage!, limitBytes: FILE_STORAGE_BUDGET };
  result.activeCharacters = (await db
    .prepare("SELECT count(*) AS n FROM characters WHERE active=1")
    .first<{ n: number }>())!.n;
  return result;
}

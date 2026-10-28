# Cloudflare D1 migration

The frontend stays on Google Sheets unless `VITE_API_BACKEND=d1` is selected. The Worker now handles the existing app operations using D1, including new file uploads. Keep testing in staging until deployment configuration and DM/player acceptance checks pass. Existing Drive image URLs remain supported; existing files are not automatically copied into D1.

## Implemented

- Parameterized, character-scoped reads for bootstrap, account/player rosters, journals, retainers, wallets, territories, missions and sync revisions. Reads do not run game calculations or scheduled jobs.
- Account registration, initial password setup, recovery, sign-in/out, hashed session tokens, 30-day expiry, persistent throttling and explicit allowed frontend origins. Imported password hashes are verified and upgraded to PBKDF2-SHA256 after successful login. New passwords and recovery answers use PBKDF2. Password changes invalidate previous sessions and one-time setup challenges. Registration keys are Worker secrets, never frontend variables.
- Character creation uses a persistent client retry key and an immutable server payload hash. Repeating a request returns the same character; changed payloads or deleted characters cannot reuse that key. Edits and soft deletions require the version shown when their dialog opened and use atomic conditional SQL. Character versions are returned in rosters and mutation responses. Deleting a character hides it and denies subsequent access while retaining campaign history and the owner account. Level input must be an integer from 1 to 100.
- Journal create/update/delete. Creates require a stable `clientMutationId`; retries return the same entry. Updates/deletes require `expectedUpdatedAt` and use an atomic conditional SQL mutation. Deletions advance the version, and stale edits cannot restore deleted entries. Journals load newest-update-first, with IDs breaking timestamp ties. Deleted entries retain an idempotency tombstone, so an old retry cannot recreate them.
- DM hex edits require `expectedUpdatedAt` for existing records and reject stale versions. Reveal-only requests update visibility without sending cached notes or replacing coordinates. Confirmed versions are checkpointed across queued edits. Hex upserts enforce unique normalized labels (`2` and `2.0` identify the same hex), and persist reveal flags. Player responses include revealed hexes, the starting hex `4.4`, and successful scouting results already viewed; DM-only hex details and adjudication fields are removed. Publishing a tab revision keeps the existing DM workflow and signals background refresh on player clients.
- Spreadsheet validation and SQL generation, preserving IDs and original source rows. All generated SQL statements enforce D1 byte limits, and duplicate imported setting keys block generation with their source row. Field validation is shared with the frontend; date-only start/hiring dates normalize to `YYYY-MM-DD` while creation/update timestamps retain their time. Foreign keys validate owners and character/territory relationships. Sessions are excluded: users sign in again on D1.
- Wallet backup save/load with validated, immutable snapshots and scoped retry IDs. A failed or retried save cannot overwrite an existing snapshot. Restore validates character ownership and fields, checks for intervening local edits, and requires durable device storage before replacing the visible wallet. Workbook wallet backups import into the live backup table as well as the source archive.
- Wallet export/import for carrying browser-only ledgers into D1. Imports select one matching character from a wallet file or an existing working-copy export, validate before confirmation, and derive balances from the ledger.
- Scouting start/completion/result viewing/dismissal, casualties, serjeant promotion and custom orders preserve the existing game rules. D1 batches atomically commit mission, personnel, population and revision changes. Command receipts prevent retrying an accepted operation from charging a fee or applying casualties twice.
- Territory and retainer mutations, recruitment, field allocation/development, tithe settings, transaction and recurring-schedule APIs, DM player access and campaign settings are implemented. Existing personnel costs and domain income remain informational; device-local wallet schedules continue running on the device.
- New maps/portraits and territory workbook uploads use D1 with no R2 binding or subscription. Files are split into small base64 parts; content, metadata and campaign references save atomically. Replacing files frees their old content, and image delivery verifies a SHA-256 hash. Files are limited to 5 MiB each and total encoded content to 128 MiB (about 96 MiB of original files). Image share URLs contain opaque random IDs, matching the existing shared-map policy. Workbook attachments are not exposed by the image route.
- Discord configuration and journal/mission delivery use a durable D1 outbox. Leases prevent concurrent sends; rate limits and transient failures are retried. Delivery is at least once: a lost Discord confirmation can cause a duplicate notification, but never repeats the game operation. Webhook URLs stay private and are restricted to Discord endpoints.
- A one-minute Cron handler processes overdue missions, farming completions and month-end population, using a cursor to bound work per invocation. Wallet charges, personnel upkeep, domain taxes and field income are not automatically posted by the Worker.
- A separate frontend endpoint mode with API-specific storage for sessions, caches and drafts. Sheets drafts are not replayed into D1.

The JSON record payloads preserve the workbook's fields while relational columns enforce ownership, indexing and uniqueness. Later migrations can promote individual game fields to typed columns without changing IDs.

For hosted setup, see [connect the staging frontend, Worker and remote D1 database](d1-deployment.md).

## Run locally

Use Node 24 (`nvm use`). Wrangler and Worker types are installed as dev dependencies.

```bash
npm install
npm run d1:migrate:local
npm run d1:seed:local
npm run d1:dev
```

In another terminal:

```bash
npm run dev:d1
```

Sign in with `dm@example.test`, `player@example.test`, or `other@example.test`; all use `local-test-password`. D1 sign-in and password recovery identify accounts by email and do not load or require a player-name dropdown. These are synthetic accounts only. Use the regular sign-in screen; the existing `?demo=dm` and `?demo=player` query parameters still select the separate browser demo.

The seed includes a Test Territory with bundled player and detail maps. If an older local seed has no **View Map** button, repair just that synthetic record without resetting the database:

```bash
npx wrangler d1 execute DB --local --file scripts/repair-d1-fixture-maps.sql
```

Refresh the frontend afterward. The repair preserves assigned maps and checks the synthetic campaign/account identifiers before adding sample maps.

The seed command is intended for an empty local database and refuses to overwrite an existing seed SQL file. It never resets campaign data. To repeat tests, `npm run d1:test` uses a new in-memory SQLite database for each test.

For a clean, disposable local emulator after experimentation, stop the Worker, remove `.wrangler/state` and `migration-output/local-seed.sql`, then repeat the migration/seed steps. **Do not remove a state directory holding your imported working data.**

Wrangler stores local D1 state in `.wrangler/`, which is gitignored. In a restricted environment, set `XDG_CONFIG_HOME` to a writable directory and `WRANGLER_SEND_METRICS=false`. Running the emulator requires permission to bind a loopback port.

## Validate/import a workbook

The latest validated production export is `playerData/Player Character Manager20261019 - D1 import.xlsx`; its prepared SQL is `migration-output/d1-production-import-20261019.sql`. See [the latest validation report](d1-import-validation.md) for the 46 archived orphan rows and verified import counts. The older export and cleanup described below are retained for history.

Validation only; this does not generate files or connect to Cloudflare:

```bash
npm run d1:import -- "playerData/Player Character Manager.xlsx"
```

The original export has **46 missing-character references** and remains unchanged. On 2026-10-19, at the user's request, those orphan records were excluded from `playerData/Player Character Manager - D1 import.xlsx` after checking for character-ID typos. Removed rows are retained in a private recovery archive. The cleaned copy passes validation and a disposable SQLite import; see [the validation report](d1-import-validation.md). The importer itself still rejects missing owners rather than inventing or dropping records.

Once validation passes, generate SQL for an **empty destination database**:

```bash
mkdir -p migration-output
npm run d1:import -- "playerData/Player Character Manager - D1 import.xlsx" --output migration-output/import.sql
npx wrangler d1 execute DB --local --file migration-output/import.sql
```

The output includes password hashes, archived recovery metadata and potentially webhook credentials. Keep it private; `migration-output/` is gitignored and output files are created with owner-only permissions. Do not upload it as a public frontend asset. All original source sheets except Sessions are retained in `migration_archive` for later ports, including wallet backups and recruitment offers. Recruitment offers also import into live records. Migration 0004 promotes offers from older archives, and 0005 restores archived recovery hashes to private account records. The Worker never exposes the archive. Valid Wallet Backups rows also become snapshots available through **Restore Backup**. Incomplete snapshot groups, invalid payloads, duplicate row IDs or ordering, and any generated SQL statements (including records, settings and archived source rows) that exceed the D1 import statement limit block generation with a sheet/row/field diagnostic. The API uses bound JSON and an 8 MiB request limit (uploads decode to at most 5 MiB); oversized import snapshots need an explicit transfer plan rather than silently dropping them.

Importing is a one-time seed, not an upsert into a running campaign. Do not assume a large Wrangler SQL import is atomic. If a command fails, recreate the disposable destination, apply the schema, and rerun; never retry against a partially populated production database. Before remote import, verify row counts and all supported API response shapes on the corrected export locally, then repeat in an isolated staging database.

## Backup and service diagnostics

Use [full campaign backup and recovery](d1-recovery.md) to create verified private exports and rehearse a restore. The DM character dropdown has an on-demand **Backend status** view for migration readiness, scheduled jobs, Discord queue status and upload storage. Job heartbeats use existing settings; no new schema migration is required.

## Deployment and acceptance work

All existing frontend API operations have D1 handlers. Unknown operation names return HTTP 400. No D1 request falls back to writing Google Sheets.

Before using the hosted migration:

1. Apply every schema migration, including `0004_game_operations.sql`, `0005_account_challenges.sql` and `0006_d1_file_storage.sql`. Existing imported databases only need these migrations; do not reimport or reseed their campaign data.
2. No extra storage service is needed. Optionally set `REGISTRATION_PLAYER_KEY` and, if DM registration is needed, `REGISTRATION_DM_KEY` using `wrangler secret put`. Registration remains unavailable when no keys are configured.
3. Configure the correct account/database and exact frontend origins, deploy the Worker, then rebuild the frontend with its API URL. The Cron trigger is declared in `wrangler.jsonc` and is activated by deployment.
4. Re-enter Discord webhooks through the DM UI; they are deliberately not copied from legacy script properties. Existing thread IDs remain on imported characters. Existing Drive images continue working; moving old images into D1 requires obtaining and reuploading those files.
5. Complete DM/player acceptance tests for scouting, recruitment, field development, account recovery, uploads, wallet transfer, concurrent edits, and scheduled processing. Test a real D1 staging instance before production cutover.

`worker/gameRules.ts` contains the existing synchronous game calculations ported from Apps Script. It has no Google API dependency or embedded credentials. Its request-local adapter is `ruleContext.ts`; typed validation, ownership checks, durable retry receipts and D1 transaction guards live in `game.ts`. Existing record writes also advance character clocks through database triggers, so a concurrent journal/hex edit cannot be silently overwritten by a game operation. Bulk JSON writes keep large workbook updates within D1 query limits.

Campaign calendar checks default to UTC. If the old Apps Script used another timezone, set the `campaignTimeZone` setting to that IANA timezone before enabling the Cron trigger. Date-only wallet schedules remain device-local. Scheduled jobs do not rewrite historical wallet transactions or repeat legacy repair routines.

Browser wallets are the app's source of truth and may contain entries absent from the sheet. D1 mode intentionally starts with isolated browser storage, so do **not** treat its initial imported wallet as complete. Use unchanged character IDs when transferring ledgers. Old sessions, caches and pending drafts stay in their original namespace.

## Transfer and verify a wallet

1. In the existing app, select a character and use **Export Wallet**, or use the existing **Download working copy** action to export all device working copies. Keep the file private. Save a campaign backup too if possible, and repeat on each device that has unreconciled wallet edits.
2. For an existing local D1 setup, run `npm run d1:migrate:local` to apply every pending migration, including `0002_wallet_backups.sql` and `0003_write_versions.sql`. Do not reseed or reset an existing database.
3. In D1 mode, sign in and select the same character. A device without a local wallet first recovers the latest campaign backup, or loads the imported ledger if there is no backup. Edits and backups stay unavailable until recovery succeeds; failed reads never create a blank wallet. File import can establish the wallet if automatic recovery fails. Choose **Import Wallet** and select the export. Confirm replacement after validation. A multi-wallet working copy imports only that character's wallet and never its drafts or credentials. Multiple copies for the same character are rejected for manual reconciliation.
4. Review the ledger, purse and recurring schedules, then choose **Back Up Ledger** to save a D1 snapshot. Importing a file saves only on this device; it does not write to the campaign automatically.
5. Verify **Restore Backup** on a separate test device/browser after making an export of that device's current ledger. Restore replaces, rather than merges, its ledger and recurring schedules. Existing due recurring expenses continue processing under the current local wallet workflow.

D1 snapshots retain previous backups, but this stage restores only the newest snapshot; history selection and automatic backup scheduling are not included. The backup row is private to the character's owner and the DM. A repeated request with the same mutation ID returns the original snapshot; it cannot change its contents or make it newer than another backup. A lost confirmation can be retried from the same open view with the same payload. Each save includes the last accepted backup ID. A stale browser receives a conflict without inserting a new snapshot. **Resolve Backup Conflict** reviews the current backup and requires confirmation before replacing different contents; the replacement is still conditional, so another intervening save conflicts again. Local file exports never supply a trusted campaign version. Retries keep their original payload, base version and request ID. After a reload that loses an uncertain backup request ID, its stale base causes a conflict rather than silently creating a new latest snapshot. File imports are limited to 10 MiB; payload validation allows up to 5,000 ledger rows and 1,000 recurring schedules, and API backups must fit the request size limit.

For staging, use a dedicated D1 database and verify its UUID in `wrangler.jsonc`. Configure `ALLOWED_ORIGINS` with the exact frontend origin(s), apply migrations and the corrected import to staging, then deploy the Worker and test a preview frontend using its URL. This implementation does not create or deploy hosted resources. Verify the target account and database before remote commands.

Final cutover requires a fresh export during a write freeze, successful reconciliation including browser wallets, configured API/cron/file services, staging DM/player acceptance tests, backup/restore verification and a rollback decision. Keep Sheets authoritative until then. After D1 accepts new writes, switching back to an old sheet snapshot without reconciliation loses those changes; do not treat changing an environment variable as a complete rollback.

## Errors and diagnostics

The Worker returns an error code and a request ID on failures. Unexpected errors produce a structured `campaign_request_failed` console log containing that ID, the recognized action, and a sanitized failure category (plus a recognized table for missing-table errors). Raw database error messages, SQL parameters, credentials, request URLs and bodies are not included in these application logs. Use the reference shown in the app to locate the matching Worker log when investigating a failure. Remote log availability still depends on the account's logging setup; no Cloudflare deployment or account configuration is changed here.

Sign-in throttling returns HTTP 429, `rate_limited` and `Retry-After`. The frontend preserves its cooldown message rather than treating it as an expired session. Definite input rejections and unimplemented actions remain distinct from an uncertain write, so a rejected journal creation can be corrected and retried. Lost confirmations still preserve the draft for reconciliation.

## Checks

```bash
npm run d1:typecheck
npm run d1:test
npm run typecheck
npm test -- --pool=threads --maxWorkers=1
npm run build
```

Worker tests execute actual SQL against SQLite, exercise permission checks, existing account login, journal retries/stale writes, DM-to-player visibility, revision publishing, wallet snapshot permissions/retries and workbook import, import validation and response compatibility with the frontend validator. Wrangler local smoke testing complements these tests with Cloudflare's runtime and actual D1 bindings.

Cloudflare references: [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [local development](https://developers.cloudflare.com/d1/best-practices/local-development/).

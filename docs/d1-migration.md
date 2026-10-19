# Cloudflare D1 migration: local/staging first stage

The frontend stays on Google Sheets unless `VITE_API_BACKEND=d1` is selected. This stage runs a Worker and D1 locally; it is **not a production cutover**. D1 stores the data; the Worker replaces the Apps Script API. Existing Drive image URLs remain in use until file storage is migrated.

## Implemented

- Parameterized, character-scoped reads for bootstrap, account/player rosters, journals, retainers, wallets, territories, missions and sync revisions. Reads do not run game calculations or scheduled jobs.
- Existing Apps Script account password-hash verification, hashed session tokens, 30-day expiry, logout, persistent sign-in throttling and explicit allowed frontend origins. Passwords remain in the legacy hash format in this stage; upgrading password storage and completing account lifecycle are cutover requirements.
- Character creation uses a persistent client retry key and an immutable server payload hash. Repeating a request returns the same character; changed payloads or deleted characters cannot reuse that key. Edits and soft deletions require the version shown when their dialog opened and use atomic conditional SQL. Character versions are returned in rosters and mutation responses. Deleting a character hides it and denies subsequent access while retaining campaign history and the owner account. Level input must be an integer from 1 to 100.
- Journal create/update/delete. Creates require a stable `clientMutationId`; retries return the same entry. Updates/deletes require `expectedUpdatedAt` and use an atomic conditional SQL mutation. Deletions advance the version, and stale edits cannot restore deleted entries. Journals load newest-update-first, with IDs breaking timestamp ties. Deleted entries retain an idempotency tombstone, so an old retry cannot recreate them.
- DM hex edits require `expectedUpdatedAt` for existing records and reject stale versions. Reveal-only requests update visibility without sending cached notes or replacing coordinates. Confirmed versions are checkpointed across queued edits. Hex upserts enforce unique normalized labels (`2` and `2.0` identify the same hex), and persist reveal flags. Player responses include revealed hexes, the starting hex `4.4`, and successful scouting results already viewed; DM-only hex details and adjudication fields are removed. Publishing a tab revision keeps the existing DM workflow and signals background refresh on player clients.
- Spreadsheet validation and SQL generation, preserving IDs and original source rows. All generated SQL statements enforce D1 byte limits, and duplicate imported setting keys block generation with their source row. Field validation is shared with the frontend; date-only start/hiring dates normalize to `YYYY-MM-DD` while creation/update timestamps retain their time. Foreign keys validate owners and character/territory relationships. Sessions are excluded: users sign in again on D1.
- Wallet backup save/load with validated, immutable snapshots and scoped retry IDs. A failed or retried save cannot overwrite an existing snapshot. Restore validates character ownership and fields, checks for intervening local edits, and requires durable device storage before replacing the visible wallet. Workbook wallet backups import into the live backup table as well as the source archive.
- Wallet export/import for carrying browser-only ledgers into D1. Imports select one matching character from a wallet file or an existing working-copy export, validate before confirmation, and derive balances from the ledger.
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

Select `Test dm`, `Test player`, or `Test other` at sign-in. Their emails are `dm@example.test`, `player@example.test`, and `other@example.test`; all use `local-test-password`. These are synthetic accounts only. Use the regular sign-in screen; the existing `?demo=dm` and `?demo=player` query parameters still select the separate browser demo.

The seed includes a Test Territory with bundled player and detail maps. If an older local seed has no **View Map** button, repair just that synthetic record without resetting the database:

```bash
npx wrangler d1 execute DB --local --file scripts/repair-d1-fixture-maps.sql
```

Refresh the frontend afterward. The repair preserves assigned maps and checks the synthetic campaign/account identifiers before adding sample maps.

The seed command is intended for an empty local database and refuses to overwrite an existing seed SQL file. It never resets campaign data. To repeat tests, `npm run d1:test` uses a new in-memory SQLite database for each test.

For a clean, disposable local emulator after experimentation, stop the Worker, remove `.wrangler/state` and `migration-output/local-seed.sql`, then repeat the migration/seed steps. **Do not remove a state directory holding your imported working data.**

Wrangler stores local D1 state in `.wrangler/`, which is gitignored. In a restricted environment, set `XDG_CONFIG_HOME` to a writable directory and `WRANGLER_SEND_METRICS=false`. Running the emulator requires permission to bind a loopback port.

## Validate/import a workbook

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

The output includes password hashes, archived recovery metadata and potentially webhook credentials. Keep it private; `migration-output/` is gitignored and output files are created with owner-only permissions. Do not upload it as a public frontend asset. All original source sheets except Sessions are retained in `migration_archive` for later ports, including wallet backups and recruitment offers. The Worker does not expose that archive or use its secrets. Valid Wallet Backups rows also become snapshots available through **Restore Backup**. Incomplete snapshot groups, invalid payloads, duplicate row IDs or ordering, and any generated SQL statements (including records, settings and archived source rows) that exceed the D1 import statement limit block generation with a sheet/row/field diagnostic. The API uses bound JSON and the existing 1 MiB request limit; oversized import snapshots need an explicit transfer plan rather than silently dropping them.

Importing is a one-time seed, not an upsert into a running campaign. Do not assume a large Wrangler SQL import is atomic. If a command fails, recreate the disposable destination, apply the schema, and rerun; never retry against a partially populated production database. Before remote import, verify row counts and all supported API response shapes on the corrected export locally, then repeat in an isolated staging database.

## Remaining work before production cutover

| Area               | Status / required work                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Accounts           | Registration, initial password changes, recovery, DM player management, stronger password hashing and authentication review         |
| Wallet             | Backup save/load and browser ledger transfer implemented; transaction and recurring schedule mutations remain                       |
| Retainers          | Mutations, fighting-force normalization, wage schedules and related transaction behavior                                            |
| Territories        | CRUD, tithe/management/fields/farmland, recruitment, workbook import and map uploads                                                |
| Missions           | Start/resolve/view/dismiss, custom missions, combat/recruitment adjudication and related wallet/retainer changes                    |
| Scheduled work     | Worker Cron triggers for recurring expenses, taxes, income, population and mission completion; must be idempotent and transactional |
| Files/integrations | Google Drive-to-R2 decision and file transfer, Discord credentials and message delivery                                             |
| Deployment         | Owner account ID, staging/production D1 database IDs, API hostname and allowed frontend origins                                     |

Unsupported actions return an explicit error. The app never falls back to writing Google Sheets for a D1 action. The UI is not yet gated for every unsupported operation; use this mode for staging evaluation only. Character retry/version checks are implemented in `0003_write_versions.sql`; apply all migrations before deploying the corresponding Worker and frontend. Imported characters begin at version 1. Refresh old roster caches before editing.

Browser wallets are the app's source of truth and may contain entries absent from the sheet. D1 mode intentionally starts with isolated browser storage, so do **not** treat its initial imported wallet as complete. Use unchanged character IDs when transferring ledgers. Old sessions, caches and pending drafts stay in their original namespace.

## Transfer and verify a wallet

1. In the existing app, select a character and use **Export Wallet**, or use the existing **Download working copy** action to export all device working copies. Keep the file private. Save a campaign backup too if possible, and repeat on each device that has unreconciled wallet edits.
2. For an existing local D1 setup, run `npm run d1:migrate:local` to apply every pending migration, including `0002_wallet_backups.sql` and `0003_write_versions.sql`. Do not reseed or reset an existing database.
3. In D1 mode, sign in and select the same character. A device without a local wallet first recovers the latest campaign backup, or loads the imported ledger if there is no backup. Edits and backups stay unavailable until recovery succeeds; failed reads never create a blank wallet. File import can establish the wallet if automatic recovery fails. Choose **Import Wallet** and select the export. Confirm replacement after validation. A multi-wallet working copy imports only that character's wallet and never its drafts or credentials. Multiple copies for the same character are rejected for manual reconciliation.
4. Review the ledger, purse and recurring schedules, then choose **Back Up Ledger** to save a D1 snapshot. Importing a file saves only on this device; it does not write to the campaign automatically.
5. Verify **Restore Backup** on a separate test device/browser after making an export of that device's current ledger. Restore replaces, rather than merges, its ledger and recurring schedules. Existing due recurring expenses continue processing under the current local wallet workflow.

D1 snapshots retain previous backups, but this stage restores only the newest snapshot; history selection and automatic backup scheduling are not included. The backup row is private to the character's owner and the DM. A repeated request with the same mutation ID returns the original snapshot; it cannot change its contents or make it newer than another backup. A lost confirmation can be retried from the same open view with the same payload. Each save includes the last accepted backup ID. A stale browser receives a conflict without inserting a new snapshot. **Resolve Backup Conflict** reviews the current backup and requires confirmation before replacing different contents; the replacement is still conditional, so another intervening save conflicts again. Local file exports never supply a trusted campaign version. Retries keep their original payload, base version and request ID. After a reload that loses an uncertain backup request ID, its stale base causes a conflict rather than silently creating a new latest snapshot. File imports are limited to 10 MiB; payload validation allows up to 5,000 ledger rows and 1,000 recurring schedules, and API backups must fit the request size limit.

For staging, the account owner must create a separate D1 database and replace the placeholder UUID in `wrangler.jsonc`. Configure `ALLOWED_ORIGINS` with the exact frontend origin(s), apply migrations and the corrected import to staging, then deploy the Worker and test a preview frontend using its URL. No remote database or Worker has been created or deployed by this change. The checked-in config is local/staging only.

Final cutover requires a fresh export during a write freeze, successful reconciliation including browser wallets, full API/cron/file parity, staging DM/player acceptance tests, backup/restore verification and a rollback decision. Keep Sheets authoritative until then. After D1 accepts new writes, switching back to an old sheet snapshot without reconciliation loses those changes; do not treat changing an environment variable as a complete rollback.

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

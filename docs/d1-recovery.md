# Full campaign backup and recovery

Use Node 24 and the Wrangler account/database configuration you already use for D1. These commands do not require R2 or another storage subscription. Backups stay on the computer where the command runs; there is no automatic offsite copy.

## Create a verified backup

For your hosted database, from the repository root:

```bash
npm run d1:backup -- --remote
```

For a local database instead:

```bash
npm run d1:backup -- --local
```

The target must be explicit. Each run creates a new private directory in `migration-output/backups/` and prints its location. `--config path/to/wrangler.jsonc` and `--binding DB` select a different deployment. Local export reads `.wrangler/state/` beside the selected Wrangler configuration. The command never applies migrations, changes campaign records or overwrites an older backup. Cloudflare exports briefly block other database requests, so take backups between sessions rather than during play.

The directory contains:

- `export.sql`: the complete Wrangler export, including accounts, campaign records, wallet snapshots, uploads, retry receipts and database triggers.
- `verified/restore.sql`: a prepared import with large JSON/base64 values split across small staging statements. Write-protection triggers are installed after row restoration so saved revision counters are preserved.
- `verified/manifest.json`: hashes, table counts and per-table content hashes, written only after verification succeeds.

Verification restores the export into disposable local SQLite, checks foreign keys, file lengths/hashes and active file references, prepares the import, then restores it into a second database and compares all application table content and schema. A successful export alone is not a verified backup. A failure prints an error and leaves no verification manifest. Preserve the original export for investigation.

Backups contain password/session hashes, private notes and Discord credentials. Files are created with owner-only permissions and are gitignored. Keep a private copy on another device or storage location you already trust. A manifest detects accidental differences; it is not a signature against deliberate tampering.

## Recheck a saved export

Only use trusted SQL exports created by you or the account holder. Verification executes the SQL locally.

```bash
npm run d1:backup:verify -- --file migration-output/backups/ACTUAL-BACKUP/export.sql
```

This creates a new verification directory rather than overwriting the existing one. Check the printed path. Reverification checks that the export restores consistently. If the original `verified/manifest.json` is still beside the export, the command also checks its source hash before running the SQL. If you moved the manifest elsewhere, pass `--manifest path/to/manifest.json`. Without an original manifest, verification establishes consistency but cannot establish that the export is unchanged. Use the newly verified `restore.sql` for recovery.

## Rehearse recovery in a separate empty database

1. Keep the current Worker bound to its existing database. Create a **new empty** recovery D1 database. Copy `wrangler.jsonc` to a private recovery configuration and change its database name/UUID and Worker name. Disable its Cron trigger before deploying any recovery Worker. Do not point the production Worker at the recovery database yet.
2. Import the verified `restore.sql` into that empty destination using the recovery configuration. The file contains the full schema, so **do not run migrations or seed/import the workbook before restoration**. If an import fails, discard that disposable destination and start with another empty one; do not retry into partially restored tables.

```bash
npx wrangler d1 execute DB --remote --config migration-output/recovery.wrangler.jsonc --file migration-output/backups/ACTUAL-BACKUP/verified/restore.sql
```

3. Check integrity and foreign keys. `foreign_key_check` should return no rows; `quick_check` should report `ok`. Compare application table counts with the manifest. This verifies the target import, not just the source file.

```bash
npx wrangler d1 execute DB --remote --config migration-output/recovery.wrangler.jsonc --command "PRAGMA quick_check; PRAGMA foreign_key_check; SELECT count(*) AS characters FROM characters; SELECT count(*) AS territories FROM territories; SELECT count(*) AS uploads FROM media_files; SELECT count(*) AS file_parts FROM media_file_parts;"
```

4. Deploy the separate recovery API with Cron disabled and use a frontend preview. Verify sign-in, character ownership, DM/player hex visibility, journals, wallet backup reads and uploaded image bytes. Restored rows retain their original absolute image URLs; for a preview at a different API URL, test `/files/FILE-ID` on the recovery API directly. Keep Discord delivery and campaign mutations out of this read-only rehearsal because the backup includes live webhook configuration.
5. Once the rehearsal passes, plan the production switch during a write freeze. Make a fresh verified backup of the current database first, export browser wallets, and reconcile any writes since the selected recovery point. Only then change the production binding, migrate if newer code requires it, and re-enable its Cron trigger. Switching databases or restoring an older snapshot does not reconcile later edits automatically.

The repository provides backup creation, verification and import preparation. It deliberately has no command that overwrites a running database automatically.

## Data outside the database

- Browser wallets and pending drafts may contain newer entries than D1 snapshots. Export each device's wallet or working copy separately and reconcile it using [wallet transfer instructions](d1-migration.md#transfer-and-verify-a-wallet).
- Existing Drive images remain external links; export the original files separately if they need independent protection. D1 uploads are included in the database backup.
- Worker secrets, API/frontend domains, allowed origins and Cron configuration are deployment settings, not D1 rows. Restore those from your private configuration records. Configure registration secrets again if needed.
- No backup is scheduled by these commands. The account holder needs to run them periodically and before updates, then retain copies away from the working machine.

References: [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).

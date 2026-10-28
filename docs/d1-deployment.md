# Connect a hosted frontend to the D1 API

Deploy a separate staging API and database first. The frontend calls the Worker over HTTPS; the Worker accesses D1 through its `DB` binding. D1 credentials never go into the frontend.

The backend now covers the existing app operations listed in [the migration guide](d1-migration.md). Evaluate it in a separate frontend project or preview environment until DM/player acceptance checks pass. New files are stored in D1; no R2 subscription or bucket is required. Registration uses optional Worker secrets; scheduled processing uses the configured Cron trigger.

## Updating an already imported D1 installation

For the **v1.2.2 email-only sign-in update**, deploy the API first with
`npx wrangler deploy --keep-vars`, then rebuild and deploy the D1 frontend using
the UI commands below. This change adds no database migration and does not
require another workbook import. Existing accounts, passwords and sessions stay
valid. The API still accepts older requests containing a player ID, so the
previous UI continues to work during deployment. The legacy Google Sheets
frontend keeps its existing name selection because that service requires it.

Do **not** rerun the campaign SQL import or reset the database. After testing these changes in staging, use the account/database already configured in `wrangler.jsonc`:

```bash
npx wrangler d1 migrations apply DB --remote
```

Migration `0006_d1_file_storage.sql` adds file storage to the existing database. Registration keys are optional if registration should stay closed; otherwise set fresh keys:

```bash
npx wrangler secret put REGISTRATION_PLAYER_KEY
npx wrangler secret put REGISTRATION_DM_KEY
```

Each command prompts for a secret. Never put these keys in `VITE_*` variables or source control. Existing accounts can sign in and recover passwords without registration keys.

If the campaign calendar is not UTC, set the `campaignTimeZone` D1 setting to the old Apps Script's IANA timezone before deploying the Cron trigger. For example, after verifying the timezone:

```bash
npx wrangler d1 execute DB --remote --command "INSERT INTO settings(key,value) VALUES('campaignTimeZone','America/New_York') ON CONFLICT(key) DO UPDATE SET value=excluded.value"
```

Deploy the Worker, which also installs its one-minute Cron schedule, and rebuild/redeploy the frontend with `VITE_API_BACKEND=d1`, its Worker API URL and demo mode disabled:

```bash
npx wrangler deploy
```

Then test scouting result viewing and player visibility, recruitment, field development, uploads, account recovery and wallet backup/restore. Re-enter Discord webhooks through the DM UI; existing script-property credentials are not automatically transferred. Existing Drive links remain supported. No hosted resources are changed merely by updating the repository.

## 1. Confirm the code and Cloudflare account

Use Node 24. From this repository:

```bash
nvm use
npm ci
npm run typecheck
npm run d1:typecheck
npm test -- --pool=threads --maxWorkers=1
npm run d1:test
npm run build
npx wrangler login
npx wrangler whoami
```

Use an account with permission to deploy Workers and manage D1. The account holder can perform these steps or grant the needed access. If the sign-in lists multiple accounts, set `account_id` in `wrangler.jsonc` to the intended account before creating or deploying resources.

## 2. Create or identify the staging database

If the account holder already created a dedicated empty staging database, obtain its name and UUID, or inspect the account's databases:

```bash
npx wrangler d1 list
```

Otherwise create it:

```bash
npx wrangler d1 create player-character-manager-staging
```

The command prints its database ID. This repository already has a D1 binding entry; replace that entry's placeholder ID rather than adding a second `DB` entry. Keep the binding name exactly `DB` because `worker/index.ts` uses `env.DB`.

In `wrangler.jsonc`, the relevant configuration should look like this, with the example values replaced:

```jsonc
{
  "name": "player-character-manager-api-staging",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-14",
  "workers_dev": true,
  "vars": {
    "ALLOWED_ORIGINS": "https://YOUR-STAGING-FRONTEND.pages.dev",
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "player-character-manager-staging",
      "database_id": "ACTUAL-DATABASE-UUID",
      "migrations_dir": "worker/migrations",
    },
  ],
}
```

`ALLOWED_ORIGINS` is the exact frontend origin: scheme and hostname, without a trailing slash or path. Separate multiple permitted origins with commas. Preview deployments can have different hostnames, so use the URL of the preview you will actually test. Redeploy the Worker when changing its origins or database binding.

## 3. Apply the schema to the remote staging database

Verify the configured name and UUID refer to staging, then run:

```bash
npx wrangler d1 migrations apply DB --remote
```

Apply all migration files, including `0004_game_operations.sql`, `0005_account_challenges.sql` and `0006_d1_file_storage.sql`. They add game operations, account recovery, write protection and D1 file storage. A local migration or local seed does not populate the remote database. Do not paste migration SQL into the frontend or upload the database as a static asset.

## 4. Import validated data once

Use the cleaned latest export `playerData/Player Character Manager20261019 - D1 import.xlsx`. Its prepared SQL is `migration-output/d1-production-import-20261019.sql`. The 46 orphan wallet records were excluded after checking for character-ID typos; the fresh original and a private recovery archive are preserved. See [the validation report](d1-import-validation.md). Validate the copy:

```bash
npm run d1:import -- "playerData/Player Character Manager20261019 - D1 import.xlsx"
```

After validation succeeds, generate a private SQL file:

```bash
mkdir -p migration-output
npm run d1:import -- "playerData/Player Character Manager20261019 - D1 import.xlsx" --output migration-output/staging-import.sql
```

Test that import in a separate disposable local database first, following [the migration guide](d1-migration.md). Only after it passes should you import into the **empty remote staging destination**:

```bash
npx wrangler d1 execute DB --remote --file migration-output/staging-import.sql
```

Import is a one-time seed, not an update of an existing campaign. Do not rerun against a partially imported database. The SQL contains account hashes and private campaign data; keep it out of Git and out of the frontend's `dist` directory. The importer never invents missing owners or drops invalid records.

Without imported accounts, the API can answer health checks but nobody can sign in. Do not publish the synthetic local test accounts as production accounts.

## 5. Deploy the Worker API

Apply all D1 migrations first. Configure registration secrets only if new account registration should be enabled.

```bash
npx wrangler deploy
```

Wrangler prints the deployed API URL, typically:

```text
https://player-character-manager-api-staging.YOUR-SUBDOMAIN.workers.dev
```

Deploy this as a separate Worker. Do not replace the existing frontend project's deployment configuration with the API Worker configuration. A custom API domain can be added later; it is not required for staging.

Check the URL:

```bash
curl "https://YOUR-ACTUAL-WORKER-URL/?action=health"
```

The health response confirms that the Worker is reachable. It does not query D1: signing in and loading the roster are the checks that verify the database binding, schema and imported accounts.

## 6. Point a frontend preview at that API

### Existing Workers frontend

The UI at `https://player-character-manager.canterburysocietyinfo.workers.dev` is a separate Worker named `player-character-manager`. `wrangler.ui.jsonc` deploys its static `dist` assets; `wrangler.jsonc` deploys only the API. Use the same Cloudflare account that owns the existing frontend and API. If Wrangler lists multiple accounts, select the owner account or set `CLOUDFLARE_ACCOUNT_ID` to its actual ID.

First copy the deployed API URL from `npx wrangler deploy`. Save the following values in a local, gitignored `.env.production.local`, using that actual URL:

```dotenv
VITE_API_BACKEND=d1
VITE_API_URL=PASTE_THE_DEPLOYED_API_URL_HERE
VITE_DEMO_MODE=false
```

Replace the entire URL placeholder before building. The API URL must be the API Worker, not the UI URL or `localhost`. Confirm `API_URL/?action=health` responds with the Player Character Manager D1 service before publishing the UI.

```bash
npm run build
npx wrangler deploy --config wrangler.ui.jsonc
```

This updates the existing UI Worker in the selected account. No D1 binding, import or migration belongs in the UI configuration. The API's `ALLOWED_ORIGINS` already includes this UI origin; redeploy the API if changing that list. After deployment, open the UI without demo query parameters and sign in again.

For Git-connected Workers Builds, use build command `npm run build`, deploy command `npx wrangler deploy --config wrangler.ui.jsonc`, and the same three build-time variables below. Set Node to version 24. The local `.env.production.local` is not uploaded to Git; set those variables separately in the Cloudflare build environment. The API project must keep its own deploy command.

### Build environment

In the Cloudflare project or CI job that **builds the staging frontend**, set:

```dotenv
VITE_API_BACKEND=d1
VITE_API_URL=https://YOUR-ACTUAL-WORKER-URL
VITE_DEMO_MODE=false
```

Build with `npm run build`; deploy the resulting `dist` directory. For Cloudflare Pages, the build command is `npm run build` and the output directory is `dist`. For a frontend hosted with Workers Static Assets, keep that frontend's existing asset deployment workflow and provide these variables to its build step.

Vite replaces these values during the build, so rebuild/redeploy after changing them. Setting runtime variables on an already built static frontend does not change its bundled API URL. The checked-in `.env.d1` points to `localhost:8787` for local development; do not use that URL in the hosted frontend.

Use the frontend's normal URL without `?demo=player` or `?demo=dm`, because those parameters deliberately select the browser demo. D1 mode uses its own session and device-storage namespace, so sign in again.

## 7. Verify the hosted integration

Check normal sign-in, roster loading, wallet recovery, journal save/retry/conflict behavior, DM hex reveal and player visibility, and wallet backup/restore from a second browser. A stale backup or character edit must be rejected, and local edits must remain available after an error. Use [wallet transfer steps](d1-migration.md#transfer-and-verify-a-wallet) for browser ledgers that contain entries absent from the workbook.

For a browser CORS failure, compare the actual frontend origin with `ALLOWED_ORIGINS`. For a 500 response, use its request reference to inspect the Worker log:

```bash
npx wrangler tail
```

Unknown operation names return HTTP 400. Missing registration configuration returns an explicit service error; a queued Discord notification can report unconfirmed delivery. Once staging acceptance and service configuration are complete, plan production cutover with a fresh validated export, reconciled browser wallets and a rollback/reconciliation procedure.

References: [D1 setup and bindings](https://developers.cloudflare.com/d1/get-started/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Cloudflare Pages builds](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Vite environment variables](https://vite.dev/guide/env-and-mode).

## File storage on the Free plan

Uploads use D1 only. Each file is limited to 5 MiB and split into small base64 parts to fit D1 row limits. Metadata, content and campaign references save in one transaction; reads verify the saved content hash. Replacing a file, deleting a portrait or deleting a territory removes its D1 file content in the same transaction. Existing Drive links remain supported without copying files.

The application caps file content at 128 MiB of encoded data (roughly 96 MiB of original files). Base64 adds approximately one third to file size; table and index storage add overhead too. This cap leaves room for campaign records within D1 Free's 500 MB per-database limit, but it does not reserve space or enforce the whole database's size. Monitor database usage and daily quotas in Cloudflare. When the upload cap is reached, the API rejects new files with an actionable message while preserving the current file. The Free plan has daily read/write limits; it is suitable while the campaign fits those limits, not unlimited storage or traffic. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Backups and DM backend status

Before deploying an update, use `npm run d1:backup -- --remote` to export and verify the current database. See [full campaign backup and recovery](d1-recovery.md) for verification, private storage and a restore rehearsal into a separate empty database. Apply the existing migrations first if the database predates file storage; the verifier requires that schema. Browser-only wallets and external Drive files need separate exports.

In a live D1 frontend, open the DM character dropdown, then **Backend status**. It loads on demand and shows schema/migration checks, the last completed and successful scheduled runs, notification queue/configuration failures and the encoded-file storage budget. Refresh failures retain the last checked result with an explicit warning. Before the first Cron run, job status is unknown rather than healthy. The public health endpoint remains a reachability check; the detailed endpoint requires a DM session. This view does not check whole-database backups or Cloudflare account quotas.

The Worker stores scheduler status in the existing settings table; no new migration is required for these diagnostics. Notification delivery during a scheduled run is bounded to two messages to leave query headroom for campaign processing.

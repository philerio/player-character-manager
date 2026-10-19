# Connect a hosted frontend to the D1 API

Deploy a separate staging API and database first. The frontend calls the Worker over HTTPS; the Worker accesses D1 through its `DB` binding. D1 credentials never go into the frontend.

The current backend supports only the operations listed in [the migration guide](d1-migration.md). Account lifecycle, most game mutations, scheduled jobs, uploads and integrations still need migration. Keep the existing production frontend on Sheets while evaluating D1 in a separate frontend project or preview environment.

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

Apply all migration files, including `0003_write_versions.sql`. They create the schema and add wallet and character write protection. A local migration or local seed does not populate the remote database. Do not paste migration SQL into the frontend or upload the database as a static asset.

## 4. Import validated data once

Use the cleaned workbook `playerData/Player Character Manager - D1 import.xlsx`. On 2026-10-19, at the user's request, 46 orphan wallet records were excluded after checking for character-ID typos; the original and a private recovery archive are preserved. See [the validation report](d1-import-validation.md). Validate the copy:

```bash
npm run d1:import -- "playerData/Player Character Manager - D1 import.xlsx"
```

After validation succeeds, generate a private SQL file:

```bash
mkdir -p migration-output
npm run d1:import -- "playerData/Player Character Manager - D1 import.xlsx" --output migration-output/staging-import.sql
```

Test that import in a separate disposable local database first, following [the migration guide](d1-migration.md). Only after it passes should you import into the **empty remote staging destination**:

```bash
npx wrangler d1 execute DB --remote --file migration-output/staging-import.sql
```

Import is a one-time seed, not an update of an existing campaign. Do not rerun against a partially imported database. The SQL contains account hashes and private campaign data; keep it out of Git and out of the frontend's `dist` directory. The importer never invents missing owners or drops invalid records.

Without imported accounts, the API can answer health checks but nobody can sign in. Do not publish the synthetic local test accounts as production accounts.

## 5. Deploy the Worker API

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

A 501 response identifies an operation that still needs migration; it is not resolved by changing the database binding. Once staging acceptance and the remaining API/cron/file migration work are complete, plan production cutover with a fresh validated export, reconciled browser wallets and a rollback/reconciliation procedure.

References: [D1 setup and bindings](https://developers.cloudflare.com/d1/get-started/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [Cloudflare Pages builds](https://developers.cloudflare.com/pages/configuration/build-configuration/), [Vite environment variables](https://vite.dev/guide/env-and-mode).

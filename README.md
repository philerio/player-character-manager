# Player Character Manager

A React/TypeScript app for campaign wallets, journals, hirelings, fighting forces,
territories, and scouting. Live campaign data comes from an external Google Apps
Script service; working copies and wallet ledgers persist in the browser.

## Run locally

Use Node 24 and npm. This repository includes `.nvmrc`:

```bash
source /home/patrick/.config/nvm/nvm.sh # this workstation's nvm location
nvm use
npm install
npm run dev
```

On Windows, use `npm.cmd` in place of `npm` if PowerShell blocks npm scripts.

```bash
npm test
npm run typecheck
npm run build
```

## Demo data

```bash
npm run dev:demo
```

Open the address Vite prints. The banner links to player (`?demo=player`) and
DM (`?demo=dm`) views and includes a reset button. An unconfigured app also starts
in demo mode. These query parameters select a demo even when a live Sheets URL
is configured. Player and DM demos each have separate browser storage, and all
demo service requests are handled locally without contacting Sheets or Discord.
Reset clears only the current demo role's data.

On the Territories screen, use **View Map** to open the sample map. In the DM
view, **Unlock Hexes** opens unlock mode: click any locked hex, or choose its
number and press **Unlock selected hex**. **Preview full DM map** shows the
matching detail map for the DM without unlocking any player hexes. The center hex stays unlocked. In
normal mode, unlocked hexes open their details and locked hexes offer scouting.
The map controls also support Enter/Space. DM unlocks persist locally; use
**Push Territories to Sheet** in the map toolbar to share them. Players receive
the changes on their next sync. If you have an older demo saved, use **Reset demo**
once to load the new sample maps.

The demo includes two characters, wallets, linked recurring wages, individual
hirelings, a fighting force, a territory, a discovered hex, completed scouting,
and a journal. `src/app/mockData.ts` constructs fresh, typed fixtures. The fake
service supports character and journal CRUD, retainer synchronization, territory
CRUD and field allocations, scouting dispatch/completion, wallet backups, and
tab revision changes. Uploads, recruitment adjudication, promotions, custom
mission synchronization, and account/Discord configuration are not simulated;
those operations report that they require a live connection.

Fixtures follow the column shapes and relationships in the local
`playerData/Player Character Manager.xlsx`. They contain synthetic names and IDs,
with no copied email addresses, credential fields, webhook URLs, or live files.
The workbook is reference material, not an application asset or runtime import.
`playerData/` is ignored by Git because the export includes private account data.

## Live campaign configuration

Copy `.env.example` to `.env.local` and set `VITE_APPS_SCRIPT_URL` to your deployed
Apps Script URL. Set `VITE_PCM_ACCESS_KEY` if your deployment uses an access key.
Leave `VITE_DEMO_MODE=false` and remove demo query parameters for live operation.
Restart Vite after changing environment variables. The backend source is not in
this repository; this client continues using its existing action names and data
contracts. Vite variables are included in the client bundle, so authentication
and authorization remain the backend's responsibility.

## Code organization

- `src/App.tsx`: connects the app controller to the shell.
- `src/components/AppShell.tsx`: navigation, header, screen selection, and modals.
- `src/app/useAppController.ts`: saved startup and feature composition.
- `src/app/useBackgroundSync.ts`: resource readiness, safe background reads, and automatic sync.
- `src/app/transport.ts`, `errors.ts`, `validation.ts`: bounded requests, error types, and runtime validation.
- `src/app/journalStorage.ts`: durable journal operations and acknowledgements.
- `src/components/DataFeedback.tsx`: loading, progress, retry, and storage recovery feedback.
- `src/app/useAccountCommands.ts`: login, password and journal-send callbacks.
- `src/app/useSession.ts`: account state, roster, character selection and profile actions.
- `src/app/useWallet.ts`: local ledger, purchases, recurring expenses and backups.
- `src/app/useRetainers.ts`: working drafts, conflict checks and synchronization.
- `src/app/useTerritories.ts`: territory drafts, queued operations and scouting timers.
- `src/app/useTerritoryCommands.ts`: callbacks shared by the territory screens.
- `src/app/useJournal.ts`: journal mutations and cached journal updates.
- `src/app/territoryActions.ts`: injectable service for recruitment and development.
- `src/app/core.ts`, `forces.ts`, `catalog.ts`: campaign rules, coin values and equipment.
- `src/app/workbook.ts`: uploads and lazy-loaded workbook parsing.
- `src/app/*Storage.ts`, `wallet.ts`, `storage.ts`: persistence and migrations.
- `src/google-sheets-api.ts`: typed API contracts, transport and session caches.
- `tests/`: character switching, draft persistence, stale responses and demo isolation.

`src/app/shared.ts` retains compatibility re-exports. New code should import from
the module that owns the behavior. Feature hooks receive context getters so an
action can read the other feature state from its render without introducing
circular module dependencies.

## Data loading and synchronization

The app shows each character's saved working copy immediately and refreshes the
campaign data in the background. Unknown datasets show a loading indicator;
dropdowns and actions requiring them stay unavailable until the data is ready.
A successful empty result is displayed separately from a failed or unfinished
request. Cached content stays usable during refreshes and connection failures.

Ordinary **Save** actions persist hireling, territory, and journal changes on the
device first. Players and DM-owned characters send pending changes automatically
after a short 2.5-second delay. The app checks for updates when selecting a
character, returning to the app, and reconnecting. While visible it checks
revisions every 30 seconds; unchanged datasets are only fetched again after a
two-minute freshness window. **Refresh now** is available when an immediate
check is useful, but routine edits do not require a Sync click.

| Data or action                                      | Behavior                                                                                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet                                              | The local ledger determines the purse. Backup and restore remain explicit; background refresh never replaces it.                                                                                                             |
| Hirelings and territories                           | Durable drafts are synchronized a change at a time. New edits made while syncing remain pending.                                                                                                                             |
| Journal                                             | Save, edit, and delete are queued locally, including offline. Notes cannot be sent to Discord until confirmed by the campaign.                                                                                               |
| DM editing another player's character               | Drafts remain local until the explicit **Push to Sheet** action publishes them.                                                                                                                                              |
| Campaign conflicts                                  | Preserve local edits and show an actionable error. A confirmed **Refresh and replace local edits** fetches replacement data before discarding anything. Download a working-copy backup before replacing drafts you may need. |
| Scouting dispatch                                   | Saves the mission/timer and sends a targeted DM notification; this action requires a live connection.                                                                                                                        |
| Due scouting                                        | Submits expired local timers, including when reopening the app.                                                                                                                                                              |
| Uploads, account administration, and backup restore | Explicit service actions; failed forms retain their inputs.                                                                                                                                                                  |

The persistent status bar distinguishes saved local changes, pending work,
synchronization progress, confirmed campaign data, offline use, and errors.
Known operation counts use a progress bar; waiting on an unknown-duration
request uses an indeterminate indicator. Each failed dataset has its own retry
control. Character-specific requests are fenced against the selection's
generation, including A → B → A switching.

Reads have a 20-second timeout, deduplicate simultaneous requests, and retry
transient failures once. Writes are not blindly retried by the transport.
Successful mutations are checkpointed immediately; a failed later operation
cannot resend already acknowledged creations. Responses and restored wallet
backups are validated before replacing the working copy.

The external Apps Script backend is not part of this repository. Stable client
mutation IDs are sent for queued creations. If a response is lost and the
backend cannot return that ID with its record, the app stops that creation and
asks for review instead of risking a duplicate. End-to-end deduplication and
atomic conflict checks require backend support; a frontend check cannot close
the race between reading a revision and writing to the server.

If browser storage is full or unavailable, the app reports the problem and keeps
an in-memory rescue copy of attempted writes. Keep the tab open and use
**Download working copy** before leaving. **Retry saving locally** attempts to
persist that copy. Export files omit session-token keys. A successful backend
write is not presented as a durable local save when storage failed.

Regression tests cover offline reconnection, automatic synchronization, partial
success, edits during sync, failed refreshes, stale responses, dropdown readiness,
invalid backups, timeouts, and storage failures.

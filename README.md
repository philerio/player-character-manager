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
- `src/app/useAppController.ts`: cached startup and cross-feature synchronization.
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

## Synchronization rules

| Data or action                      | Behavior                                                                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and character selection     | Read local caches and drafts; selecting a character makes no Sheet request. A live session without an account roster cache may make one recovery roster request at startup.        |
| Wallet                              | The local transaction ledger determines the purse. Changes and recurring charges stay on this device; backup and restore are explicit.                                             |
| Hirelings and territories           | Edits persist as local drafts. Sync sends them; a confirmed authoritative refresh discards unsynced changes. Retainer sync checks remote edits against the draft's base.           |
| Journal                             | Save, edit and delete use the service immediately; explicit profile sync refreshes the journal.                                                                                    |
| DM pushes                           | Explicitly publish the selected tab and advance its authoritative revision. Players apply relevant revisions on their next sync. Wallet revisions do not replace the local ledger. |
| Scouting dispatch                   | Save a local mission/timer and send a targeted DM notification.                                                                                                                    |
| Due scouting                        | Automatically submit expired local timers, including when reopening the app. The timer check runs every 30 seconds.                                                                |
| Uploads and campaign administration | Explicit service actions.                                                                                                                                                          |

Slow character-specific reads are checked against the current selection before
updating the screen. Regression tests cover refresh/restore responses arriving
after switching characters and preservation of local drafts across reopening.

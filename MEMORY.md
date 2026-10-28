# Player Character Manager repository memory

## Deployment rule — user instruction, 2026-10-28

Do not publish local changes to Cloudflare until they are committed in Git.
Require a clean working tree (staged, unstaged, and untracked files), and deploy
through `npm run deploy:ui` or `npm run deploy:api`. Never bypass the guard with a
direct Wrangler/MCP/dashboard deployment or by stashing/ignoring release files.
Keep private environment files, credentials, and campaign exports out of Git.
A commit and a remote push are distinct; report their status accurately.

## Current repository context

- Re-read after pulling; another computer may have newer work. The 2026-10-28
  reread found package version 1.2.2 and an existing desktop/mobile UI version
  sourced from package.json. See CHANGELOG.md rather than guessing versions.
- AGENTS.md defines major.database.update numbering and release documentation.
- Frontend: wrangler.ui.jsonc, Worker player-character-manager.
- API: wrangler.jsonc, Worker player-character-manager-api, with D1 and Cron.
- Build-time backend configuration must match the intended deployment. Do not
  recover settings from an old dist.zip when the current configuration is available.
- D1 now includes accounts, game operations, file storage, scheduling, diagnostics,
  and backup/recovery tooling. Read docs/d1-migration.md, docs/d1-deployment.md,
  and docs/d1-recovery.md before planning hosted changes.
- Earlier auto-refresh UI work is stashed, not part of the current checkout.
  Do not apply it automatically. Version 1.2.2 already belongs to email-only login;
  any future app update must follow the current version history.
- After code edits, run formatting and appropriate static checks/tests.

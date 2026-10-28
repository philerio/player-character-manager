# Version and change tracking

The user wants every app version documented. Maintain `CHANGELOG.md` whenever
making app changes in this repository.

- Follow the user's `major.database.update` numbering: major app/UI overhauls
  increment the first number, database releases increment the middle number,
  and bug fixes/enhancements increment the last number. Reset lower numbers when
  incrementing a higher number. The middle number is not a migration-file count.
- For a new app update, increment the appropriate version in `package.json` and
  keep both root version fields in `package-lock.json` synchronized. The UI reads
  this version automatically. Group related work into one update rather than
  incrementing for each edited file.
- Add a dated entry to `CHANGELOG.md`, newest first. Explain what changed for
  users, any data/compatibility impact, which components must be deployed, whether
  a database migration/import is needed, and validation actually completed.
- Documentation-only changes do not require an app version bump; record useful
  documentation updates under Unreleased instead.
- Distinguish changes prepared locally from confirmed production deployments.
  Do not invent historical version assignments, test results, or deployment
  dates/status. Consult the existing history before assigning a version.

# Cloudflare deployment: mandatory Git rule

Read `MEMORY.md` when starting work in this repository.

- Never publish this repository to Cloudflare with local changes outside Git.
  All release code, UI version labels, package/lock versions, changelog entries,
  deployment scripts, and configuration must be committed first. Require a clean
  working tree, including staged, unstaged, and untracked files.
- Use `npm run deploy:ui` or `npm run deploy:api`. These check Git before publishing;
  UI deployments rebuild from the committed source and check Git again afterward.
  Do not bypass these checks with direct Wrangler/MCP/dashboard uploads, alternate
  configs, stashing intended release changes, or new ignore rules.
- Gitignored credentials, private campaign data, and local build-time environment
  files stay private. Never commit them to satisfy the deployment check.
- Committed means saved in a Git commit. Pushing that commit to the remote is a
  separate action; do not claim a push occurred without verifying it.
- After a pull, reread the current instructions, memory, changelog, package version,
  and relevant source/configuration. Do not replay an old stash or deploy an old
  `dist` build without reconciling it with the current checkout.
- Run formatting checks and the available lint/static checks after editing code.
  This repository currently uses Prettier and TypeScript checks; no lint script is
  configured. Report any checks that could not pass.

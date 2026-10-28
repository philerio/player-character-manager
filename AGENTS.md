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

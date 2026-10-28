# Version history

Changes are listed newest first. Dates show when changes were prepared in this
repository; they do not confirm a production deployment. Numbered history starts
at **v1.2.0**. Earlier work was not individually versioned.

## Version numbering

Versions follow **major.database.update**, matching the version shown in the app:

- **Major**: a large app or UI overhaul, such as `1.2.2` → `2.0.0`.
- **Database**: a database release or significant database change, such as
  `1.2.2` → `1.3.0`. This is not the count of D1 migration files.
- **Update**: bug fixes and enhancements, such as `1.2.1` → `1.2.2`.

`package.json` is the version source for the UI. The top-level version and root
package version in `package-lock.json` must match it. Documentation-only changes
can be recorded under **Unreleased** without changing the displayed app version.

## Unreleased

- Added repository memory and a mandatory clean, committed Git checkout rule for
  Cloudflare releases, with guarded UI/API deployment commands. UI deployment
  rebuilds the committed source and verifies Git again before publishing.
  TypeScript build caches now write to the ignored dependency cache so a build
  does not dirty tracked cache files. This workflow update does not change the
  app version or database schema.
- Deployment workflow validation: six Git guard tests, both deployment entry
  points refusing the uncommitted checkout before build/upload, TypeScript checks,
  JavaScript syntax checks, and formatting checks passed. No Cloudflare deployment
  was performed.

- Added this version history and repository instructions for maintaining it with
  future updates.

## v1.2.3 — 2026-10-28

### Quiet automatic refresh

- Routine automatic campaign checks no longer show Updating/progress beside the
  character name or change the header to Refreshing campaign.
- Initial loading, manual refreshes, saves, errors, and detailed dropdown progress
  remain visible. Automatic checks and data synchronization continue unchanged.
- Desktop and mobile version labels now read v1.2.3 from the package version.

**Deployment:** Rebuild/deploy the UI from a clean committed checkout. No API
update, database migration, or workbook import is required. Prepared locally;
not confirmed deployed.

**Validation:** All 164 frontend tests passed, including quiet automatic refresh
and visible manual refresh coverage. TypeScript checks, production build, and
formatting checks passed. Build reports a chunk-size advisory; no lint script is
configured.

## v1.2.2 — 2026-10-19

### Sign-in and password recovery

- Removed the player-name dropdown from D1 sign-in. Players now enter only their
  email and password, without waiting for a player list to load.
- Changed D1 password recovery to identify the account by email.
- Kept display-name entry during registration and the existing name selector for
  the legacy Google Sheets backend.
- Normalize email capitalization and surrounding whitespace while preserving
  passwords exactly as entered. Added email autofill support.
- Prevent duplicate submissions while a request is running and keep recovery
  questions tied to the email used to request them.
- Check that an email-only login response belongs to the requested email before
  saving its session.
- Retained support for older login/recovery requests containing a player ID.
  Login throttling uses the same account bucket across old and new requests.

**Deployment:** API first, then rebuild/deploy the UI. No database migration or
workbook import required; existing accounts and passwords remain valid.

**Validation:** 163 frontend tests, 64 API tests, frontend and Worker type checks,
production build, and formatting checks passed.

## v1.2.1 — 2026-10-19

### Version visibility on mobile

- Display the app version beneath the character name in the mobile header, where
  the sidebar is hidden.
- Use the same version source for mobile and desktop.

**Deployment:** Rebuild/deploy the UI. No API or database update required.

**Validation:** Production build passed.

## v1.2.0 — 2026-10-19

### First displayed version

- Established `v1.2.0` as the numbered baseline for the current D1 app.
- Display the version beneath the campaign name in the desktop sidebar.
- Read the displayed version from `package.json` and document the numbering
  scheme.

### Territory sync fixes included in this baseline

These fixes were prepared immediately before numbered releases were introduced:

- Treat saved Develop Land results as confirmed campaign data rather than queue
  them again as unsaved field edits.
- Preserve both returned hex updates and any newer local edits.
- Acknowledge territory revisions after successful saves and explicit campaign
  refreshes so the next edit does not trigger a false conflict.
- Describe conflicts as campaign updates instead of attributing every change to
  the DM.
- Add **Download working copy** and **Load campaign copy** beside territory
  conflicts. Replacing pending edits requires confirmation; failed or cancelled
  refreshes keep the local draft.

**Deployment:** Rebuild/deploy the UI. These changes require no additional D1
migration or workbook import.

**Validation:** Territory sync fixes passed 157 frontend tests and type checks.
The production build, including the initial version label, passed.

## Maintaining this history

For each app update, add an entry containing the version, date, user-visible
changes, relevant data or compatibility effects, deployment requirements, and
checks actually completed. Keep new entries above older versions. Move any
applicable Unreleased notes into the numbered entry when preparing that version.

Do not guess older version numbers, test results, deployment dates, or deployment
status. Record confirmed deployments separately when that information is known.

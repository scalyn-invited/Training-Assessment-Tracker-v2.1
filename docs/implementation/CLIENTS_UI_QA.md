# Clients UI verification — 17 November 2026

Scope: authenticated Global Admin `/platform/clients`, based on read-only Figma desktop `6939:1831` and mobile `6939:4866` in file `eQejFiVgug5zmBTd9aVGHx`. The user authorized implementation with current workflows while the team prepares the userflow. No Figma writes, new backend behavior, database migrations or permission changes.

## Implementation and deliberate adaptations

- Reuses the Overview shell, theme handling, Settings dialog, dynamic branding/profile and logout. Overview/Clients have correct active navigation and original exported icon variants.
- Desktop directory table and stacked narrow-screen entries use real client names, status and effective member/admin counts. Search/status, URL history, mobile sorting, pagination, empty/error/retry states remain available.
- Create/Manage retain required reasons, displayed versions, explicit suspension/reactivation confirmation, error value retention and Escape/focus return. The client UUID remains available inside Manage.
- Open workspace calls the existing `/clients/select` endpoint and reloads the learning dashboard so client context and rotated CSRF are fresh. Inactive/suspended actions are disabled; server authorization remains authoritative. Errors allow retry.
- Client account access remains in an expandable section. People & access opens it, including direct URL/reload and a repeated link after closing it. A mount callback handles delayed authenticated-shell rendering.
- Original local SVG exports retain their intrinsic dimensions. Nine Clients exports supplement the shared Overview exports. Light-theme CSS darkens the pale filter/sort glyphs without changing the SVG files or geometry. Configured logos remain dynamic.
- Retains local Inter/Segoe UI font fallback. Mobile search is 16px; coarse-pointer controls are at least 44px. Mobile sorting and expandable account access extend the supplied mockup to preserve existing functionality. Narrow desktop widths also use stacked entries to avoid compressed table columns. Light/branded themes retain application tokens; the supplied Figma reference is dark.

The implementation choices above retain current behavior while administration-screen userflows are confirmed. Manage remains a dialog; Open workspace goes to the existing learning dashboard; People & access opens the retained account controls. These are interim mappings, not inferred acceptance.

## Browser evidence

All tests use `playwright.clients.config.ts`, system Chrome with isolated contexts and the existing isolated Overview runner. Every run creates fresh private storage and ephemeral PGlite on ports 3110/3111/55432; `.env` is bypassed, live AI/email disabled, and build output is `.next-overview`. The saved personal demo workspace is not used by tests.

- Focused Clients test: passed, 15.7-second test / 22.9 seconds overall. Real setup/login, live counts, create/rename, suspend/cancel/confirm/reactivate, competing stale version rejection, retained input, Escape/focus return, filters/empty state, directory failure/retry, client-selection failure/retry and real selection, account deep links/reload, light/dark axe WCAG A/AA, 320/390/768/1024/1440px overflow, touch control sizes/footer clearance, exported asset geometry, and non-admin UI/API denial. No browser page errors.
- Existing directory-history regression: passed, 6.8-second test / 13.7 seconds overall. Direct query URLs, pagination, Back/Forward, reload, clearing filters and invalid query normalization.
- Existing password account-access regression: passed, 4.8-second test / 11.8 seconds overall. Preserved selections, explicit confirmation, stale permission-version rejection, mobile accessibility and actual grant/revoke results. Its entry step now expands the section.
- Existing mock account-access regression: passed, 3.6-second test / 12.1 seconds overall. Explicit join and ambiguous defaults; uses the deep link to open the section.
- Overview regression: passed, 16.9-second test / 24.8 seconds overall. Shared-shell behavior, themes, live data, error/empty states, dialogs, role denial and retained learning flows.

Commands (PowerShell; each suite runs separately with fresh test data):

```powershell
$env:UI_QA_SCREENSHOTS = 'output/playwright/clients-review'
npx.cmd playwright test --config playwright.clients.config.ts
$env:CLIENTS_QA_SUITE = 'history' # also accounts, accounts-mock, overview
npx.cmd playwright test --config playwright.clients.config.ts
```

For the Overview rerun, `UI_QA_SCREENSHOTS=output/playwright/clients-overview-regression` avoided overwriting an image held open by a local viewer.

## Fixes and limits

Visual review found the global input selector overriding search padding/margins and uppercase table headings. Scoped rules correct both. Light filter/sort icons were made legible. Account-section mounting now restores a hash deep link even when the authenticated shell mounts later; the test also waits for link navigation before reloading. An added member-denial fixture initially expected `/dashboard`; the existing correct member landing route is `/clients`, and the test was corrected. The first Overview rerun failed writing a viewer-locked screenshot; fresh artifact paths passed.

`npm.cmd run typecheck` and the final `npm.cmd run build` passed. Production build used `NEXT_TELEMETRY_DISABLED=1` and `NEXT_DIST_DIR=.next-clients-build` to avoid the saved dev server's output. Next-generated `next-env.d.ts` and `tsconfig.json` changes were restored afterward. The saved local app's readiness endpoint and Clients page returned HTTP 200.

`npm.cmd run verify:baseline` could not qualify the legacy source: `source-baseline.json` points to `C:\Users\cabas\Documents\Codex\Projects\Training Assessment Tracker V2`, which does not exist on this machine. The script reports missing reads as changed files (all 366); this is not evidence that V2 was modified. No baseline manifest or V2 file was changed. This environment limitation is also recorded in the team `.txt` notes.

No full domain/PostgreSQL requalification or human technical/UX/owner acceptance is claimed. UX Engine is referenced by repository guidance but no corresponding installed skill was found; existing design guidance, Figma context and scoped browser/accessibility checks were used.

## Visual artifacts

Final review images are in `output/playwright/clients-review`: dark/light desktop at 1440px, dark/light mobile at 390px with enough viewport height to show the full directory and retained account section, and a touch viewport at the page bottom. These are isolated fictional test data. Earlier screenshots in `clients-final` and the output root are superseded.

The changes remain local and uncommitted. No remote push, PR, deployment, live email or paid AI call was performed.


## PR review artifacts

Committed synthetic screenshots: [desktop](screenshots/clients/dark-desktop.png) and [mobile](screenshots/clients/dark-mobile.png). The Clients PR is stacked on the Overview branch to isolate the Clients changes. CI adds focused Clients, directory history, password account-access and mock account-access browser suites with separate ephemeral data, alongside inherited Overview/shell checks. Each job uploads its report and screenshots. Leave both PRs unmerged for Bernie.

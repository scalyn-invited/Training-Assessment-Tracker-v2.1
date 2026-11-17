# People & access UI — local verification, 17 November 2026

## Scope

User-authorized implementation of Figma file `eQejFiVgug5zmBTd9aVGHx`, All accounts desktop/mobile `6939:2013`/`6939:5012`, Global admins desktop/mobile `6939:2352`/`6939:5326`.

Local branch: `ui/people-access-figma`, based on `ui/clients-figma` at `86dd1ae`. Overview/Clients PRs remain separate dependencies. This checkpoint does not record a People PR, remote CI, merge or human acceptance.

## Behavior

- `/platform/people` uses the existing scoped platform shell with People selected on desktop and mobile. Other platform pages retain their current presentation.
- All accounts and Global admins use live records, memberships, role badges and search-independent tab totals. Search, clear, numbered pagination, direct links, reload and browser history work without dropping unrelated query parameters/hash.
- Add account links to the existing `/accounts` creation/invitation flow. It does not silently create users or send invitations.
- Manage access reuses the existing Client Admin form, requiring client/action selection, reason, confirmation and displayed permission version. Password-mode membership still requires owner acceptance. It also offers existing Global Admin appointment/revocation operations with explicit reason/confirmation, last-active-admin protection, stale-state recovery and session invalidation.
- The old `/platform/admins` page and `/platform/clients#client-account-access` links remain available.
- Five original Figma SVGs are stored locally, without altering their geometry. Existing matching shell assets/components/tokens are reused. No runtime Figma asset URLs or new UI dependency.

## Read API adaptation

`GET /platform/client-accounts` adds optional `view=admins` (default `all`). All-account eligibility remains unchanged. The admin view returns current platform grant holders, including inactive holders as the original Global admins directory does; expired/future grants are excluded. Search and pagination run on the server for both views.

Added fields: `global_admin_id`, `account_active`, `accountTotal`, `adminTotal`, `activeAdmins`. Current eligibility includes active identity, environment/synthetic rules and imported-permission freshness. Counts do not depend on search or page. Every read retains the existing Global Admin authorization transaction. No mutation, lock, invitation, training-access or last-admin rule was changed. OpenAPI documents the additive fields/filter.

## Interim choices for later userflow review

- Retain the API's 20-row page size; the Figma sample shows ten rows.
- Show actual local names, counts and memberships, not Figma fixture data.
- Label client administration as “Client Admin” to distinguish it from platform authority. For multiple memberships, associate role labels with their clients rather than imply one universal role.
- The supplied frames specify directories only. Add account retains its current destination; Manage access composes existing guarded operations in a dialog. Final form/userflow design remains open.
- Keep the existing light/branded themes. Use 16px mobile search text and at least 44px coarse-pointer controls, even where the static frame is smaller.
- UX Engine was not available among the installed skills/tools; existing design conventions, Figma context, browser screenshots and axe checks were used. No UX Engine run or human review is claimed.

## Automated evidence

All browser work uses `scripts/overview-browser-start.ts`: isolated ephemeral PGlite/storage, ports 3110/3111/55432, `.next-overview` build output, and disabled live AI/email. The saved demo workspace was not used for tests.

- `npx vitest run tests/platform-client-accounts.test.ts tests/platform.test.ts`: 16 tests passed, 7.52 seconds.
- `npx vitest run tests/people-directory.test.ts tests/api-contract.test.ts`: four tests passed, 3.56 seconds. Covers real membership/platform data, counts independent of search, >20 Global Admins, inactive/stale/expired/future grants, authorization and filter validation.
- `CLIENTS_QA_SUITE=people npx playwright test --config playwright.clients.config.ts`: passed, 17.7-second test / 25.6 seconds overall. Real grant/revoke and appointment/revocation, stale version recovery, last-admin protection, ordinary member denial, search/pagination/history/reload, errors/retry/empty states, light/dark themes, 320–1440px overflow, mobile dialogs, axe WCAG A/AA, touch targets and exported SVG intrinsic geometry.
- Affected browser regressions passed: Overview (17.3 seconds), Clients (25.2 seconds), password account access (5.5 seconds), mock account access (3.0 seconds). Old client account deep links remain covered.
- `npm run typecheck`: passed.
- `NEXT_DIST_DIR=.next-clients-build npm run build`: passed, including `/platform/people`.
- `git diff --check`: passed.

Initial browser assertions were corrected to distinguish the page's alert/status messages from the Next route announcer and loading/success messages. Navigation now clears an obsolete access-change success message. Screenshot review also corrected inherited uppercase table headings. Explicit query result types corrected a TypeScript inference error in the new tests before the passing build.

Final screenshots were generated in `output/playwright/people-review-final/`; review copies are in `screenshots/people/`. Desktop and mobile, dark and light screenshots were visually inspected. Pagination intentionally shows twenty real records. No full application/PostgreSQL concurrency requalification is claimed for this bounded read/UI change. The previously recorded missing V2 baseline location remains outside this UI task; V2 and the baseline manifest were not edited.

# Shared UI foundation — local verification, 18 November 2026

## Scope and boundaries

First bounded implementation on `ui/global-design-system`, following the full-history reconciliation documented in `GLOBAL_UI_INTEGRATION.md`. This extracts the current reference presentation into reusable controls. It does not replace either authenticated shell, migrate the remaining routes, resolve the assessment-fix source, or establish global completion. No push or deployment.

UX Engine is now available locally. Applied its design-system, visual-character, responsive and state-completeness instructions, preserving the existing Figma character over skill defaults. `DESIGN.md` records the current global contract separately from its preserved historical sections. The UX Engine completeness check passes with no missing sections and a 153-degree accent/danger hue separation.

## Implementation

- `apps/web/app/components/ui/tokens.module.css`: opt-in semantic palette, font, type sizes, spacing and radii extracted from Overview and Clients. Plain Dark retains the navy Figma palette; other theme names inherit the current resolver. No branding/theme persistence code changed.
- `controls.tsx` / `controls.module.css`: shared Button, PageHeader, Panel, Badge, Input, Select, Textarea, Feedback and route-link tabs. Buttons retain caller-supplied busy/disabled state and explicitly submit where required. Fields retain names, validation, native attributes, refs and event handlers.
- `dialog.tsx`: extracted native dialog used by Overview system status, Personal settings and Audit details. Escape/focus return and close callbacks remain. Focus containment now includes form controls and skips disabled fieldsets; the browser regression exercises these boundaries with a removable DOM fixture.
- `directory.tsx` / `directory.module.css`: extracted native Clients table, its existing 1270px stacked rows, and pagination wrapper. Existing column widths, labeled cells, sort actions, conditions, page updates and URL/history behavior remain feature-owned.
- Overview uses shared headers, panels, recovery buttons and feedback. Settings uses shared headers, navigation tabs, ordinary text/select fields, save/discard controls and status recovery. Clients uses the shared directory, badges and pagination. All five reference screens inherit the extracted token scope through the reference shell.
- Removed the old OverviewDialog component only after moving every import. Removed its old CSS, duplicate header/panel declarations and Settings tab/button rules. Legacy global styles, authenticated shell, editor styles and assets remain until their actual route consumers migrate.

The primitive library is opt-in. Availability of a variant such as Textarea or a danger button is not evidence for a future route that uses it; every future consumer requires its own checks.

## Automated evidence

Each Playwright invocation starts a separate ephemeral PGlite database and storage through `scripts/overview-browser-start.ts`, ports 3110/3111/55432 and `.next-overview`. No saved demo database is used. The following results are from the final relevant implementation, after correcting the header reset specificity:

| Check | Result | Coverage |
| --- | --- | --- |
| `npx.cmd playwright test --config playwright.overview.config.ts` | Passed, 15.2s test / 22.8s total | Live counts and partial failures, retry/empty states, role denial, dark/light, 320–1440px, coarse-pointer targets, keyboard containment/Escape/focus return, exact 8px subtitle gap |
| `CLIENTS_QA_SUITE=settings` with `playwright.clients.config.ts` | Passed, 17.7s / 24.9s | Real branding save, previews/discard, logo upload/removal/rejection, reason validation, stale version with retained values/reload, read-only status/error/retry, old appearance URL, role denial, keyboard field/tab traversal, mobile 16px controls, light/dark/neon/generated platform palettes, personal preference persistence |
| `CLIENTS_QA_SUITE=clients` | Passed, 17.8s / 25.8s | Real client management, guarded suspension and workspace selection, labeled stacked rows, desktop/mobile accessibility and empty/recovery behavior |
| `CLIENTS_QA_SUITE=people` | Passed, 14.3s / 21.4s | Account directory and Global Admin safeguards, last-admin protection, filters/paging, desktop/mobile and denial |
| `CLIENTS_QA_SUITE=audit` | Passed, 14.4s / 21.6s | Read-only event projection, details dialog, immutable evidence, filters/history, desktop/mobile and denial |
| `CLIENTS_QA_SUITE=history` | Passed, 7.4s / 14.3s | Clients direct URL, reload, Back/Forward, pagination and mobile filter/sort restoration |
| `OVERVIEW_QA_SUITE=shell` with `playwright.overview.config.ts` | Passed, 12.7s / 20.4s | Existing role redirects, scoped overviews, client switching and mobile navigation across the untouched legacy boundary |
| `npm.cmd run typecheck` | Passed | Server and web; also passed after restoring known generated Next config files |
| `NEXT_DIST_DIR=.next-clients-build npm.cmd run build` | Passed | Production compilation and existing route generation, using separate build output |
| `git diff --check` | Passed | No whitespace errors |

Browser suites include axe WCAG A/AA checks, horizontal-overflow checks and real workflow assertions; these are automated evidence, not human acceptance. No new full-domain/PostgreSQL qualification is claimed because backend and migration code did not change.

## Visual inspection and fixes

Inspected Overview desktop/mobile, Settings Appearance desktop/mobile, Clients desktop/mobile, People desktop, Audit desktop and Audit details mobile. Their existing navy panels, type hierarchy, table/stacked-list layouts, responsive navigation and dialog treatment are retained. Screenshot evidence is in `screenshots/global-foundation/`; additional light/touch/state captures remain in `output/playwright/global-foundation/`.

The first extraction run exposed a header-spacing regression during visual inspection: the shell's element reset could override the shared header's paragraph margin after stylesheet reordering. Changed only the shell reset selectors to lower-specificity `:where(...)`; added exact 8px subtitle checks in Overview and Settings and reran both successfully. An initial mechanical JSX replacement left one mismatched closing tag; formatting caught it before tests, and it was corrected before TypeScript/browser verification.

The first Overview browser invocation exited during server startup without a diagnostic cause. An unchanged diagnostic rerun passed; final post-fix verification also passed. This is recorded as an unexplained startup observation, not an application defect diagnosis. Early health-proxy connection refusals during server startup recovered before test execution.

UX Engine contrast calculations: warning light 5.95:1, warning dark 9.61:1; success light 5.78:1, success dark 8.88:1; white text on dark-theme blue action 4.75:1. Generated palette accessibility is additionally exercised in Settings. New client-workspace consumers still require client-brand/personal-precedence checks when migrated.

## Preservation and next boundary

All 67 original untracked files from the preparation manifest remain byte-for-byte unchanged; stashes are unchanged. The local UX Engine folder was read, not installed, modified or staged. Application API/worker/domain/database/migration/scripts and assessment implementation files have no changes in this checkpoint. Ignored preservation results are in `.runtime/global-ui-prep/foundation-preservation.json`. Generated Next `tsconfig.json` and `next-env.d.ts` changes were restored to their known initial contents after testing/building.

All 38 route migration rows plus two recovery surfaces remain open. The next bounded implementation is the generalized authenticated shell with remaining platform/account pages, retaining existing role and client-selection logic. Assessment migration and any claim of complete source reconciliation remain dependent on the branch/commit clarification already drafted for Bernie. No human acceptance, full parity or production readiness is claimed.

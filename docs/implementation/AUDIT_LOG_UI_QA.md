# Audit Log UI — 17 November 2026

## Scope and design

User-authorized implementation of Figma file `eQejFiVgug5zmBTd9aVGHx`, desktop `6939:2491` and mobile `6939:5430`. Branch `ui/audit-log-figma` is based on People & access commit `5977ac4`. Prior UI PRs remain dependencies.

The Audit Log now uses the shared platform shell with its own selected navigation state, four main filters, expandable advanced filters, collapsible UTC date groups, responsive event rows and a read-only Details dialog. It uses the original Figma icons at their intrinsic dimensions, reusing the exact matching search/shell assets. No library or external font dependency was introduced.

## Preserved behavior

- Existing `/platform/audit` GET, Global Admin gate, environment isolation, date validation and approved change-field projection are unchanged. No backend code, database migration or audit-write operation was added.
- Retains Action, reason/target search, Exact target ID, Actor name, inclusive UTC From/To dates and 25-event pagination. Native date/select controls remain keyboard accessible. Apply resets pagination; Clear resets all filters.
- Filters/page are now represented in the URL and restored on reload and Back/Forward. Unrelated URL parameters and fragments are retained. Pending superseded requests are ignored.
- Groups preserve API ordering and use UTC dates rather than browser timezone. The badge counts only the group's events on the current page, explicitly labeled for assistive technology and by tooltip; it does not claim a daily total across pages.
- Details retains the source-approved scalar and Before/After presentation, complete target/event IDs, raw action key, operator fallback, timestamp and reason. Raw HTML is never rendered. Empty payloads remain explicit. The dialog supports Escape, focus trapping/return and reopening the same event.
- There is no export, edit or delete operation. Userflow work does not authorize expanding the audit data allowlist.

## Interim design choices

The supplied frames do not include expanded filters or Details. Actor and Exact target are placed under More filters; Details uses the existing accessible platform dialog. Existing raw target IDs remain authoritative: long desktop values truncate visually and remain available via tooltip, mobile text and the full Details view. No friendly names are fabricated. Action labels retain source keys with readable spacing/capitalization, alongside the raw key.

The existing light/branded themes, actual account/brand data and accessible contrast are retained. Mobile controls use 16px input text and 44px coarse-pointer targets. Below 361px, filters stack in one column to keep native date inputs usable. Other mobile widths use the supplied two-column filter layout.

UX Engine is not available among the installed skills/tools. Figma design context, current components/tokens, browser screenshots and axe checks were used; no UX Engine or human review is claimed. Team clarifications are kept separately in the local `.txt` draft.

## Verification

QA uses the existing isolated ephemeral PGlite/storage runner on 3110/3111/55432 with `.next-overview` output and live email/AI disabled. The saved local demo database was not used for test fixtures. Screenshots contain only isolated fictional test data.

- `npx vitest run tests/platform.test.ts`: 11 passed (3.05 seconds), including audit filtering/environment isolation, approved payload projection and ordinary-account denial.
- `CLIENTS_QA_SUITE=audit npx playwright test --config playwright.clients.config.ts`: final pass, 12.6-second test / 19.6 seconds overall. Covers all filters, empty/error/retry states, inclusive UTC boundaries, pagination across dates, URL/history/reload, collapsible groups, operator attribution, scalar and Before/After details, secret-field exclusion, same-event dialog reopening, unchanged audit-row snapshots, role denial, light/dark desktop/mobile axe A/AA, 320–1440px overflow and intrinsic SVG geometry.
- Overview browser regression: passed (16.2-second test / 23.3 seconds overall).
- People & access browser regression: passed (14.7-second test / 22.5 seconds overall), including the shared settings dialog.
- TypeScript and production build with separate `.next-clients-build` output passed.
- The integrated browser test's audit labels/details navigation were updated to the new visible UI while retaining its assertions. Its complete run is included in remote CI.

Final screenshots are generated under `output/playwright/audit-final/`; selected review copies are in `screenshots/audit/`. Desktop/mobile, light/dark and Details screenshots were visually reviewed. The final focused run additionally checks the footer remains above fixed mobile navigation after scrolling to the bottom.

No V2 files or baseline manifest were edited. The previously recorded missing local baseline folder remains outside this UI change. Local evidence does not imply human acceptance, deployment, merge or full-port qualification; remote check results are recorded on the PR when available.

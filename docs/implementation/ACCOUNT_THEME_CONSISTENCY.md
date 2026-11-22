# Account theme consistency — t_71fbc8b1

## Scope and cause

Owner requested `/accounts` and `/account/security` match other pages with a Global Admin in Learning. Source baseline: `ff1d19f`. Inspected owner screenshots: Learning Overview was navy Dark while Accounts was Light with the same selected Demo Client 2. Reproduced against a fresh isolated real API/PGlite fixture with the established account-suite synthetic credentials (not the operator credentials/database).

Both pages already use ApplicationShell, shared PageHeader/Panel/fields/buttons and semantic tokens. The mismatch was not CSS: `sharedAppearance` classified all account URLs as platform/shared, so their server and hydrated branding requests ignored the selected client's preference. Ranked alternatives (duplicate page CSS, missing shell scope, theme authority mismatch) were resolved by source tracing and real-browser RED: identical shell components but `shared=1`, Light instead of the client's Dark/neon/generated Dark.

## Implementation

- `apps/web/app/components/appearance-state.ts`: account administration/security use selected-client appearance; without a client retain shared appearance. Guest account links, client chooser and platform routes stay shared. Initial snapshot carries optional client scope; pre-body script must not apply a platform override on client-scoped account pages.
- `apps/web/app/initial-appearance.ts`: reuse selected client from the existing authenticated context read for the same first-document scope decision. No extra API/database contract.
- `apps/web/app/components/brand-header.tsx`: hydrated resolver uses the same classification, using the initial snapshot's client while session context resolves. Existing authority gates, stale-response isolation and picker persistence remain in use.
- `apps/web/app/appearance-outage.test.ts`: server authority and pre-body preference regressions, plus preserved outage policy tests.
- `tests/account-theme-browser/theme.spec.ts`, `playwright.account-theme.config.ts`: isolated theme regression matrix. Separate config prevents two setup-dependent account suites sharing a database lifetime.
- `DESIGN.md`: account-scope exception updated to the owner's requested Learning consistency; all other visual/workflow rules unchanged.

No page markup, CSS, backend, access-control rules, account/security handlers or dependencies changed. Selected client controls and workflow scope are unchanged; this corrects appearance selection only.

## Evidence and checks

Evidence archive: `evidence/account-theme-consistency.tar.gz`. Logs retain original failures and final passes.

- Original real-API browser RED: both account routes rendered Light while Learning used saved Dark, Neon Cyan and Platform Dark. Original four-palette test then passed unchanged (52.8 seconds).
- Expanded dev matrix: PASS (one test, 2.3 minutes overall). Built Next matrix: PASS (one test, 1.5 minutes overall). Nine palettes: Light, Dark, Neon Cyan/Emerald/Amber, Platform Light/Dark, Client Light/Dark. Each compares both routes' semantic background/surface/text/border/accent tokens with Overview, checks SPA navigation and reload, selected-client retention, 1440/800/390 widths, overflow and axe A/AA checks. Also exercises no-client shared-picker persistence, client-picker persistence back to Overview and unchanged platform preference.
- Existing unchanged `tests/account-ui-browser/accounts.spec.ts`: PASS (one test, 2.1 minutes overall). Covers account outages/retry, review/validation/private link issuance and cancellation, MFA enable/disable, password-change sign-out, mobile navigation/focus, synthetic dirty-work guards, client-admin/coordinator/member permission checks, widths including 320 and 800, axe and no page errors. Only isolated synthetic account credentials were changed by this existing test; private values are not screenshotted/traced.
- Existing built `tests/expanded-appearance-browser/scope.spec.ts`: PASS. Retains selected-client/navigation authority/race coverage.
- Appearance policy: initial RED 2 failed / 14 passed; final 20 passed. Branding domain: 6 passed.
- `npm run typecheck`, normal production build and isolated `.next-expanded` production build: PASS. Formatting/diff checks recorded at handoff.

Inspected screenshots: original Dark Accounts (actually Light), corrected Dark Accounts desktop, Dark Security mobile, built Dark Overview and Accounts, built generated Client Dark Security mobile. Shared navigation, typography, panel/control shape and spacing remain consistent; narrow forms wrap without overflow. This is bounded automated and visual inspection, not full manual WCAG 2.2 certification or cross-browser/device qualification.

### Environment issues retained

Readiness polling logged transient API ECONNREFUSED while the isolated API was starting; tests subsequently ran successfully. An initial optional built-renderer run failed at `/auth/setup`: that build omitted `API_INTERNAL_ORIGIN` and Next baked its default 3101 proxy rather than the fixture's 3111. The setup request was rejected; no later test actions ran. The corrected explicit 3111 build and rerun passed. The new account-theme config now checks the built rewrite manifest before starting or sending fixture requests and rejects any destination other than the isolated 3111 API. Do not reuse the misconfigured build; always set the API origin **at build time**, not only at `next start`. This failed attempt remains in the archive and is not counted as a product regression or a passing isolated run.

## Reproduction commands (repository root, Git Bash)

```bash
npm ci --ignore-scripts
npx vitest run -c vitest.appearance.config.ts
npx vitest run tests/branding.test.ts
npm run typecheck
UI_QA_SCREENSHOTS=output/account-theme-matrix npx playwright test -c playwright.account-theme.config.ts
UI_QA_SCREENSHOTS=output/account-behavior npx playwright test -c playwright.account-ui.config.ts
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
QA_BUILT=1 UI_QA_SCREENSHOTS=output/account-theme-built npx playwright test -c playwright.account-theme.config.ts
QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts
```

Run browser suites sequentially (ports 3110/3111/55432). Chrome installed locally; independent in-memory test database/private runtime storage; live SMTP/account mail/AI disabled. Next may rewrite `next-env.d.ts`/tsconfig for build directories; those generated changes are not part of this correction.

## Handoff

Frontend implementation complete; independent QA child `t_b23a00b1` and orchestrator `t_f9f57b75` own final review. No deployment, remote push or overall acceptance is claimed. Review the exact implementation commit and rerun the commands above; do not infer that the operator's running application contains this worktree correction.

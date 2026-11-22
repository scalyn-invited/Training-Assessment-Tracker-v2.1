# Shared shell and platform/account presentation — 18 November 2026

## Scope

Bounded migration of `/platform/admins`, `/accounts` and `/account/security` on local `ui/global-design-system`. The seven reference routes also now use generalized `ApplicationShell`. Other routes still use the legacy authenticated/guest layouts. This is not global migration completion, human acceptance, full parity or production qualification. No push or deployment.

Bernie's complete `codex/assessment-workflow-fixes` branch at `e44b295` is integrated by merge `dffeacd`, following the explicitly QA-pending UI checkpoint `9f60b1f`. See `GLOBAL_UI_INTEGRATION.md` for ancestry and the two conflict resolutions. Assessment presentation has not been migrated; upstream workflow code, tests, migrations 0032/0033 and historical evidence were integrated together.

## UX Engine and implementation

Applied the local design-system, visual-character, responsive, state-completeness, restyle and form-ux instructions. Existing Figma character and workflows take precedence over generic defaults. Before: these three pages used legacy panels/forms and the second authenticated sidebar. After: shared Figma typography, semantic light/dark colors, compact fields, 24px section spacing, 14px bordered panels and reference navigation. Existing field order, action grouping, confirmations, validation and result handling remain.

- `components/application-shell.tsx` replaces the reference-only `OverviewShell`, supplying platform or learning navigation from existing role predicates. Platform keeps its reference mobile bar; existing learning links use a native mobile menu dialog. Account controls, theme scope, selected client, branding and active URL remain explicit.
- `components/app-shell.tsx` opts in only the seven reference routes plus these three pages. Existing context loading, client selection, logout and role checks remain. Both context-changing mutations retain Bernie's pre-mutation work guard. Denied platform visitors receive their authorized learning navigation and the page's existing denial.
- `ui/form-layout.module.css` and `ui/password.tsx` share existing panel/form and password show/hide behavior. Native required/min/max/autocomplete semantics remain. Password controls use an explicit 8px grid gap so button reset specificity cannot collapse their spacing.
- Global administrator directories use shared stacked tables/pagination and the native shared dialog. Last-admin protection, reason/version requirements, stale reload and session invalidation remain.
- Account access retains inline review, private one-time result/hide, recovery and issued-link cancellation. Security retains authenticator setup, one-time recovery display, disable and password-change sign-out. No account workflow or API authorization was redesigned.

Account routes intentionally retain their existing shared/platform branding scope even with a selected client. The theme resolver was not modified. Client-scoped pages and themes remain subject to their own later migration checks.

## Verification

Tests use ephemeral PGlite/database/storage fixtures, separate Next output and synthetic `.invalid` accounts. No saved demo data, production email or live AI was used. `playwright.account-ui.config.ts` disables failure screenshots/traces because this journey creates private setup/MFA material. Its six manual screenshots are captured before those secrets appear.

| Check | Evidence |
| --- | --- |
| Account UI browser suite | Real grant/revoke and last-admin protection; stale conflict retaining reason/reload; empty search and outage/retry; private-link review, wrong-password validation, retained inputs, result hiding and cancellation; MFA enrollment, ten recovery codes, hiding, recovery-code disable, wrong-password validation and password-change sign-out; injected security outage/reload and unavailable-mode response; Global Admin, Client Admin, Coordinator and Member navigation/denial; keyboard dialog wrap/Escape/focus return; light/dark axe A/AA and overflow checks including 320, 390, 800 and 1440px; new shell canceled switch/logout sends no mutation |
| Reference browser regression | Overview, Settings, Clients, People, Audit, directory history and existing shell suites; retains their feature-specific permissions, branding/theme precedence, validation, navigation, dialogs and responsive assertions |
| Migration/workflow/API domain regression | 42 tests across eight suites passed, 24.61s: migration-integrity, assessment-definitions, assessment-assignments, assessment-responses, assessment-reviews, access-membership, platform, api-contract |
| Account/auth/branding domain regression | 30 tests across four suites passed, 12.48s: auth, accounts, branding, platform-client-accounts |
| Upstream workflow browser regression | All 22 fixtures passed, 20.1s, using installed Chrome via ignored `.runtime/global-ui-prep/workflow-chrome.config.ts`; covers publication/save uncertainty and stale state, references, handoff/copy, review/member feedback and context guards |
| Real Next workflow navigation | Passed, 5.3s test / 15.7s overall, from isolated detached worktree at `dffeacd`; verifies dirty builder sidebar/history cancellation and clean navigation with mocked APIs and no environment files |
| Production build | Passed using `NEXT_DIST_DIR=.next-clients-build`, preserving separate browser/development output |

Final browser results (test / overall seconds): Account UI **20.9 / 27.8**; Overview **15.1 / 21.9**; Settings **18.3 / 25.5**; Clients **16.3 / 23.5**; People **14.6 / 21.9**; Audit **12.8 / 19.8**; directory history **7.2 / 14.0**; shell **10.6 / 17.7**. All eight suites passed. TypeScript passed after restoring only the known generated Next configuration changes; `git diff --check` passed. These outcomes are also recorded in `FEATURE_CHECKLIST.md`.

Commands: `npx.cmd playwright test --config playwright.account-ui.config.ts`; reference configurations and suite environment variables are as recorded in `GLOBAL_UI_FOUNDATION_QA.md`. Standard `npm.cmd run typecheck` and `npm.cmd run build` apply.

Visual inspection: desktop/mobile screenshots for all three pages under `screenshots/global-account/`. Corrected the password-control spacing before final screenshots. The fixed platform bottom bar appears at the viewport boundary in full-page mobile captures; page scrolling retains access to controls below it.

## Corrections and limits

Early additions to the account test used incorrect account/MFA intercept URLs and an ambiguous Active client locator. Corrected the fixtures to the actual `/accounts/manage`, `/auth/mfa` endpoints and named combobox; these were test errors, not permission changes. A PowerShell log wrapper initially stopped on harmless native stderr warnings; reran the tests normally. Esbuild workflow fixtures emit an existing duplicate `break-inside: avoid` composition warning; both declarations agree and runtime checks pass. API readiness polling briefly reports connection refusal before the isolated service starts; tests wait for readiness.

Preservation verification confirms all 67 originally inventoried untracked file hashes and the stash inventory remain unchanged. The local UX Engine folder and existing user drafts are not committed. Historical QA is preserved. New screenshots contain no private links, MFA keys or recovery codes.

No full PostgreSQL/RLS/concurrency rerun, exhaustive authentication-mode deployment qualification or assessment visual migration is claimed. The unavailable security state is tested by an injected API response, not a new mock-auth environment. `/clients`, remaining client/learning routes, assessments, guest/setup/recovery and progressive old-code retirement remain on the checklist. V2 is untouched.

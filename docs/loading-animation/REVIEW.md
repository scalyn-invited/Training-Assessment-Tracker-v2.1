# Loading-animation independent code review — APPROVED

Task **t_ea348e19**, feature: authority-safe lightweight loading transitions.

## Revision and decision

**Approved product SHA: bf3befe015e33d5584dcaec53d372ce5916463b9.** Reviewed/tested candidate HEAD **06d8f79eef454bae5407d47f703260a936b5eeb4**, branch `ui/loading-animation`, isolated `.worktrees/loading-animation`. Product lineage includes loading implementation `4088c77` and focus correction `bf3befe`, based on `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`. Later candidate commits contain test/evidence documentation, not additional product changes.

**Approved for the existing integration stage; no unresolved blocking findings.** This is code-review approval after independent bounded QA, not main-runtime verification, owner acceptance, deployment permission or a whole-app certification. Existing child **t_a9d4c15b (backend)** owns integration into the actual `ui/global-design-system` main checkout, not literal `main`. Parent owns final owner-browser checks if worker Chrome extension access is unavailable.

## Scope and architectural/security assessment

Read AGENTS.md, DESIGN.md, applicable feature-checklist entries, ARCHITECTURE.md, implementation and QA/retest reports. Loaded reviewer/TDD guidance and read the project integration, browser-policy, responsive and state-completeness skills/references from their installed shared locations (not exposed in this profile's skill index). Task-specific Chrome-only owner-session policy takes precedence over the older browser skill default. No owner browser or desktop control was used.

Inspected the complete product diff from base through candidate: `app-shell-root.tsx`, `app-shell.tsx`, `application-shell.tsx`, `auth-ui.tsx`, `brand-header.tsx`, `guest-shell.tsx`, `loading-state.tsx`, `shell-focus-frame.tsx`, loading CSS, root layout and error/not-found. Inspected new tests and changed legacy assertions in surrounding session, appearance, sign-in and builder contracts.

- `app-shell-root.tsx:49-142,295-358`: persistent chrome/controller, generation-bound context and explicit participation/recovery leases; children retain their fixed route-slot position. No root authority key remounts the page/editor.
- `app-shell-root.tsx:150-208,394-452`: current identity/permission projection keys appearance; content uses exact current authority, not the retained chrome projection. Unknown context and known identity mutations conceal outgoing client/account/role content; safe built-in neutral tokens cover the canvas. Same verified continuity may retain decoration, but not destination content or enabled stale theme mutations.
- `auth-ui.tsx:26-132`: document-local epoch plus request sequence fence both broadcasts and direct deliveries; old request cleanup cannot clear a newer request. Identity mutation invalidates before POST; uncertain failures require context verification, not automatic mutation replay. Context requests have a ten-second deadline. Backend authorization remains authoritative and unchanged.
- `application-shell.tsx:196-373`: stable outer sidebar/header/route-slot, authority-dependent descendants removed including top-layer dialogs/popovers; existing navigation and role predicates retained. No extra main landmark introduced by the root.
- `shell-focus-frame.tsx:8-25`: pre-mutation snapshot recovers focus only if the former focused element was removed and active focus fell to BODY; does not reinstate old private controls or override intentional focus.
- `loading-state.tsx:13-25` and CSS: 3000ms informational delay only, stable accessible status, static reduced-motion equivalent, no artificial completion delay/progress claim. Loading CSS uses existing semantic variables, with scoped safe neutral override. No new dependency, API, database migration, credential storage, external service or paid call.
- Changed historical test selectors correspond to approved spinner/neutral-shell and existing Theme button contracts. Privacy, version/save/history and authority assertions were not removed to obtain green. Original QA focus regression is byte-unchanged from `bee243936407e0322b107c82572b54ce761bcc93`.

No confirmed correctness, security, compatibility or material performance blocker was found. Persistent context verification adds bounded requests deliberately rather than caching authority. Review did not request unrelated refactors or edit product files.

## Acceptance evidence

| Approved requirement | Evidence and result |
|---|---|
| Stable header/sidebar during same-workspace navigation, centered content spinner | Independent built navigation validates actual DOM node identity at 1440/820/390, history and single main; component geometry/reduced-motion tests pass |
| Initial session/refresh: no initial heading/card or protected content | Independent built held-session check and screenshot; loading components pass |
| Client/workspace switch: conceal outgoing branding/content, reveal verified appearance/permissions together | Independent real scope/history/race journey plus context-generation/permission component tests; neutral screenshot visually inspected |
| Sign-in validation/errors retained, minimal successful destination transition | Independent original guest journey passes; unchanged login validation/MFA/error handlers reviewed; shared GuestPending and destination gate inspected |
| Initially textless, context after about three seconds | Controlled 2999/3000ms tests pass; built held-context test observes delayed text |
| Confirmed failure/actionable recovery, stale responses suppressed | Deadline/error/retry, failed mutation, late mutation failure and older-refresh tests pass; real scope race/recovery journey passes |
| Accessible status, reduced motion, no focus loss/repeated announcements | Stable named/nonempty status and static animation checks pass; unchanged built temporal test and error/retry/background-focus tests pass. Manual screen-reader certification not claimed |
| Save/submit unchanged, unsaved work and imperative builder lifetime retained | Product diff contains no save/submit/editor changes; independent built builder gate/save/history and lazy module checks pass; original full builder/work-guard journeys also independently passed upstream QA |
| Preserve FOUC, theme/workspace controls and account-theme contract | Appearance resolver/initial policy unchanged except generation key; independent selectors36/policy20 and fresh built approved outage regression pass. Upstream QA separately passed account/workspace/overview/recovery/editor journeys |
| No unauthorized runtime/data mutation | Isolated synthetic harness only; main tracked checkout unchanged, no restart/push/deploy, no owner-session automation |

## Independent commands actually executed

All commands ran from the isolated loading-animation worktree. Raw evidence: `docs/loading-animation/review/`. Real-API specs ran in separate fresh server/database lifetimes using the existing harness: timestamped private storage, in-memory PGlite, cleared database overrides, live email/AI disabled. Verified free ports before relevant runs and all isolated ports free after execution. No main database fixtures.

| Command | Actual result | Evidence |
|---|---|---|
| `npx tsx tests/loading-animation-browser/check-ports.ts 3110 3111 55432 3280 3281 3490 3491 55449` | all free, before/after | terminal output |
| `npx playwright test -c playwright.loading-animation.config.ts` | 22 passed | loading.log |
| `npx vitest run -c vitest.appearance.config.ts` | 20 passed | policy.log |
| `npm run typecheck` | exit 0, server and web | types.log |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | exit 0 | build.log |
| `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts qa-temporal.spec.ts` | 1 passed | temporal.log |
| Same command, `navigation.spec.ts` in its own invocation | 1 passed | navigation.log |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_EVIDENCE_DIR=docs/loading-animation/review/scope npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts` | 1 passed | scope.log |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser BUILDER_GATE_EVIDENCE=docs/loading-animation/review/builder-gate npx playwright test -c playwright.qa-expanded.config.ts builder-gate.spec.ts` | 1 passed | builder-gate.log |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts builder-loading.spec.ts` | 1 passed | builder-lazy.log |
| `QA_BUILT=1 QA_TEST_DIR=tests/guest-ui-browser npx playwright test -c playwright.qa-expanded.config.ts` | 1 passed | guest.log |
| `npx playwright test -c playwright.theme-picker.config.ts` | 36 passed | selectors.log |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web` | exit 0 | outage-build.log |
| `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts outage-policy.spec.ts` | 1 passed | outage.log |
| `node docs/loading-animation/review/summarize.mjs` | assertions pass | summary.json |
| `git diff --check ba5856f..HEAD -- apps tests` | exit 0 | terminal |
| `git diff --exit-code bee243936407e0322b107c82572b54ce761bcc93 -- tests/loading-next-browser/qa-temporal.spec.ts` | exit 0 | terminal |
| `git diff --exit-code -- apps tests` after restoring only reviewer build-generated config drift | exit 0 | terminal |

Computed temporal evidence: neutral frames **188 / 195 / 196** at **1440 / 820 / 390** respectively; **zero BODY-focus frames and zero heading/identity leaks** in each neutral sample set. Pending and settled focus both `MAIN#main`. Sampling is bounded evidence, not a proof of every possible browser schedule.

Visually inspected fresh built desktop/mobile navigation and initial-session images, component desktop/mobile images and real scope pending image. Spinner is centered with no initial loading card/heading, no visible horizontal clipping; neutral scope has no outgoing name/logo/content. Verified-context navigation images legitimately retain decoration; they are not evidence authorizing retained identity during unresolved context. Original evidence files were copied aside, fresh output archived under review, then original paths restored. Build-generated `next-env.d.ts`/`tsconfig.json` drift was inspected and restored; existing untracked artifacts preserved.

## Findings, limitations and next owner

**Blocking findings: none. LA-QA-01 is verified resolved**, not waived. No correction graph is needed; existing monitor task IDs remain valid.

The historical full first-paint suite is **not suite-green**: prior independent result remains 22 passed / one preserved assertion conflicting with the owner-approved 503 policy. This review did not rerun that full suite or relabel its result; it freshly rebuilt and passed the approved outage-policy regression. The bounded policy disposition is documented in ARCHITECTURE.md and QA_RETEST.md, not an unexplained test waiver.

Logs preserve startup readiness-probe ECONNREFUSED messages before servers become ready; subsequent tests passed. One attempted batched `execute_code` read was denied by unattended policy and did not run; ordinary permitted tools were used, without changing policy. No owner interactive browser access was attempted or substituted with automated browser control of the main app.

No manual screen-reader/full WCAG, PostgreSQL RLS/concurrency, live services, every application form, or whole-app parity qualification is claimed. Main remains `ui/global-design-system@ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`, unchanged/unrestarted by reviewer. Integration owner must recheck main HEAD/status, preserve data/uploads/untracked docs and integrate the accepted lineage, then verify runtime source/process ownership and actual rendered behavior under owner Chrome tab-only policy. HTTP health or isolated browser passes alone cannot close that final gate.

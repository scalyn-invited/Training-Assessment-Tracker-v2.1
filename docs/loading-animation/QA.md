# Independent loading-animation QA — corrections required

## Candidate and verdict

Task: `t_d69674e1`. Product SHA: `4088c7729e78272eec00e8a3469a8b689af45a2a`, branch `ui/loading-animation`, isolated `.worktrees/loading-animation`.

**FAILED acceptance: LA-QA-01 (Medium), keyboard focus is lost during and after same-workspace navigation. Do not release review/integration.** Existing broad regressions pass within the limits below. This is not owner acceptance or main-runtime verification. Main checkout remains `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`; no main changes/restart, push, deployment, live mail or paid AI.

## Intent

Authenticated users need lightweight, responsive loading without revealing unverified client/identity content or losing keyboard position. Guest users need safe session loading and actionable failures. Preserve existing forms, editors and authority rules rather than hiding delays with stale content.

## Confirmed defect

| ID | Severity | Issue | Impact | Required correction |
|---|---|---|---|---|
| LA-QA-01 | Medium (accessibility P1) | Enter on Clients navigation drops focus to BODY while context is pending; focus remains BODY after Clients renders | Keyboard users lose navigation position and visible focus; violates explicit no-focus-loss acceptance | Transfer removed-control focus to a safe persistent landmark during verification and provide deterministic destination/recovery focus without retaining unverified controls or stealing focus on background refresh |

Environment: installed Chrome, headless Playwright, built Next renderer, isolated real API/PGlite, synthetic administrator. Reproduced in **two separate fresh-server runs**, at widths **1440, 820, 390**, height 900.

Reproduction:
1. Build with `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build`.
2. Verify free ports with `npx tsx tests/loading-animation-browser/check-ports.ts 3110 3111 55432`.
3. Run `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts qa-temporal.spec.ts`.
4. The test creates a synthetic installation/account in a fresh ephemeral database, opens Platform overview, focuses Clients and presses Enter while holding `/api/auth/context`.
5. Inspect `document.activeElement` after the slow-loading context appears, then release the response and inspect again after Clients is visible.

Expected: meaningful safe focus remains during the transition and on completion. Actual: BODY in both states at each tested width. `qa/05-independent-temporal.txt` and `qa/15-independent-temporal-repeat.txt` each record one failed test with the six explicit focus assertion failures. `qa/temporal-focus-first.json` and `qa/temporal-focus.json` preserve frame observations. The non-focus assertions passed: neutral frames exist, no main heading/outgoing synthetic identity appears in those frames, initial contextual text is hidden and becomes visible during the held operation.

Likely source boundary (not a substitute for reproduction): `ApplicationShell` removes decorated navigation children when session verification makes `frame=neutral`; the focused link is removed and no safe focus transfer is established. Fix belongs to frontend; QA made no product edits. Do not solve focus by keeping old private identity/role controls visible, weakening scope gates or dropping the regression assertions.

## Executed acceptance matrix

| Requirement | Status | Independent evidence |
|---|---|---|
| Stable same-workspace outer header/sidebar; centered content spinner | Passed, bounded | built `navigation.spec.ts`, retained DOM identity at 1440/820/390; component geometry |
| Initial/refresh session conceals protected content | Passed | built held-session check; signed-out component check; first-paint temporal suite |
| Client/workspace/identity boundaries; stale response suppression | Passed, bounded | full real `scope.spec.ts`; context/permission/mutation component cases; QA per-frame neutral assertions |
| Sign-in validation/errors and successful navigation | Passed, existing journey | full guest and shell suites; no new authentication backend qualification |
| Initially textless; context at 3 seconds | Passed | component clock checks at 2999/3000 ms; real held-context QA probe |
| Confirmed failure/recovery; bounded context wait | Passed | component failed mutation/context/deadline; recovery and scope real journeys |
| Reduced motion and accessible loading status | Passed, bounded automated checks | loading18 covers static spinner and stable/nonempty polite status; no manual screen-reader certification |
| No focus loss | **Failed** | LA-QA-01; both independent temporal runs |
| Approved 503 fallback | Passed current contract | `outage-policy.spec.ts` in full first-paint run, preserving preference/repeat failure/recovery |
| Entire historical first-paint suite | **Failed: 22 passed / 1 historical contract conflict** | unchanged generated-outage assertion expects platform-dark, receives approved dark. Not a new loading defect; not suite-green |
| Unsaved work guards and save indicators | Passed representative existing workflows | original builder, gate, lazy and editor-temporal; original overview/guest/shell journeys; not every form in the application |
| Builder save/reload/back-forward and imperative lifetime | Passed | original full builder plus separate gate/loading/editor-temporal and builder component10 |
| Workspace/theme popovers and account theme persistence | Passed | selector36, real workspace popover journey, built account-theme matrix |
| Desktop/tablet/mobile | Passed except focus | 1440/820/390 loading/temporal tests; additional existing suite viewports |
| Main app/owner interactive browser verification | Not Tested | parent-owned later gate; no alternate owner browser used |
| PostgreSQL RLS/concurrency, full parity, full manual WCAG audit | Not Tested | this UI run uses synthetic PGlite and bounded Chrome checks |

## Commands and actual results

Run from the isolated worktree. TEMP/TMP/TMPDIR were set to `.runtime/qa-temp`; database/storage safety is owned by the inspected harness: timestamped `.runtime/expanded-real-api`, `memory://` PGlite, cleared database overrides, unused dotenv path, disabled email/AI. Port checks passed before each server-owning run and at the end (3110/3111/55432, 3280/3281, 3490/3491/55449). Each setup-owning real journey had a separate process/database lifetime.

Logs are under `docs/loading-animation/qa/`:

- `npx playwright test -c playwright.loading-animation.config.ts --output=output/loading-independent-qa`: **18 passed**, `01-components.txt`.
- `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build`: **exit 0**, `02-build.txt`.
- `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts` (before QA spec added): **1 passed**, `03-navigation.txt`.
- Same harness, `QA_TEST_DIR=tests/expanded-appearance-browser` with each exact spec separately: `scope.spec.ts`, `builder-gate.spec.ts`, `builder-loading.spec.ts`, `editor-temporal.spec.ts`: **1 passed each**, `04-scope.txt` and named spec logs.
- Same harness with each test directory separately: `guest-ui-browser`, `shell-browser`, `overview-browser`, `recovery-ui-browser`, `assessment-builder-ui-browser`: **1 passed each**, named directory logs.
- Independent `qa-temporal.spec.ts`: **1 failed**, repeated unchanged **1 failed**, logs `05` and `15`.
- `npx playwright test -c playwright.theme-picker.config.ts`: **36 passed**, `06-selectors.txt`.
- `npx playwright test -c playwright.builder-workflow.config.ts`: **10 passed**, `07-builder-component.txt`.
- `npx vitest run -c vitest.appearance.config.ts`: **20 passed**, `08-policy.txt`.
- `npx vitest run tests/branding.test.ts`: **6 passed**, `09-branding.txt`.
- `npm run typecheck`: **exit 0**, `10-types.txt`.
- `QA_BUILT=1 npx playwright test -c playwright.account-theme.config.ts`: **1 passed**, `11-account-theme.txt`.
- `npx playwright test -c playwright.workspace-popover.config.ts`: **1 passed**, `12-workspace-popovers.txt` (dev renderer, separate ports/storage).
- `API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web`: **exit 0**, `13-first-paint-build.txt`.
- `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts --output=output/loading-first-paint-independent`: **22 passed, 1 failed**, `14-first-paint-full.txt`. Approved outage-policy passed; original historical conflicting assertion retained.

Pre-readiness proxy ECONNREFUSED messages are retained in startup logs, not hidden. Component CSS composition warnings are retained. Two discovery operations (inline Python and execute_code) were denied by unattended policy; no settings were changed or alternate owner-browser control attempted.

## Visual observations and preservation

Independent `qa/built/navigation-1440.png` and `navigation-390.png` were visually inspected: centered spinner in available content space, no loading card/heading or horizontal clipping. These are **verified same-context** frames and correctly show synthetic identity/shell; they are not evidence that private branding can stay visible across a client boundary. Neutral-boundary evidence is the separate frame test. Desktop Theme still reports its disabled pending state. Original implementation screenshots were backed up before runs and restored; fresh QA images are separately retained. Next build-generated next-env/tsconfig changes were restored after inspection. Product files and existing test assertions were not modified.

## Handoff

Correction owner: frontend, LA-QA-01 only. Existing QA card remains gated on correction and reruns the exact failing test plus focus/background-refresh, privacy, keyboard/popover and related builder regressions. Existing reviewer `t_ea348e19` and integration `t_a9d4c15b` remain downstream; do not duplicate or release them with a failing verdict. Record exact correction SHA and new evidence in the external manifest. Final owner/runtime verification remains with the parent after QA and review.

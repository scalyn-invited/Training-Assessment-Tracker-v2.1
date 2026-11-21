# Independent loading QA requalification — bounded PASS

Task `t_d69674e1`; product **bf3befe015e33d5584dcaec53d372ce5916463b9**, tested predecessor HEAD **383a33dca8b4106d720410ec1b7ef1d43d5c8e3f**, isolated `ui/loading-animation`. This supersedes the failing verdict in QA.md for the corrected candidate only; original RED evidence remains intact. QA recommends existing reviewer `t_ea348e19` proceed. No owner acceptance, main integration or deployment approval.

## Intent and issue disposition
Authenticated users need lightweight loading without private/stale content or lost keyboard position. Guest session initialization must conceal protected content and preserve actionable recovery.

| Issue | Severity | Retest | Disposition |
|---|---|---|---|
| LA-QA-01: keyboard navigation loses focus to BODY | Medium | Unchanged independent real built-route regression passes at 1440/820/390 | Corrected; MAIN#main focused during pending and after arrival |

No new blocking defect observed. No further implementation fix recommended in this bounded QA. Preserved strengths: authority-neutral shell, honest delayed context, and editor/work-guard lifetime.

## Execution and isolation
Sole worktree/test ownership transferred from completed correction. No application implementation edits. Inspected accepted harness uses timestamped `.runtime/expanded-real-api`, in-memory PGlite, disabled email/AI and cleared database overrides; separate fresh server/database lifetime for each setup-owning spec. TEMP/TMP/TMPDIR set to worktree `.runtime/qa-temp`; actual Node os.tmpdir confirmed in `qa-retest/summary.json`. Ports 3110/3111/55432/3280/3281/3490/3491/55449 checked free before execution and after. No main DB fixture writes.

All commands below ran from `.worktrees/loading-animation`; raw outputs in `qa-retest/`. Each reported pass was independently executed in this attempt.

| Command | Actual result | Log |
|---|---|---|
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | exit 0 | 01-build.txt |
| `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts qa-temporal.spec.ts` | 1 passed | 02-temporal.txt |
| `npx playwright test -c playwright.loading-animation.config.ts` | 22 passed | 03-loading.txt |
| `npx playwright test -c playwright.theme-picker.config.ts` | 36 passed | 04-selectors.txt |
| `npx playwright test -c playwright.builder-workflow.config.ts` | 10 passed | 05-builder.txt |
| `npx vitest run -c vitest.appearance.config.ts` | 20 passed | 06-policy.txt |
| `npm run typecheck` | exit 0 | 07-types.txt |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_EVIDENCE_DIR=docs/loading-animation/qa-retest/scope BUILDER_GATE_EVIDENCE=docs/loading-animation/qa-retest/builder-gate npx playwright test -c playwright.qa-expanded.config.ts <spec>` | separate scope.spec.ts, builder-gate.spec.ts, builder-loading.spec.ts, editor-temporal.spec.ts: 1 passed each | 08-*.txt |
| `QA_BUILT=1 QA_TEST_DIR=tests/<suite> npx playwright test -c playwright.qa-expanded.config.ts` | separate guest-ui-browser, recovery-ui-browser, assessment-builder-ui-browser, shell-browser, overview-browser: 1 passed each | 09-*.txt |
| `QA_BUILT=1 npx playwright test -c playwright.account-theme.config.ts` | 1 passed | 10-account.txt |
| `npx playwright test -c playwright.workspace-popover.config.ts` | 1 passed | 11-workspace.txt |
| `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts navigation.spec.ts` | 1 passed | 12-navigation.txt |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web` | exit 0 | 13-first-paint-build.txt |
| `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts outage-policy.spec.ts` | 1 passed | 14-outage.txt |
| `node docs/loading-animation/qa-retest/summarize.mjs` | all temporal assertions passed | summary.json |
| `git diff --exit-code bee243936407e0322b107c82572b54ce761bcc93 -- tests/loading-next-browser/qa-temporal.spec.ts` | exit 0, unchanged original regression | terminal |
| `git diff --check -- apps tests` | exit 0 | terminal |

## Acceptance coverage
| Criterion | Status / evidence |
|---|---|
| Same-workspace stable header/sidebar and centered spinner | Passed, navigation real journey at desktop/tablet/mobile; retains DOM identities |
| Refresh/initial session hides protected content | Passed, navigation held-session and loading component checks |
| Client/workspace/identity changes hide outgoing content/branding | Passed bounded, real scope/history/identity plus component authority checks |
| Stale and out-of-order responses cannot reveal obsolete content | Passed, full scope journey and component checks |
| Sign-in errors/validation and success transition | Passed, guest/shell journeys and loading components |
| Initially animation only; contextual text after 3 seconds | Passed, component 2999/3000ms checks and held real context |
| Confirmed failure and recovery, no blind mutation retry | Passed, loading components and real recovery/scope journeys |
| Reduced motion/static equivalent, nonempty stable polite status | Passed automated, loading components; not manual screen-reader certification |
| Navigation focus, recovery retry focus, no background-refresh focus theft | Passed, original built temporal and added error/retry/background-refresh component tests |
| No private content during neutral frames | Passed: 194/198/191 neutral frames at 1440/820/390; zero BODY frames and zero heading/identity leak frames; summary.json |
| Unsaved fields and save indicators | Passed representative workflows, component refresh retains input node/value/focus; builder/guest/overview/shell guards |
| Builder save/reload/back-forward, delayed imperative host | Passed, original builder and gate/loading/editor-temporal plus component10 |
| Workspace/theme popovers and account themes | Passed, selector36 plus real workspace/account journeys |
| Approved bounded 503 fallback | Passed, separately rebuilt current outage-policy test |
| Full historical first-paint suite | Not rerun this focus-only correction. Prior independent result remains 22 passed / 1 superseded-contract failure, NOT suite-green; no assertions waived or disabled |
| Main owner-browser/runtime, PostgreSQL RLS/concurrency, full parity | Not Tested, parent/later qualification |

## Visual evidence and preservation
Inspected fresh `qa-retest/built/navigation-1440.png` and `navigation-390.png`: centered content spinner without initial loading heading/card, retained shell and no visible horizontal clipping. These are verified same-context screenshots, not permission to retain identity across an unresolved boundary. Separate frame assertions establish neutral privacy. Original screenshots/frame JSON restored after copying fresh evidence. Build-generated next-env.d.ts/tsconfig.json changes inspected and restored; pre-existing untracked artifacts retained.

Main remains `ui/global-design-system@ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`, untouched/unrestarted. A temporary report helper initially landed in main docs due to relative-path tool resolution; it was moved to the isolated worktree and its newly created empty directories removed, with no main product change. One inline discovery command was denied by unattended policy; no policy bypass. Pre-readiness ECONNREFUSED and existing CSS warnings are preserved in logs.

## Handoff
Bounded QA PASS, release existing review only. Reviewer owns next isolated worktree/test lifetime after completion; rollout `t_a9d4c15b` remains behind review. No new cards/monitor graph changes. No owner browser was used; final running-app checks remain parent-owned under Chrome tab-only policy. Manual screen-reader/full WCAG, every application form, PostgreSQL concurrency and whole-app parity are not certified.

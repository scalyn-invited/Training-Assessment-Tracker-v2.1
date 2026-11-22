# LI-REVIEW-01 independent QA — t_01518ed0

## Recommendation

**Required Workspace correction gate PASS; impacted coverage is NOT all green.** Return to orchestrator t_479a5c51 for evidence check and existing reviewer t_137037d0. No rollout approval. Overview has a separate reproducible obsolete Theme selector failure (LI-QA-02 below). Do not interpret this bounded completion as acceptance of that failure.

Exact execution HEAD: `59a035b6ac9960c22772a9df95109c094a29ecde`. Exact corrected test commit: `8e082f0f026ac31692dd5de36fc17f2fbc08c23c`. HEAD differs from corrected commit only by six documentation/evidence files. Branch: `integration/latest-ui-t_8d33f464`, assigned combined worktree only. Original reviewed product/test baseline: `9a2a4130d01f3722a91ae11ca99db0ce0da893cd`; pre-correction evidence HEAD: `9c50f93912d404c75b0eeb46192edc3603a7bf50`.

## Acceptance and audit

| Criterion | Status / evidence |
| --- | --- |
| Locator-only correction; no production edits | Passed: full commit diff inspected, exactly six tests changed |
| Every original assertion, timeout, guard and other role predicate preserved | Passed: independent reverse-normalization compares complete source byte-for-byte; eight replacements only; current working tests equal corrected commit |
| Removed Workspace summary consumers audited | Passed: foundation (three), scope, instrumented scope, calibration, overview and shell (one each). Only remaining summary/Workspace search match is compatible `summary,button` geometry probe; selector36 runs this probe |
| Exact original scoped-history regression | Passed: 1, with original test body and CLI timeout; no reduced copy |
| Impacted suite qualification | Executed all six changed specs individually; five passed, overview failed before corrected Workspace site |
| Original failure and reviewer report preservation | Passed: unchanged tracked REVIEW.md and review-scope.log; original untracked error context still present |
| Evidence and ownership handoff | This report, audit script, raw logs/summary committed separately; evidence commit recorded in Kanban |

Audit scripts: inspected and reran frontend `li-review-01-audit.cjs`, then independently implemented `li-review-01-qa-audit.cjs` (reverse normalization, actual execution HEAD comparison and source preservation). Logs: `logs/li-review-01-qa-audit.log`, `logs/li-review-01-qa-independent-audit.log`, structured `logs/li-review-01-qa-summary.json`. No assertion or implementation changes by QA.

Preserved SHA256 values:
- REVIEW.md: `be8b8477ec2333fa7f8c798737e8af614315c89ad9226fd3185067a24fb9c440`
- logs/review-scope.log: `a2460079fcf1b57cbeb191c430b9b37b2d69e2ea04a54e0be25e3cd8eeed26f8`

## Executed commands and results

Independent build (exit 0):

```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
```

Exact mandatory invocation (exit 0):

```sh
QA_EVIDENCE_DIR=output/li-review-01-qa/scope QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts --timeout=45000 --output=output/li-review-01-qa/scope-results
```

The spec retains its original `test.setTimeout(300000)` override; CLI timeout was not represented as overriding that explicit test setting.

For other changed specs, each command ran separately and sequentially, starting/stopping a new fixture. Command form:

```sh
QA_EVIDENCE_DIR=output/li-review-01-qa/<evidence> QA_BUILT=1 QA_TEST_DIR=<directory> npx playwright test -c playwright.qa-expanded.config.ts <spec> --output=output/li-review-01-qa/<name>-results
```

Instrumented and calibration additionally used unchanged `--timeout=45000`. Overview set `UI_QA_SCREENSHOTS=output/li-review-01-qa/overview` (repeat: `overview-repeat`) instead of QA_EVIDENCE_DIR. Shell and foundation did not set an evidence override. Actual mapping/results:

| Name | Directory / spec | Result | Suite duration |
| --- | --- | --- | --- |
| scope | tests/expanded-appearance-browser / scope.spec.ts | 1 passed | 42.4s |
| instrumented | tests/expanded-appearance-browser / scope-instrumented.spec.ts | 1 passed; default capture mode | 3.2m |
| calibration | tests/expanded-appearance-browser / screenshot-calibration.spec.ts | 1 passed | 33.6s |
| overview | tests/overview-browser / overview.spec.ts | 1 failed, LI-QA-02 | See raw log |
| shell | tests/shell-browser / shell.spec.ts | 1 passed | 48.4s |
| foundation | tests/browser / foundation.spec.ts | 1 passed, full original integrated journey | 6.7m |
| overview-repeat | tests/overview-browser / overview.spec.ts | 1 failed, same LI-QA-02 | See raw log |

Additional checks:

```sh
npx playwright test -c playwright.theme-picker.config.ts --output=output/li-review-01-qa/selectors-results
npx vitest run -c vitest.appearance.config.ts
npm run typecheck
node docs/latest-ui-integration/li-review-01-qa-audit.cjs
```

Results: selectors **36 passed** (overlapping coverage, not unique contracts); appearance policy **20 passed**; typecheck and audit exit 0. All raw command logs: `docs/latest-ui-integration/logs/li-review-01-qa-<name>.log` (build, scope, instrumented, calibration, overview, shell, foundation, selectors, policy, types, overview-repeat, independent-audit). Startup ECONNREFUSED readiness warnings retained; not warning-free runs. Raw log whitespace is retained, not reformatted to make diff checks green.

## LI-QA-02 — Medium: overview Theme summary selector blocks remaining journey

- Environment: exact execution HEAD above, independently built Next, automated Chrome, synthetic PGlite fixture, 390px mobile Personal settings.
- Reproducibility: **2/2** separate fresh fixture runs. Logs `li-review-01-qa-overview.log` and `li-review-01-qa-overview-repeat.log`; original Playwright error contexts under corresponding `output/li-review-01-qa/*-results/overview-Overview-design-u-77ab0-works-on-desktop-and-mobile/error-context.md`.
- Preconditions: run isolated overview spec, which bootstraps synthetic administrator/demo clients and reaches Personal settings.
- Steps: open Personal settings, focus Close, press Shift+Tab, assert `settings.locator('summary')` focused at `tests/overview-browser/overview.spec.ts:206`.
- Expected: original focus assertion targets current Theme control and remaining unchanged journey completes.
- Actual: locator has no element; fails after 15000ms. Theme is now a button. Line209 also clicks obsolete summary. The later corrected Workspace locator at line285 is never executed.
- Impact: overview focus/theme/client-navigation regression coverage unavailable after line206; **not evidence of a product keyboard-focus defect**. Shell's analogous current-button focus check passes.
- Recommended owner: frontend, routed through existing orchestrator. Migrate only selectors with original focus/interaction assertions retained, then rerun unchanged journey. QA made no correction.
- Broader source search also found `tests/recovery-ui-browser/recovery.spec.ts:111` using `settings.locator('summary')`; this is a source-only risk, **Not Tested**, not a second runtime-confirmed defect.

## Isolation, evidence and limitations

Inspected repository Playwright config chain: qa-expanded -> overview -> base. Built fixture `tests/expanded-appearance-browser/server.ts` uses fresh memory PGlite and timestamped `.runtime/expanded-real-api/` private storage, unused dotenv, clears database/migration/encryption overrides, disables SMTP/account mail/live AI, and refuses existing-server reuse. All changed specs ran sequentially with separate fixture lifetimes. No main runtime/database/accounts, other worktree, live service or operator browser was touched. Automated Chrome only; no interactive browser used.

Foundation has hard-coded output/playwright screenshots: existing directory was archived before execution at `output/li-review-01-qa/pre-foundation-playwright.tar.gz`; new foundation captures remain at original paths. Prior failed scope output was not overwritten. New scope/instrumentation/calibration JSON and screenshots are in unique output directories. Screenshot captures were **not visually inspected** in this test-compatibility task; no visual approval is inferred. Existing executed foundation/shell/component axe and keyboard assertions count only for their tested states, not full WCAG 2.2 AA certification.

Build-generated tracked next-env.d.ts and tsconfig.json changes were inspected and restored only to original HEAD after tests. Final apps/packages/tests diff is empty. No reset/clean/stash/push/deployment. Existing untracked build directories, evidence/expanded and prior archives retained. Original REVIEW.md remains reviewer-owned and unchanged.

Not Tested: instrumented capture-off/viewport modes, recovery-ui spec, unrelated route suites, cross-browser/native screen reader, PostgreSQL RLS/concurrency and operator production runtime. Guest/account/builder suites were not rerun in this bounded correction (predecessor results are not counted as this QA's results). D02/D06/favicon404 remain out of scope; human acceptance deferred. Overview is **Failed**, not waived or relabeled Passed. Completion releases only orchestrator evidence check; existing reviewer retains final verdict. Exclusive combined-worktree ownership is surrendered on completion for routing/reviewer continuation.

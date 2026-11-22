# LI-QA-02 independent QA — t_9b5b2c81

## Verdict and lineage

**Bounded correction QA PASS.** Existing combined reviewer t_137037d0 retains final verdict; t_b9689fc0 must not proceed without it. No deployment or human acceptance is inferred. Exclusive combined-worktree ownership is surrendered to that reviewer on completion.

Exact tested HEAD: `46db637ce3a27c2ec5fb3de2487262211a4f4371`; correction: `397c6a33672ca01cecceb0087afa41f877719d77`; baseline: `bd01bcca8c915b82f118fff528ccf778b54ec84e`. Branch `integration/latest-ui-t_8d33f464`. The correction-to-tested-HEAD diff contains documentation/evidence only. Main `ui/global-design-system` remains `ff1d19fb427c054efd9e48bc546c9ec1398ef835`.

## Acceptance results

| Criterion | Status / independently executed evidence |
| --- | --- |
| Locator-only changes, no production edits | Passed: inspected complete correction diff and baseline-to-HEAD file list; only two overview targets and one recovery target changed |
| Preserve assertions, actions, timeouts and guards | Passed: independent reverse-normalization of complete source to baseline, current source equality, exact counts 2+1; `li-qa-02-qa-audit.cjs` |
| Full original overview, including focus and later Workspace navigation | Passed: 1 test, 41.3s; no filtering or copied/reduced test |
| Full corrected recovery-ui | Passed: 1 test, 45.9s |
| Exact original scoped-history regression | Passed: 1 test, 30.8s; original spec and CLI timeout preserved |
| Relevant selector regression | Passed: 36 tests, 1.2m; overlapping component coverage, not 36 unique contracts |
| Appearance policy | Passed: 20 tests |
| Explicit isolated production build | Passed, exit 0 |
| Server and web typecheck | Passed, exit 0 |
| Prior REVIEW.md and failure evidence preserved | Passed: independent audit checks original review scope failure and both prior overview failure logs unchanged |
| Documentation and raw evidence | This report, audit script and raw logs committed separately from tested HEAD |

LI-QA-02's original absent-summary failure is resolved in the unchanged full overview journey. The source-only recovery risk also passes its full journey. No new defect demonstrated in this bounded run. Previously inventoried remaining Theme-summary consumers are not waived: 25 sites/19 files from frontend source inventory remain outside this run and routed by existing t_616602dc; no duplicate follow-up created.

## Reproduction and raw evidence

All commands ran sequentially in the assigned combined worktree. Each browser invocation owned a new fixture lifetime. Log prefix: `docs/latest-ui-integration/logs/li-qa-02-qa-`; suffixes `build.log`, `overview.log`, `recovery.log`, `scope.log`, `selectors.log`, `policy.log`, `types.log`, `audit.log`.

```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
UI_QA_SCREENSHOTS=output/li-qa-02-qa/overview QA_BUILT=1 QA_TEST_DIR=tests/overview-browser npx playwright test -c playwright.qa-expanded.config.ts overview.spec.ts --output=output/li-qa-02-qa/overview-results
QA_BUILT=1 QA_TEST_DIR=tests/recovery-ui-browser npx playwright test -c playwright.qa-expanded.config.ts recovery.spec.ts --output=output/li-qa-02-qa/recovery-results
QA_EVIDENCE_DIR=output/li-qa-02-qa/scope QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts --timeout=45000 --output=output/li-qa-02-qa/scope-results
npx playwright test -c playwright.theme-picker.config.ts --output=output/li-qa-02-qa/selectors-results
npx vitest run -c vitest.appearance.config.ts
npm run typecheck
node docs/latest-ui-integration/li-qa-02-qa-audit.cjs
```

Scope retains its original internal 300000ms override; the CLI flag is not claimed to override that. Readiness ECONNREFUSED warnings are retained in passing journey logs, not hidden or represented as warning-free execution. Tool execution reported exit 0 for build and each journey; sequential scope/selector/policy/type commands all exited 0. An initial execute_code call and combined shell preparation command were denied before execution; ordinary direct tools and build invocation succeeded. Those denials were tool restrictions, not application test failures.

## Isolation, coverage and limits

Read AGENTS, feature checklist, predecessor reports, and actual Playwright config chain/fixture. qa-expanded -> overview -> base uses one worker, no existing-server reuse, fresh in-memory PGlite, timestamped private storage in this worktree, cleared database/migration/encryption overrides, SMTP/account mail/live AI disabled. Automated headless Chrome only; no operator browser or main database/account/runtime interaction. No reset, clean, stash, push or deployment.

Build-generated next-env.d.ts/tsconfig.json edits were inspected then restored to original tracked content; refreshed line-ending-only index metadata with no staged product diff. Final apps/packages/tests diff is empty. Pre-existing untracked directories/archives and original review/failure logs were retained. Existing recovery screenshots were archived before its hard-coded screenshot paths ran, at `output/li-qa-02-qa/pre-recovery-ui.tar.gz`. New captures are archived with logs, not visually approved.

Executed selector tests cover keyboard, focus, dismissal, theme persistence, pending/failed save recovery, combined geometry, narrow/short viewport bounds and axe checks of open panels. Recovery executes its original error/retry/role/axe assertions; overview executes original responsive and focus assertions. These are bounded automated checks, not full WCAG 2.2 AA certification or manual visual acceptance.

**Not Tested:** other obsolete consumer families, full route regression, independent guest/account/builder reruns in this task, cross-browser, native screen readers, PostgreSQL RLS/concurrency, interactive runtime, and deployment. Original baseline failure was not rerun by this QA because already preserved twice in prior independent QA; it was not relabeled as passing. D02/D06/favicon are out of scope. Human technical/UX and owner acceptance remain deferred. This completion releases the existing reviewer only, not rollout.

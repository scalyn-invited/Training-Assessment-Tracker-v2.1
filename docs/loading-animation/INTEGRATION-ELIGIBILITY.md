# Loading-animation lineage and integration eligibility

Task **t_07c65872**, for root t_a9d4c15b. Decision: **ELIGIBLE — exact bounded lineage has actual independent QA and code-review approval; already integrated in the actual app checkout.** This is not final rendered-runtime acceptance. Do not reintegrate or restart merely because the decomposed integration card exists.

## Exact accepted lineage

Destination inspected: `ui/global-design-system`, HEAD `ff493ddbd8ad54b0535f1ca436e3233e9afa40fc`. Source: `ui/loading-animation`. Ordered ancestry from the accepted existing UI base:

| SHA | Role |
|---|---|
| `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e` | Existing combined UI base, includes FOUC/popover/account-theme work |
| `4088c7729e78272eec00e8a3469a8b689af45a2a` | Loading implementation; NOT independently acceptable alone because of subsequent LA-QA-01 |
| `bee243936407e0322b107c82572b54ce761bcc93` | Independent QA RED and original focus regression |
| `bf3befe015e33d5584dcaec53d372ce5916463b9` | Accepted product: focus correction on loading implementation |
| `3aa617101881ee9d2e251da23b045d5c145e81b8` | Correction evidence |
| `383a33dca8b4106d720410ec1b7ef1d43d5c8e3f` | Computed correction evidence; QA tested predecessor |
| `06d8f79eef454bae5407d47f703260a936b5eeb4` | Independent QA retest evidence; reviewer tested candidate |
| `db5779c69606feacb55631aa237cb61b8f56da87` | Actual code-review approval report |
| `ff493ddbd8ad54b0535f1ca436e3233e9afa40fc` | Independent reviewer raw logs; accepted integration tip |

Actual Kanban t_d69674e1 run147 is bounded PASS after its earlier failed run145. Actual t_ea348e19 run148 is Approved, no blocking findings, LA-QA-01 resolved. REVIEW.md:7-9 and 71-79 agree. Approval is not inferred from plan approval or a Done label. Parent t_a9d4c15b run149 already fast-forwarded this exact lineage; subsequent parent runs verified persistence but did not close rendered verification. Earlier reports saying main is ba5856f describe their historical observation, not current HEAD.

## Scope / exclusions

Base-to-tip production changes are confined to `apps/web/app/components/{app-shell-root,app-shell,application-shell,auth-ui,brand-header,guest-shell,loading-state,shell-focus-frame}.tsx`, `components/ui/loading-state.module.css`, and root `layout.tsx`, `error.tsx`, `not-found.tsx`. Related browser tests, loading harness and docs accompany them. No product changes after bf3befe. No API/worker/packages/dependency/launcher changes from base. No unrelated feature commits found in this range.

Preserve all existing untracked rollout docs, `.worktrees/`, sibling preflight files and other branch work. Do not bulk stage/copy runtime fixtures, private storage, build caches, databases or unrelated reports. The literal `main` branch is not this destination. No replacement implementation, cherry-pick of the first implementation without its correction, dependency upgrade, migration or extra feature is authorized by this gate.

## Acceptance evidence mapped to actual logs

Full command recipes and isolation are in `QA_RETEST.md:14-37` and `REVIEW.md:42-65`. Their raw result lines were read in this audit, not treated as new execution here.

| Requirement | Evidence under docs/loading-animation/ | Result |
|---|---|---|
| Authoritative scope, client isolation, stale/out-of-order responses, A→B→A/history | `qa-retest/08-scope.spec.ts.txt`, `review/scope.log`; `qa-retest/03-loading.txt` | Scope 1 pass in each independent phase; loading22 |
| Builder imperative lifetime, save URL/newer edits/history and lazy handlers | `qa-retest/08-builder-gate.spec.ts.txt`, `08-builder-loading.spec.ts.txt`, `08-editor-temporal.spec.ts.txt`, `09-assessment-builder-ui-browser.txt`, `05-builder.txt`; reviewer gate/lazy logs | Each real journey passes separately; component10 |
| Unsaved-work guards, retained inputs and save/submit behavior | Original builder, guest, shell and overview journeys in `qa-retest/09-*.txt`; loading refresh-focus case | Representative workflows pass, not every form certification |
| FOUC and approved fresh-document 503 fallback/recovery | `qa-retest/14-outage.txt`, `review/outage.log`, policy logs, scope evidence | Approved outage test 1 pass per phase; policy20 |
| Theme/workspace popovers, account-theme precedence | `qa-retest/04-selectors.txt`, `10-account.txt`, `11-workspace.txt`; `review/selectors.log` | selectors36, account1, workspace1 |
| Stable shell, delayed text, minimal session loader | `qa-retest/12-navigation.txt`, `03-loading.txt`, `review/navigation.log` | navigation1 per phase; loading22, including 2999/3000ms |
| Focus/privacy at desktop/tablet/mobile | `qa-retest/02-temporal.txt`, `review/temporal.log`, `review/summary.json` | Original unchanged regression passes; reviewer 188/195/196 neutral frames at 1440/820/390, zero BODY/private frames, MAIN pending/settled |

Representative exact commands: `npx playwright test -c playwright.loading-animation.config.ts`; `npx playwright test -c playwright.theme-picker.config.ts`; `npx playwright test -c playwright.builder-workflow.config.ts`; `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts <one-spec>`; `QA_BUILT=1 npx playwright test -c playwright.account-theme.config.ts`; `npx playwright test -c playwright.workspace-popover.config.ts`; `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts outage-policy.spec.ts`. Builds/types passed in the referenced QA/review logs. Each real-API setup-owning spec had a separate isolated database/server lifetime, not main fixtures.

## Historical failing evidence is not waived or hidden

Full historical first-paint remains **22 passed / 1 superseded-contract assertion failure**, NOT suite-green. The assertion expects generated `platform-dark` during branding503, whereas DESIGN.md:181 explicitly approves built-in navy `dark` for the bounded fresh-document scoped intent; ARCHITECTURE.md:102-106,134 and REVIEW.md:75 explicitly retain that distinction. The approved outage-policy test freshly passed. This is an explained existing contract disposition, not a new unexplained failure or an invented approval. Initial focus failure is genuinely corrected and unchanged-test retested, not waived.

## Checks executed by this gate audit

- `git branch --show-current`, `git log --reverse --format='%H %s' ba5856f..ff493dd`, base-to-tip changed-path inventory: exact lineage above.
- `git diff --exit-code bf3befe HEAD -- apps packages` and `git diff --exit-code bf3befe HEAD -- apps tests`: exit0.
- `git diff --exit-code ba5856f HEAD -- apps/api apps/worker packages package.json package-lock.json scripts`: exit0.
- `git diff --exit-code bee2439 HEAD -- tests/loading-next-browser/qa-temporal.spec.ts`: exit0; original regression unchanged.
- `git log --format='%H %s' bf3befe..HEAD -- apps`: empty.
- `git diff --check`: exit0. Tracked tree clean before this documentation audit; untracked work preserved.
- `npx --no-install vitest run -c vitest.appearance.config.ts`: **20 passed**, exit0, 1.29s.

No browser suites/build/restart were repeated in this lineage-only task; isolated historical execution evidence plus current exact source equality establishes applicability. No credentials, owner browser, live DB fixture writes, deployment or paid services used. A heredoc discovery command was denied by unattended policy and did not execute; normal file tools located shared skills instead. Loaded reviewer/TDD and read shared state-completeness/responsive/integration/browser-policy skills; task Chrome-only policy supersedes the older generic browser default. The repo-local UX Engine path was absent; shared installed guidance was available.

## Remaining gate and handoff

No blocking **source-integration** finding. Final rendered runtime gate remains **OPEN**, not approved: manifest `renderedMainVerified`, `runtimeVerified`, `finalGatePassed`, `ownerAccepted` remain false. Parent reports worker `no_browser` and one owner-chat settled login snapshot; neither proves authenticated temporal transitions. No manual screen-reader/full WCAG, PostgreSQL RLS/concurrency or whole-app certification.

Next: **frontend t_4e1cf4b3**, consume live preflight t_0ca98965, reconcile this already-integrated state and avoid duplicate mutation/restart if source/process state is still correct. Independent runtime/rendered verifier t_7b33ab54 and connected default parent t_a9d4c15b own remaining authorized Chrome checks and final gate. This task completes lineage verification only; it cannot close parent feature acceptance.

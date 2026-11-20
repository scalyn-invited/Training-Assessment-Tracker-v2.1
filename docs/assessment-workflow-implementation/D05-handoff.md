# D05 — current-attempt MCQ approval explanation

## Status / acceptance

Implementation and bounded automated component QA complete; release existing downstream QA card `t_2291410d`. Local commit only; not merge, deployment, independent review or owner acceptance.

- [x] Current approved attempt says exactly: “This automatic score uses the assigned revision. The result above was approved.”
- [x] Pending attempt retains existing approval-required explanation.
- [x] Newer attempt with an earlier approved result does not inherit approved wording.
- [x] Separate rubric/MCQ results and enabled authorized approval/rejection controls remain.
- [x] Real RED → GREEN reproduction, focused regression, typecheck and desktop/narrow browser evidence.
- [x] Isolated tooling qualified; no protected services or private runtime used.

## Provenance and cause

Consumed completed repair parent `t_d7699fba`, report `D05-tooling-recovery.md`, and reran its native smoke successfully. Existing dependencies reused, not reinstalled. Read worktree AGENTS/DESIGN/checklist, applicable Next client-component guide, authoritative main-tree designer/workflow-proposal.md, root final-review.md and source-review.md (read-only documents only). TDD, systematic-debugging, dogfood and requesting-code-review skills loaded. UX Engine remains inaccessible (`Skill 'ux-engine' not found`); no claim it loaded.

The automatic panel rendered an unconditional pending-approval sentence. Backend `packages/domain/src/assessment-reviews.ts:545–559` already projects `approved.attempt_id` and `:664` projects latest `attemptId`. The frontend local type omitted that field. The fix types the existing field and compares exact attempt IDs inside the existing canReview/attempt/objective branch. Assignment status or the mere existence of historical approval is not used as an approval substitute. No backend, scoring, permissions, history, appeal, analysis, review-action or result-release changes.

## Isolation and evidence boundaries

`tests/d05-browser/approval.spec.ts` bundles the actual production React component and its actual auth-ui dependency using installed esbuild. Playwright fulfills explicit synthetic GET fixtures at reserved `http://d05.invalid`; all other requests fail. Browser styles come from the worktree globals.css. No app/API/worker process, DB, private storage, credentials or TCP listener is required. Consequently no test DB/port provisioning or writes occur. AI/email handlers cannot run. Synthetic fixture data are test inputs, **not claimed backend responses or evidence of a completed persisted lifecycle**. The earlier-approval/new-attempt case is a defensive projection test, not proof this state is reachable through ordinary resubmission today.

Chromium and its companion tools were downloaded by the installed Playwright CLI solely into this worktree's ignored `.runtime/browsers`. Initial background command returned `stdin is not a tty` (exit 1); foreground explicit-path invocation completed exit 0. No global installation, browser profile reuse, native desktop, security bypass, main3100/preview3150 interaction or rich-editor worktree access occurred.

## Execution ledger

Commands from this worktree:

1. `node docs/assessment-workflow-implementation/tooling-smoke.cjs` — exit 0; actual native esbuild and Next SWC transforms and error-page resolution passed.
2. `export PLAYWRIGHT_BROWSERS_PATH='C:/Users/cabas/AppData/Local/hermes/worktrees/tat-assessment-workflow/.runtime/browsers'; node node_modules/playwright/cli.js install chromium` — exit 0.
3. `node node_modules/playwright/cli.js test -c playwright.d05.config.ts` before application edit — **1 failed** for exact expected copy mismatch; `D05-red.log` records received unconditional “Human approval is still required.” Initial harness attempts failed before rendering because standalone Next imports needed process.env defined; fixed only the harness before the valid RED run. Those setup errors are not counted as product RED evidence.
4. Same command after minimal application edit — **1 passed** (`D05-green-initial.log`). Added pending/earlier-approval regression variants without further application edits.
5. Same command on final formatted tests — **3 passed, 1.9s** (`D05-green.log`). All three assert enabled review controls, exact copy, correct presence/absence of approved result, separate scores where present, no page errors and no 375px horizontal overflow. Desktop 1280px and narrow 375×667 screenshots generated for each state.
6. `npm run typecheck` — exit 0, both server and web (`D05-typecheck.log`).
7. `node node_modules/vitest/vitest.mjs run tests/assessment-scoring.test.ts tests/assessment-content.test.ts` — **2 files, 13 tests passed** (`D05-regression.log`); pure tests, no database.
8. `node node_modules/prettier/bin/prettier.cjs --check apps/web/app/components/assessment-review.tsx tests/d05-browser/approval.spec.ts playwright.d05.config.ts` — final exit 0. First check flagged test formatting; rewritten and rerun, then browser suite rerun.
9. `git diff --check` — passed before commit. Manual diff/security review found no secrets, unsafe input execution, authorization changes or unrelated production edits. Headless pre-commit skill permits self-check with downstream independent review still outstanding.

## Screenshots

Under `screenshots/`:

- `D05-current-approved-attempt-desktop.png` and `D05-current-approved-attempt-mobile.png`
- `D05-pending-attempt-desktop.png` and `D05-pending-attempt-mobile.png`
- `D05-newer-attempt-with-earlier-approval-desktop.png` and `D05-newer-attempt-with-earlier-approval-mobile.png`

Visually inspected current-approved mobile, pending mobile and earlier-approval desktop: explanation readable, scores separate, controls retained, no observed clipping. This is the actual component in a clearly labelled synthetic harness using existing dark default styles, not the full application shell or full accessibility/device qualification. Initial single-case screenshots remain untracked diagnostic artifacts, superseded by named final-state screenshots.

## Files and handoff

Production: `apps/web/app/components/assessment-review.tsx` only.
Tests: `playwright.d05.config.ts`, `tests/d05-browser/approval.spec.ts`.
Evidence: this report, D05 RED/GREEN/typecheck/regression logs and six final screenshots. Repair/blocker diagnostics are preserved separately and are not bundled into the implementation commit.

D01–D04: untouched; downstream QA must validate source-inferred risks and policy prerequisites.
D05: implemented and locally verified at the component boundary.
D06–D08: untouched; conditional validation remains downstream.

Limitations: no full-suite, database/RLS/concurrency, production build, integrated authenticated HTTP journey, live provider/email/scanner, real-device or deferred human acceptance claim. Copy-only change does not establish these. No additional acceptance gate requested: completing this implementation releases pre-created QA automatically. Commit identity is recorded in the Kanban completion metadata (this report travels in that commit).

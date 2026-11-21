# Combined candidate preparation — t_8d33f464

Status: BLOCKED ON COMBINED TEST COMPATIBILITY; NOT APPROVED FOR ROLLOUT.

Candidate merge: `48c37f7e60b367ff672c62c4f017f539611d727b`, branch `integration/latest-ui-t_8d33f464`, worktree `.worktrees/latest-ui-t_8d33f464`.
Base/main remains `ui/global-design-system` at `ff1d19fb427c054efd9e48bc546c9ec1398ef835`.

## Lineage and conflict review

Created isolated worktree at exact main HEAD after clean tracked-index and worktree inspection. Fast-forwarded to selector QA `9507c45c964cb60e9f9555825e7c1172ae170d4e`, containing product `bd7bc723d38a5b18dda05ff3baa2334af9247b9b`, theme `9b8fe82`, corrected selector tests `ed826d2`, workspace `d08d2fc`, and their evidence. Merged exact account product `32ab3631a878b8adce3e250d174dceca86d689e0`. Both are descendants of ff1d19f; all FOUC history retained. Root review `decdd1a0145dfebe9b373dd09999c24e9b4a6b10` contains only review documentation, not product lineage; not mistaken for the accepted implementation.

Only conflict: adjacent additions in docs/implementation/FEATURE_CHECKLIST.md. Preserved both evidence entries verbatim. DESIGN auto-merge preserves account scope exception and selector specifications. Product auto-merge in brand-header inspected: account-aware sharedAppearance/initial.clientId logic is combined with unchanged accepted popover implementation. appearance-state.ts and initial-appearance.ts exactly match account candidate. No new business/security/backend/schema changes.

Hotspot: apps/web/app/components/brand-header.tsx, shared by both feature lines. Do not make parallel edits without coordination.

## Fresh commands and evidence

All from isolated integration worktree. `npm ci --ignore-scripts`: exit0, 275 packages, audit zero. Logs in `logs/`:

- `npm run typecheck`: PASS server/web.
- `npx vitest run -c vitest.appearance.config.ts`: 20 PASS.
- `npx playwright test -c playwright.theme-picker.config.ts`: 36 PASS (includes overlapping prior tests, not 36 distinct contracts).
- `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build`: PASS.
- `QA_BUILT=1 UI_QA_SCREENSHOTS=output/latest-ui-account npx playwright test -c playwright.account-theme.config.ts`: FAIL, one test, theme.spec.ts:34 waits for obsolete `summary:visible` Theme trigger. Same old locator also at line130. Account security heading rendered; test cannot proceed to palette qualification. This is a combined test compatibility defect, not evidence of a product theme defect or of successful account qualification. Original failure retained in logs/account-theme-original.log and local evidence/expanded/results.
- `git diff --cached --check`: PASS before merge commit.

Accepted account test was authored independently against inline Theme summary. Accepted selector correction migrated pre-existing suites, but could not migrate this sibling-only new test. Required bounded correction: adapt both locators to accepted button accessible-name contract, retaining every existing palette/persistence/accessibility assertion; rerun original corrected built account matrix and combined selector tests. Route through orchestrator before rollout.

## Safety and next gate

Reviewed fixture configs/server: fresh memory:// PGlite, disposable worktree private storage, operator dotenv/database overrides excluded, SMTP/account mail/live AI disabled. Verified fixture ports3110/3111/55432 free before launch; main3100/3101 left running. No operator DB/account reads or writes, runtime restart/cache clearing, migration on main, remote push or deployment. Only generated integration next-env/tsconfig edits restored after inspection; output retained. Main tracked tree/HEAD unchanged; original untracked .worktrees/, docs/fouc-main-integration/, docs/main-branch-integration/ preserved.

No combined overall PASS. Reviewer t_137037d0 must remain gated until correction and requalification. Human acceptance deferred. Full temporal/route/browser/PostgreSQL qualification not performed here. Build and component tests are not operator-instance verification.

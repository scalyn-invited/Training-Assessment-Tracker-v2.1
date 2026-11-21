# Independent combined UI review — t_137037d0

## Final re-review: APPROVED WITH NON-BLOCKING FINDINGS

Exact independently tested revision: `ebb32ffd66c7689c5ae57bb85023500503fed90b`, branch `integration/latest-ui-t_8d33f464`. This final verdict supersedes the historical changes-requested decision below. No production edits were made by the reviewer. Main was rechecked at `ff1d19fb427c054efd9e48bc546c9ec1398ef835` and was not restarted or modified.

### Correction and contract verification

- LI-REVIEW-01 is resolved by `8e082f0f026ac31692dd5de36fc17f2fbc08c23c`: eight Workspace locator replacements across six existing tests. Full original scope/history now passes independently, including delayed authority, retry, back/forward and stale-response checks.
- LI-QA-02 is resolved by `397c6a33672ca01cecceb0087afa41f877719d77`: two overview and one recovery Theme locator replacements. Full original overview (including focus and later Workspace navigation) and recovery journeys pass independently. No assertion, timeout, action or guard was weakened.
- Read latest QA report and manifest; the manifest still names historical `9a2a413`, so it must NOT be used as the final rollout revision. Use this report's tested revision plus the evidence-only final review commit recorded in Kanban.
- Inspected the complete production diff again, and verified ancestry of accepted selector `bd7bc723d38a5b18dda05ff3baa2334af9247b9b`, account `32ab3631a878b8adce3e250d174dceca86d689e0`, and main/FOUC `ff1d19f`. Production source is unchanged since the prior combined review. No migration, dependency, API authorization or business/security policy changes were introduced.
- Account client scope remains shared by initial server resolution, pre-body override policy and hydrated resolver. Existing route/identity/client authority and stale-result rejection remain intact. Popover positioning, native navigation, token inheritance and focus logic preserve the accepted lineages; no new confirmed production defect found.

### Fresh independent execution on the combined revision

Raw logs: `docs/latest-ui-integration/logs/rereview-*.log`. Commands use the same configurations and isolated built setup listed in the historical command table below, with output prefix `output/latest-ui-rereview/`.

| Gate | Result |
| --- | --- |
| Server/web typecheck | PASS, exit 0 |
| Explicit `.next-expanded` production build | PASS, exit 0 |
| Appearance policy | 20 passed |
| Selector component/geometry suite | 36 passed (overlapping coverage, not unique contracts) |
| Original scoped-navigation/history | 1 passed, 29.0s |
| Builder authority/save/newer-edit/history | 1 passed in initial builder invocation |
| Lazy-builder loading | 1 passed, 18.1s, separate fresh fixture |
| Nine-palette account/scoped-theme journey | 1 passed, 1.3m |
| Guest selector journey | 1 passed, 1.0m |
| Full original overview | 1 passed, 43.0s |
| Full original recovery | 1 passed, 41.2s |
| Existing independent complete-source preservation audit | PASS after restoring generated Next config changes |

Reproduction additions: `QA_BUILT=1 QA_TEST_DIR=tests/overview-browser UI_QA_SCREENSHOTS=output/latest-ui-rereview/overview npx playwright test -c playwright.qa-expanded.config.ts overview.spec.ts`; `QA_BUILT=1 QA_TEST_DIR=tests/recovery-ui-browser npx playwright test -c playwright.qa-expanded.config.ts recovery.spec.ts`; `node docs/latest-ui-integration/li-qa-02-qa-audit.cjs`. Explicit output directories are recorded in the raw failure contexts and evidence archive.

Execution caveats are retained, not waived: initially batching builder-gate and builder-loading in one fixture passed the former but failed the latter at setup with `409 already_installed`. Running lazy-builder alone with its required new fixture passed; no product correction was needed. The initial audit failed because Next rewrote next-env.d.ts/tsconfig.json; after inspecting and restoring only those generated changes to HEAD, the audit passed. Both failed logs remain. The audit prints its original QA revision and prior result summaries; those are historical audit inputs, not this run's tested SHA/results. Startup ECONNREFUSED readiness warnings remain in passing logs.

### Fresh visual evidence inspected

Loaded actual synthetic Chrome captures and visually inspected:
- `output/latest-ui-rereview/selectors/selector-qa-independent-combined-geometry-390x420/theme.png`: top-layer Theme options fit within the short viewport above their trigger, with readable choices and no visible panel clipping.
- `output/latest-ui-rereview/account/platform-dark-account-security-390.png`: consistent dark client appearance, stacked panels, wrapped text and in-bounds security controls; no visible horizontal clipping.
- `output/latest-ui-rereview/builder/saved-reloaded.png`: populated light builder, saved-not-published notice and authoring controls after reload. Viewport-only capture does not qualify below-fold layout.

### Non-blocking findings, limits and handoff

Remaining source-only obsolete Theme consumers are inventoried by predecessor QA and routed to default via existing `t_616602dc`; these other families were not executed here and are not represented as passing. This is test-maintenance debt outside the bounded required gates, not a demonstrated production regression. Native popover compatibility is qualified in automated Chrome only; no cross-browser, native screen-reader, full-route, PostgreSQL, universal zero-FOUC/CLS or human acceptance claim.

All real-API runs used isolated memory PGlite and private fixture storage, with mail/live AI disabled and no existing-server reuse. No main data/account/runtime writes, remote push, deployment, reset/clean/stash, or production implementation edits. Existing untracked files and prior failure evidence remain. D02/D06 and favicon remain separate.

**Next responsible agents:** backend `t_b9689fc0` may proceed with the owner-authorized local running-app integration stage, using this qualified lineage; default owns the existing maintenance follow-up and final coordination. Review approval is NOT rollout completion or deployment approval. Persistent launcher, verified database backup before stopping/migrations, cache refresh/restart, continuity checks and actual running-instance feature verification remain mandatory downstream. Coordinate exclusive candidate ownership: maintenance routing must not mutate the qualified candidate while rollout consumes it.

---

## Historical first review (preserved)

## Decision: CHANGES REQUESTED — rollout not approved

Reviewed and independently tested `9a2a4130d01f3722a91ae11ca99db0ce0da893cd` on `integration/latest-ui-t_8d33f464`. This differs from predecessor tested `755b39f9cbfbc4b607bcd92968580953338e174f` only by requalification documentation/logs. Main remains `ui/global-design-system` at `ff1d19fb427c054efd9e48bc546c9ec1398ef835`; no operator runtime/data/cache changes were made.

## Scope and lineage

Read AGENTS, DESIGN, feature checklist, manifest, predecessor requalification and accepted roots t_21dcd42a / t_f9f57b75. Independently verified ancestry of main/FOUC ff1d19f, final selector bd7bc723 and account 32ab3631. Inspected combined production diff: appearance-state.ts, initial-appearance.ts, brand-header.tsx, application-shell.tsx, workspace-popover.tsx, theme-picker.module.css, guest.module.css, globals.css and platform/overview.module.css. Server/bootstrap appearance files equal accepted account candidate; brand-header differs from selector QA only by accepted account scope selection. No backend authorization, migration, business rule, dependency or security-policy changes.

Account scope is centrally shared between server snapshot, inline bootstrap and hydrated resolver; account-link remains guest/shared and no-client account access remains shared. Existing authority generation/stale-response rejection and guarded links are preserved. Both native popovers remain token-inheriting, viewport-positioned and internally scrollable. Native Popover API support is required; qualification is Chrome-only.

## Blocking finding

**Medium LI-REVIEW-01 — incomplete Workspace locator migration prevents required scoped-history qualification.**

`tests/expanded-appearance-browser/scope.spec.ts:82` still clicks `locator('summary').filter({ hasText: 'Workspace' })`, while `apps/web/app/components/application-shell.tsx:203` now renders WorkspacePopover with a button trigger. Exact unchanged regression independently fails after 15 seconds waiting for this removed element. Evidence: `logs/review-scope.log:84-106`, error context in `output/latest-ui-review-scope-results/`. Consequently the later delayed authority, retry, history back/forward and stale-response checks do not execute. This is a confirmed test compatibility regression, NOT evidence that product scope/history behavior itself is broken.

The same obsolete selector occurs in `tests/browser/foundation.spec.ts:36,94,146`, `tests/expanded-appearance-browser/scope-instrumented.spec.ts:154`, `tests/expanded-appearance-browser/screenshot-calibration.spec.ts:81`, `tests/overview-browser/overview.spec.ts:285`, and `tests/shell-browser/shell.spec.ts:114`. These additional sites were source-audited, not all executed. The flexible `summary,button` selector in workspace.spec.ts is not the failing pattern.

Required correction: frontend must migrate obsolete Workspace trigger locators to the actual accessible button, preserving assertions, guards, role predicates and timeouts. Audit related consumers rather than correcting only line82. Run scoped-history regression with a fresh isolated fixture; run affected focused suites as feasible and explicitly name any not run. Independent reviewer must then requalify the exact corrected candidate. Do not weaken assertions or alter product code without a separately evidenced defect. Default orchestrator owns routing; rollout t_b9689fc0 must remain gated.

## Independently executed checks

All commands ran in the combined candidate worktree. Logs are `docs/latest-ui-integration/logs/review-*.log`.

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | PASS, exit0 (review-types.log) |
| `npx vitest run -c vitest.appearance.config.ts` | 20 PASS |
| `npx playwright test -c playwright.theme-picker.config.ts --output=output/latest-ui-review-selectors` | 36 PASS; includes overlapping coverage, not 36 unique contracts |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | PASS, exit0 |
| `QA_BUILT=1 UI_QA_SCREENSHOTS=output/latest-ui-review-account npx playwright test -c playwright.account-theme.config.ts --output=output/latest-ui-review-account-results` | 1 PASS; nine palettes, account/learning SPA and reload, responsive/axe and preference isolation |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser BUILDER_GATE_EVIDENCE=output/latest-ui-review-builder npx playwright test -c playwright.qa-expanded.config.ts builder-gate.spec.ts --output=output/latest-ui-review-builder-results` | 1 PASS; delayed authority, newer edit during save, host identity, save/reload, dirty-link cancellation and history-back cancellation |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts --timeout=45000 --output=output/latest-ui-review-scope-results` | 1 FAIL; obsolete Workspace summary locator; original evidence preserved |
| `npx playwright test -c playwright.selector-guest-qa.config.ts --output=output/latest-ui-review-guest-results` | 1 PASS; original corrected guest journey |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts builder-loading.spec.ts --output=output/latest-ui-review-loading-results` | 1 PASS; delayed lazy editor cannot expose unbound controls |

Startup readiness ECONNREFUSED warnings remain in raw passing built logs; no warning-free claim. Test fixture uses memory PGlite, timestamped private storage, unused dotenv, removes operator database/key environment overrides, disables SMTP/account mail/live AI, and does not reuse an existing server. Each real-API suite ran sequentially with a separate fixture lifetime. No suite targeted main data.

## Visual evidence inspected

Fresh combined-candidate screenshots were loaded and visually inspected, not inferred from HTTP:
- `output/latest-ui-review-account/platform-dark-accounts-desktop.png`: dark client-scoped account form, shared shell and issued-link empty state; no visible clipping/error.
- `output/latest-ui-review-account/platform-dark-account-security-390.png`: consistent dark mobile panels, wrapped explanatory text and in-bounds password/security controls; no visible clipping/error.
- `output/latest-ui-review-builder/saved-reloaded.png`: populated light builder after save/reload, saved-not-published status, authoring steps and shell visible (viewport screenshot, not proof of below-fold layout).

These are isolated synthetic automated Chrome renders, not operator-browser screenshots or human visual acceptance.

## Preservation, risks and handoff

No production implementation edits. Next-generated next-env.d.ts and tsconfig.json changes were inspected and only those generated changes restored to candidate HEAD. Existing untracked .next-expanded/evidence/expanded preserved; new regenerable .next-workspace retained. Main original untracked .worktrees/, docs/fouc-main-integration/ and docs/main-branch-integration/ preserved. No reset/clean/stash, push, deployment, migrations against main, emails or paid AI.

No confirmed new production/security defect identified in inspected diff, but LI-REVIEW-01 blocks the explicitly required combined scoped-history gate. Full route, cross-browser, native touch/screen reader and PostgreSQL qualification not claimed. Pre-existing favicon404 remains separate; D02/D06 and human acceptance remain deferred. No universal zero-FOUC/zero-CLS claim.

Next responsible agent: default orchestrator to route bounded frontend test correction and independent QA, then resume this existing review card. Do not release rollout on the basis of the other passing checks. The downstream persistent launcher, verified database backup, actual integration/cache refresh and operator-instance verification remain mandatory and have not been performed here.

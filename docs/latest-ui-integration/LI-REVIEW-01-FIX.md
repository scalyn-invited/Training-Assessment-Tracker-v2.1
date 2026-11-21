# LI-REVIEW-01 — Workspace locator correction

## Implementation handoff

Task `t_b5ff7e14`; branch `integration/latest-ui-t_8d33f464`, assigned combined worktree only. Starting evidence HEAD: `9c50f93912d404c75b0eeb46192edc3603a7bf50`. Exact corrected and tested commit: **`8e082f0f026ac31692dd5de36fc17f2fbc08c23c`**. Tests were committed separately from this evidence. No product implementation changed. Implementation gate PASS; independent QA `t_01518ed0` is next and receives exclusive writer ownership on parent completion. Existing reviewer and rollout remain gated; no acceptance or deployment approval implied.

## Root cause and bounded audit

Original reviewer regression at `9a2a4130d01f3722a91ae11ca99db0ce0da893cd` timed out waiting for a removed `summary` element (15-second click timeout). Preserved RED: `docs/latest-ui-integration/logs/review-scope.log`, plus `output/latest-ui-review-scope-results/`. The task shorthand `logs/review-scope.log` refers to the former, not a root-level log. Neither original path was overwritten.

`WorkspacePopover` renders a native button whose accessible name begins `Workspace ` followed by current workspace. Replaced only `page.locator('summary').filter({ hasText: 'Workspace' })` with `page.getByRole('button', { name: /^Workspace / })` at all eight obsolete sites:

| File | Lines / replacements |
| --- | --- |
| tests/browser/foundation.spec.ts | 36, 94, 146 / 3 |
| tests/expanded-appearance-browser/scope.spec.ts | 82 / 1 |
| tests/expanded-appearance-browser/scope-instrumented.spec.ts | 154 / 1 |
| tests/expanded-appearance-browser/screenshot-calibration.spec.ts | 81 / 1 |
| tests/overview-browser/overview.spec.ts | 285 / 1 |
| tests/shell-browser/shell.spec.ts | 114 / 1 |

Broad `Workspace` and `workspace-switcher` search across tests also inspected other consumers: existing button selectors in selector-qa/workspace-real/workspace component suites are compatible. Workspace menu dialogs, heading/group labels and navigation links are different controls and remain unchanged. The only remaining `summary.*Workspace|Workspace.*summary` match is the intentionally compatible `summary,button` geometry probe at `tests/theme-picker-browser/workspace.spec.ts:62`; it already accepts the current button and was not altered.

`node docs/latest-ui-integration/li-review-01-audit.cjs` PASS: asserts the candidate changes exactly six named files, with precisely eight locator replacements and byte-for-byte equality to the old file after that replacement. Thus every assertion, other role predicate, timeout, navigation guard, setup and interaction is preserved. The original test's own `test.setTimeout(300000)` and CLI `--timeout=45000` remain unchanged. Diff check PASS. Audit also confirms original tracked failure log unchanged and original failure context still present; no pre-run checksum of untracked original artifacts was taken.

## Execution and isolation

All commands executed sequentially in the assigned combined worktree:

```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
QA_EVIDENCE_DIR=output/li-review-01-frontend-scope QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts --timeout=45000 --output=output/li-review-01-frontend-scope-results
node docs/latest-ui-integration/li-review-01-audit.cjs
npm run typecheck
git diff --check
```

| Check | Result | Evidence |
| --- | --- | --- |
| Explicit isolated production build | PASS exit 0 | logs/li-review-01-fix-build.log |
| Original scoped-history regression | **1 passed**, 40.3s suite / 19.6s test, exit 0 | logs/li-review-01-fix-scope.log |
| Exact replacement / preservation audit | PASS exit 0 | logs/li-review-01-fix-audit.log |
| Typecheck | PASS exit 0 | logs/li-review-01-fix-types.log |
| Implementation diff check | PASS exit 0 | terminal and audit |

The later staged evidence diff check exits 2 solely on native build/typecheck log whitespace (space-before-tab, trailing spaces and final blank lines). Raw logs are retained verbatim rather than sanitized; implementation and Markdown/audit-script diff checks pass.

Verified generated routes manifest destinations target `http://127.0.0.1:3111` before starting the fixture. Existing built fixture uses fresh memory PGlite, timestamped `.runtime/expanded-real-api/` private synthetic storage, unused dotenv, clears external database/migration/key overrides, disables SMTP/account mail/live AI, and refuses existing-server reuse. No main database, accounts or runtime targeted. Existing automated Chrome fixture was used, not an interactive operator browser.

Scope run now reaches delayed authority, retry, history back/forward, stale/out-of-order responses, reused-client A→B→A, responsive reloads and identity preference assertions. Fresh frame JSON/screenshots are under `output/li-review-01-frontend-scope/`, result metadata under `output/li-review-01-frontend-scope-results/`; bundled in `li-review-01-fix-evidence.tar.gz`. Screenshots were captured by the test, not visually inspected in this task.

## Limitations and preservation

Foundation, instrumented scope, screenshot calibration, overview, shell and component-selector suites were source-audited but **not executed in this frontend phase**; downstream QA explicitly owns independent scope rerun and impacted focused suite qualification. No full-suite, cross-browser, screen-reader, PostgreSQL or human visual acceptance claimed. Startup readiness ECONNREFUSED warnings remain in the passing scope log. No new product defect was demonstrated. Favicon404, D02/D06 remain out of scope.

Build-generated `apps/web/next-env.d.ts` and `apps/web/tsconfig.json` changes were inspected and restored only to their pre-build HEAD versions. No reset/clean/stash/push/deployment. No other worktree was modified. Initial untracked `apps/web/.next-expanded/`, `apps/web/.next-workspace/`, `docs/latest-ui-integration/review-evidence.tar.gz`, and `evidence/expanded/` remain; `.next-expanded/` was rebuilt as explicitly required. New ignored output and isolated fixture artifacts remain for QA. The evidence archive is intentionally retained untracked alongside the prior review archive; source report, audit and logs are committed separately. Final evidence HEAD and exact remaining untracked status are recorded in the Kanban handoff after commit.

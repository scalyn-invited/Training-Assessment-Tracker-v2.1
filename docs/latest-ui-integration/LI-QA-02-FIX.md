# LI-QA-02 — bounded Theme locator correction

## Handoff

Implementation phase PASS; independent QA t_9b5b2c81 and existing reviewer t_137037d0 remain required. No rollout or human acceptance. Exclusive combined-worktree ownership passes to QA on completion.

Baseline: `bd01bcca8c915b82f118fff528ccf778b54ec84e`. Exact correction and test execution SHA: `397c6a33672ca01cecceb0087afa41f877719d77` on `integration/latest-ui-t_8d33f464`. Evidence committed separately. Main `ui/global-design-system` remains `ff1d19fb427c054efd9e48bc546c9ec1398ef835`.

## Change and preservation

Only three replacements across two files:
- `tests/overview-browser/overview.spec.ts`:206,209 — focus assertion and click target.
- `tests/recovery-ui-browser/recovery.spec.ts`:111 — click target.

`settings.locator('summary')` becomes `settings.getByRole('button', { name: /^Theme(?: |$)/ })`. Current ThemePicker renders a button with Theme plus current-choice text. No application edits; every assertion, keyboard action, guard, timeout, fixture and other selector is unchanged.

Run `node docs/latest-ui-integration/li-qa-02-audit.cjs`. It compares full committed source to an exact replacement of baseline, verifies current test source, restricts the correction commit to the two files, checks no apps/packages diff, main ref, and preservation of REVIEW.md and original failure logs. Output: `logs/li-qa-02-fix-audit.log`, PASS.

## Actual execution

All commands ran locally in the assigned worktree. Log prefix below is `docs/latest-ui-integration/logs/li-qa-02-fix-`.

| Check | Result | Raw log |
| --- | --- | --- |
| Explicit isolated production build | exit 0 | build.log |
| Original overview before edits | FAILED at line206: absent summary focus target, 15000ms | red.log |
| Complete overview after correction | 1 passed, 57.0s | overview.log |
| Complete recovery-ui after correction | 1 passed, 47.9s | recovery.log |
| Original scope/history | 1 passed, 33.8s | scope.log |
| Typecheck | exit 0 | types.log |
| Complete-source audit and correction diff check | exit 0 | audit.log |

```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
# Before correction (red) and after correction (overview), separately:
UI_QA_SCREENSHOTS=output/li-qa-02-fix/<red-or-overview> QA_BUILT=1 QA_TEST_DIR=tests/overview-browser npx playwright test -c playwright.qa-expanded.config.ts overview.spec.ts --output=output/li-qa-02-fix/<red-or-overview>-results
QA_BUILT=1 QA_TEST_DIR=tests/recovery-ui-browser npx playwright test -c playwright.qa-expanded.config.ts recovery.spec.ts --output=output/li-qa-02-fix/recovery-results
QA_EVIDENCE_DIR=output/li-qa-02-fix/scope QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test -c playwright.qa-expanded.config.ts scope.spec.ts --timeout=45000 --output=output/li-qa-02-fix/scope-results
npm run typecheck
node docs/latest-ui-integration/li-qa-02-audit.cjs
```

The unchanged scope spec sets its own 300000ms timeout; CLI flag is retained, not claimed to override it. Full overview now reaches later Workspace navigation and permission assertions. Recovery exercises actual error boundary, retry, roles and axe checks. No assertions weakened. Startup readiness ECONNREFUSED warnings remain in raw logs; not warning-free runs. Original QA failures remain unchanged. The additional frontend RED and error context are retained at `output/li-qa-02-fix/red-results/`.

## Broader audit — not additional implementation

Search of test summary consumers found **25 further Theme sites across 19 files** using `personal` or `queueSettings`; the audit log contains exact paths, lines and surrounding choice actions. They are source-only risks, not runtime-qualified failures. They are left unchanged in this bounded overview/recovery task and routed to orchestrator t_616602dc after existing reviewer verdict. No blanket summary replacement: genuine details for optional mail delivery, learning actions, cases, AI generation and account access remain unchanged; the existing `summary,button` Workspace geometry probe is compatible and untouched.

## Isolation and limitations

Inspected qa-expanded -> overview -> base config and built fixture. Each browser invocation was sequential with a fresh memory PGlite database and timestamped private fixture storage; existing server reuse is disabled. Mail/SMTP/live AI are off; database/migration/encryption overrides cleared by fixture. Built rewrite manifest explicitly targets 127.0.0.1:3111. Automated isolated Chrome only, no interactive operator browser. No main database/account/runtime or other worktree edits, push, deployment, reset, clean or stash.

Build-generated next-env.d.ts/tsconfig.json changes were inspected and restored only to this run's original tracked versions after typecheck. Prior untracked build/evidence directories and archives preserved. Recovery's hard-coded screenshot directory was archived before running at `output/li-qa-02-fix/pre-recovery-ui.tar.gz` when present. New screenshots are not visually inspected; no visual acceptance claimed. Logs, RED context and captures are packaged in `docs/latest-ui-integration/li-qa-02-fix-evidence.tar.gz`.

Not tested here: remaining 19 affected test families, broad regression, selector/policy reruns (independent QA owns applicable additional checks), other browsers, native screen readers, PostgreSQL RLS/concurrency, deployment/runtime. Executed axe assertions do not establish complete WCAG certification. D02/D06/favicon remain out of scope. No newly demonstrated product defect; downstream review and t_b9689fc0 gate remain intact.

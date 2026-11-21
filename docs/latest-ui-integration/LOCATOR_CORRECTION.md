# Account-theme locator compatibility correction — t_f0656dc2

Status: implementation and requested focused tests PASS; backend independent requalification and existing reviewer remain required. No rollout approval.

## Exact revision and scope

Base evidence HEAD: `1f24534db21c08fa829a9197fae06935f62e397c`.
Correction and tested HEAD: `a1600eee15f98ba89d4eb68a77636a68d564629f` on `integration/latest-ui-t_8d33f464`.

Only `tests/account-theme-browser/theme.spec.ts` lines 34 and 130 changed:

```diff
-  await page.locator('summary:visible').filter({ hasText: 'Theme' }).click();
+  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
```

This is the accepted locator used in `tests/account-ui-browser/accounts.spec.ts:68`; component coverage confirms the accessible name consists of Theme plus the selected theme label. Full correction diff is `locator-correction.diff`. Every assertion, timeout, route, nine-palette array, persistence check, axe check and viewport remains unchanged. No test skipping or production changes. Git diff against base confirmed apps, packages, scripts and relevant configurations unchanged after restoring only inspected Next-generated next-env.d.ts/tsconfig.json output changes.

## Executed commands and results

All executed from the isolated candidate worktree at the correction HEAD. Separate raw logs are retained under `logs/locator-correction-*`.

| Command | Result | Log |
| --- | --- | --- |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | exit 0; server TypeScript and Next production build/typecheck pass | `locator-correction-build.log` |
| `QA_BUILT=1 UI_QA_SCREENSHOTS=output/latest-ui-locator-correction npx playwright test -c playwright.account-theme.config.ts --output=output/latest-ui-locator-correction-results` | exit 0; 1 passed, 1.7m overall | `locator-correction-account.log` |
| `npx playwright test -c playwright.theme-picker.config.ts` | exit 0; 36 passed, 1.3m overall | `locator-correction-selectors.log` |
| `npx vitest run -c vitest.appearance.config.ts` | exit 0; 20 passed | `locator-correction-policy.log` |
| `git diff --check` | exit 0 after generated-file restoration | terminal evidence |

Account test executes all nine palettes (dark, light, neon-cyan, neon-emerald, neon-amber, platform-light, platform-dark, client-light, client-dark) across dashboard and both account routes; preserves SPA/reload appearance, 390/800 responsive overflow, axe and client/shared persistence assertions. Selector suite includes combined geometry and overlapping existing coverage, not 36 distinct contracts. Browser tests ran in isolated headless Chrome; no new manual visual-review claim. Screenshots remain locally under `output/latest-ui-locator-correction`.

The account log retains transient readiness-probe ECONNREFUSED output before the fixture API is ready; the browser test subsequently passes. These startup messages are not hidden or presented as a warning-free run.

## Isolation and preservation

Inspected account config -> expanded config -> overview config and built fixture server. `reuseExistingServer: false`; PGlite uses `memory://`; private storage uses a timestamped `.runtime/expanded-real-api` directory. Operator dotenv/database/key overrides are excluded, SMTP/account mail/live AI disabled. `netstat -ano -p tcp` confirmed no listeners on 3110/3111/55432 before launch, while main3100/3101 remained listening. No main process stop/restart, cache clearing or data operations.

The account CLI output override avoids Playwright cleaning the original `evidence/expanded/results`. Existing untracked `evidence/expanded/` preserved; `.next-expanded/` retained and rebuilt only as explicitly requested. Original `logs/account-theme-original.log` is unchanged: Git blob hash before and after `df6e1e1c91fdace47fc67f9d28d86dfae38b06f7`. Original PREPARATION.md and failing evidence remain untouched.

Main checkout read-only verification: branch `ui/global-design-system`, HEAD `ff1d19fb427c054efd9e48bc546c9ec1398ef835`, unchanged. No push, deployment, live email, paid AI, V2 access or manifest edit. Test-only correction commit followed by a separate evidence-only commit; final SHA is supplied in Kanban handoff.

## Handoff

Return exclusive candidate ownership to backend `t_8d33f464` upon this implementation completion. Backend owns manifest update and independent exact-revision requalification; existing reviewer `t_137037d0` remains in the graph. No duplicate review lane, owner acceptance or rollout approval inferred. No separately confirmed production defect found in these checks. Full browser/route/PostgreSQL qualification is outside this bounded correction.

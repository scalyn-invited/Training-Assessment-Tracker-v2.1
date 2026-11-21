# Responsive theme trigger regression — t_bcd6bed8

## Scope and status
Implementation and bounded automated retest complete; independent review and overall acceptance remain with root `t_21dcd42a`. Based on exact product candidate `9b8fe827cb711c9efba01ee03e53a10deaf4af4e` (fast-forwarded this initially older, clean task worktree). No product UI, styling, API or persistence changes. No push/deployment/live email/paid AI.

## Root cause and correction
Guest responsive CSS hides `.theme-current`, so the button's accessible name changes from `Theme <current>` to exactly `Theme`. The migrated `/^Theme /` locator required a trailing space. Reproduced the reported timeout in the original journey after desktop Dark and viewport visits 390/320/800, at the subsequent Light selection. Only test origin was derived from Playwright baseURL before reproduction to use isolated ports.

Audited all tests: replaced 72 occurrences across 42 files with `/^Theme(?: |$)/`. This retains role and start/word-boundary matching without requiring the optional suffix. Programmatic diff audit verifies every non-guest change is solely this replacement. No old pattern remains under tests. Guest retains all existing theme, focus, authentication, one-time authority, responsive and axe assertions, and adds Light/Dark activation plus Escape focus restoration at each 390/320/800 width. Desktop selection remains exercised at 1440. Guest Origin/URL expectations now derive from configured baseURL, preserving same-origin assertions and permitting isolated servers.

## Executed evidence
Evidence archive: `evidence/theme-trigger-selector-fix.tar.gz` (extract into repository root to restore `output/theme-selector/` harness/logs).

- `npm ci --ignore-scripts`: passed, 0 reported vulnerabilities.
- `npx playwright test -c output/theme-selector/playwright.config.ts`: **RED**, exact 15-second `/^Theme /` click timeout at guest theme helper after viewport loop; `red-selector.log` preserves failure.
- Same command after fix and added width assertions: **1 passed (1.7m)**, entire real guest journey; `green.log`.
- `npx playwright test -c playwright.theme-picker.config.ts`: **9 passed**, existing keyboard, focus, geometry, persistence/reset, error/retry and axe checks unchanged; `component.log`.
- `npm run typecheck`: passed; `typecheck.log`. Executed with generated isolated Next types; generated next-env/tsconfig path changes were inspected and restored afterward.
- `node output/theme-selector/audit.mjs`: 42 changed test files, 72 original selectors, non-guest changes selector-only.
- `git diff --check`: passed.

Isolation: Chrome headless, real Next dev renderer/API, fresh in-memory PGlite each run, web/API/database ports 3400/3401/55440, timestamped private storage under this worktree. Operator env/database excluded; SMTP/account mail/live AI disabled. No unrelated service stopped/reused. Logs retain expected startup readiness ECONNREFUSED before successful API startup.

## Preserved setup failures and limits
`red.log` is an initial harness startup failure (config-relative cwd doubled the launcher path); setting explicit repository cwd fixed harness startup before actual RED reproduction. An unattended execute_code call and inline node audit were denied and did not run; normal file-based audit executed successfully instead. QA's upstream original failure remains untouched in its separate worktree.

Not rerun: every other migrated route suite, production build, Firefox/Safari, PostgreSQL concurrency/RLS or manual screen-reader/visual review. Those are not claimed as passes; this is a selector-only correction with guest/component execution and source-level audit of remaining migrated tests. Human/owner acceptance remains deferred and not inferred.

# Independent theme popover QA — t_d0f9320a

## Recommendation
Product acceptance criteria PASS within executed Chrome scope at `9b8fe827cb711c9efba01ee03e53a10deaf4af4e`. No blocking product keyboard/viewport or theme-selection defect reproduced. One confirmed **Medium automated regression defect** remains: responsive guest trigger selector migration. Route to frontend `t_bcd6bed8`; do not describe the unchanged guest suite as green. Overall acceptance belongs to root `t_21dcd42a`; workspace selector was not changed or qualified here.

## Environment and isolation
Windows 11; Node v24.19.0, npm 11.17.0, project Playwright 1.65.0, installed Chrome headless. Exact candidate fast-forwarded into QA worktree; no product implementation edits. Fresh npm ci --ignore-scripts. Actual production components/CSS with synthetic component transport plus real Next development renderer/API and fresh ephemeral PGlite for integrated tests. Web/API/database ports 3390/3391/55439, timestamped private storage under this worktree. Operator .env excluded; email/SMTP/paid AI disabled. No V2 data, production writes, push or deployment.

## Executed acceptance matrix
| Criterion | Result | Evidence |
|---|---|---|
| Opening/closing does not increase sidebar scroll size | Passed | Original 9-test component suite; independent integrated client matrix compares scrollHeight and scrollWidth before/open/closed |
| Legitimate sidebar content remains accessible | Passed | Internal sidebar scrolling at short desktop; Account security link scrolled into viewport after picker closure |
| Desktop/narrow positioning, clipping and internal options scrolling | Passed | Component 1280x600,900x460,1280x300,375x420,320x568; integrated 1280x600,1280x300,375x420,320x300. End brings default option into viewport |
| All available themes and active indication | Passed | Real API enumeration: Light, Dark, Neon Cyan, Neon Emerald, Neon Amber, Platform Light, Platform Dark. Each selected through UI, full reload, data-theme and aria-pressed verified |
| Persistence and reset | Passed | Seven real versioned client saves survive reload; client-default reset read back via API and reload. Component local storage/reset; integrated guest Dark/Light and persisted generated-platform fallback selections |
| Keyboard opening/navigation/dismissal/focus | Passed | Enter/Space, Down/Home/End, Escape, Tab/Shift+Tab, focused option reopening; integrated Space/End/Escape at all four sizes. Nested Personal settings remains open after first Escape and closes on second |
| Outside click and toggle | Passed | Existing component test exercises another control and non-focusable content; intentional focus vs restored trigger checked |
| Async save/error/retry | Passed | Synthetic delayed 409, disabled options, status, alert/reload and subsequent default save; no erroneous local storage mutation |
| Accessible labeling and checks | Passed, bounded | Actual open panel axe WCAG 2/2.1/2.2 A/AA in independent component and integrated matrix; original component axe; guest broad axe. Visible focused default option inspected at desktop and 320x300 |
| Existing regression suites | Mixed | Component9, policy14, branding6, typecheck pass. Unchanged guest behavioral assertions pass only after QA-copy selector correction; original migrated guest selector fails |

Actual integrated geometry (owner dimensions identical before/open/closed):
- 1280x600: sidebar scrollHeight664 / scrollWidth247; panel x12,y168,w224,h364.
- 1280x300: sidebar scrollHeight664 / scrollWidth247; panel x12,y8,w224,h224.
- 375x420: dialog scrollHeight332 / scrollWidth339; panel x42,y8,w291,h291.75.
- 320x300: dialog scrollHeight332 / scrollWidth284; panel x42,y8,w236,h190.5.

The existing sidebar overflow at constrained heights is legitimate content overflow, not caused by theme choices. Inspected integrated 1280x600 and 320x300 screenshots show readable unclipped panels and visible focus; short mobile screenshot is intentionally scrolled to final options. Zero pageerror events asserted in the integrated client probe.

## Defect TP-QA-01 — responsive guest regression cannot locate Theme button
- Severity: Medium, automated regression coverage impaired; product selection remains functional.
- Owner: frontend, follow-up t_bcd6bed8.
- Candidate: 9b8fe827cb711c9efba01ee03e53a10deaf4af4e.
- Preconditions: fresh isolated guest fixture; Chrome.
- Reproduce: execute guest.spec.ts; choose Dark at desktop, traverse widths390/320/800, then theme('Light') at line109.
- Expected: migrated test locates responsive Theme button and continues original assertions.
- Actual: line56 locator `getByRole('button', {name:/^Theme /})` times out. Accessible name is exactly `Theme` because responsive CSS hides current-theme suffix.
- Evidence: `guest-isolated-ports.log`. QA-only copy with `/^Theme(?: |$)/` passes full existing guest workflow (`guest-corrected-selector.log`), including theme, keyboard, auth/account links, responsive and axe assertions. No product fix performed, original test unchanged. Failure reproduced once in original migration and directly explained by accessible snapshot/source; corrected copy passed once.
- Required correction: robust selectors in affected migrated suites, retain behavioral assertions, rerun isolated guest regression. Not a claim that all migrated suites are defective or tested.

## Commands and outcomes
- `npx playwright test -c playwright.theme-picker.config.ts` before additional QA-copy spec: **9 passed** (`components.log`).
- `npx playwright test -c playwright.theme-picker.config.ts qa-independent.spec.ts -g 'QA ' --output output/qa-theme/independent`: **1 passed**, selected option visibility and actual panel axe (`independent.log`).
- `npx vitest run --config vitest.appearance.config.ts`: **14 passed** (`policy.log`).
- `npx vitest run tests/branding.test.ts`: **6 passed** (`branding.log`).
- `npx playwright test -c playwright.qa-theme.config.ts` with only guest copy present: original selector failed, corrected selector **1 passed**.
- `npx playwright test -c playwright.qa-theme.config.ts persistence.spec.ts`: independent real-client probe **1 passed** after correcting unrelated-control locator scope (`persistence-corrected-probe.log`). Run each bootstrap-owning spec separately against a fresh server.
- `npm run typecheck`: passed (`typecheck.log`).
- `git diff --check`: passed before report write; generated Next config changes inspected and reverted separately.

## Preserved non-product failures / corrections
Initial execute_code and a compound tmpdir diagnostic were denied by unattended tool policy and did not execute. Normal permitted npm/Playwright commands worked. Default guest runner could not start due to occupied PGlite55432, then occupied web3110; moved only QA launcher/test-origin to3390/3391/55439, never reused or stopped unrelated service. Initial independent real-client probe incorrectly looked for Sign out inside sidebar (actual header control); all seven selections already passed before that locator timeout. Corrected probe checks actual sidebar Account security link; unchanged theme/geometry assertions passed. Startup readiness ECONNREFUSED messages precede successful API readiness and are retained in logs.

## Limitations / Not Tested
Firefox/Safari, native touch/pinch zoom, manual screen reader, full cross-role suite and every migrated route suite were not tested. No production build rerun in independent QA; upstream built-Next results are not counted as independent passes. No arbitrary synthetic long-theme enumeration: current real API exposes seven entries; constrained viewport makes that actual list scroll. Generated client palettes absent from fresh default client fixture. PostgreSQL RLS/concurrency not requalified (unchanged backend, local PGlite only). Whole-project WCAG compliance and owner/human acceptance are not claimed.

## What's working
Overlay preserves sidebar geometry, uses native top layer without ancestor clipping, retains existing theme persistence, supports error recovery, and keeps modal Escape/focus behavior usable at constrained height.

# Independent selector popovers QA — t_24b58504

## Verdict and exact candidate
**Bounded Chrome QA PASS.** No confirmed product defect remains in the exercised scope. TP-QA-01 is independently requalified using the original committed guest test, not a corrected QA copy. Overall acceptance belongs to root t_21dcd42a; no deployment, main-app integration or human acceptance is claimed.

Tested product/candidate: `bd7bc723d38a5b18dda05ff3baa2334af9247b9b`. This QA worktree initially contained `ff1d19f`; it was clean and fast-forwarded explicitly to the final candidate. Inspected dependency handoffs t_bcd6bed8 and t_6bd6979d and root scope. Candidate contains reviewed selector correction `ed826d2a87dd868b474e854c6c06433aeb4cc799`, theme product `9b8fe827cb711c9efba01ee03e53a10deaf4af4e`, prior QA `4973daae85fc59313f06031230816139dbe31f0e`, and workspace implementation `d08d2fcde3de64ce3b579f64e33fe8bbb6a3830a`. Prior reports are references, not results credited to this run.

Read AGENTS, DESIGN, checklist, shared browser-policy/Playwright/UX-auditor and profile runtime-QA skills. No application implementation edits made. New QA probe and guest config are evidence-only additions.

## Executed commands and outcomes
Run from this worktree on Windows, Node v24.19.0, separate headless Chrome.

| Command | Result | Evidence under output/selector-qa |
|---|---|---|
| `npm ci --ignore-scripts` | Passed; 275 packages, audit zero | tool output |
| `npx playwright test -c playwright.theme-picker.config.ts --output output/selector-qa/components` (before adding new probe) | 31 passed: original theme9, prior independent10, workspace12 | components.log |
| `npx playwright test -c playwright.workspace-popover.config.ts --output output/selector-qa/real` | 1 passed integrated journey | real.log |
| `npx playwright test -c playwright.selector-guest-qa.config.ts` | 1 passed ORIGINAL guest suite | guest.log |
| `npx playwright test -c playwright.theme-picker.config.ts selector-qa.spec.ts --output output/selector-qa/independent-final` | 5 passed new combined geometry probes | independent-final.log |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build` | Passed | build.log |
| `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts first-paint.spec.ts geometry.spec.ts outage-policy.spec.ts` | 4 passed | appearance.log |
| `npx vitest run --config vitest.appearance.config.ts` | 14 passed | policy.log |
| `npx vitest run tests/branding.test.ts` | 6 passed | branding.log |
| `npm run typecheck` | Passed server/web | typecheck.log |
| `git diff --check` | Passed | tool output |

The 31 component checks include overlapping earlier QA tests: these are not represented as 31 distinct contracts. No failed product checks were discarded.

## Acceptance matrix
- **Passed — no inline expansion:** independently added before/open/closed scrollHeight/scrollWidth and navigation rectangle checks for BOTH selectors at 1280x600, 1280x300, 320x300, 390x420 and 800x300. Workspace is actually `:popover-open`; theme remains its native overlay. Opening/closing changes neither sidebar dimensions nor navigation position. Mobile theme measures both sidebar and Personal settings dialog.
- **Passed — legitimate scrolling retained:** desktop short component sidebar remains height428 with viewport300; integrated Learning sidebar height664 at both viewport600 and300. Account security remains reachable by scrolling. No overflow suppression added.
- **Passed — bounded panels/internal scrolling:** workspace natural content221px; desktop short panel clientHeight156/scrollHeight221; narrow320 and breakpoint800 panel214/221. At normal1280x600 panel221/221 (no unnecessary scroll); no horizontal panel overflow. Theme bounds and last-option visibility pass, including 800x300 nested dialog probe.
- **Passed — keyboard/dismissal:** Enter, Space, Tab, Shift+Tab, Escape and trigger-focus return; pointer toggle and intentional outside-control focus preserved; workspace/theme dismiss one another without stealing focus. Theme additionally covers arrow/Home/End and pending/error/retry behavior.
- **Passed — navigation/guards:** actual isolated client journey followed Platform administration, Learning workspace, Choose your client and Manage account access. Dirty Notifications choice survived cancelled workspace navigation, then confirmed departure reached dashboard. No pageerror events in integrated journey.
- **Passed — existing mobile workflow:** theme still opens within Personal settings; Escape closes picker before settings. Workspace remains header-triggered overlay. Original guest journey exercises desktop and390/320/800 with Light/Dark activation and Escape focus.
- **Passed — semantics/visibility contract:** source diff preserves navigation labels/order/hrefs, global_admin and canManageAccounts predicates, branding white-label exclusion and Platform aria-current. Runtime synthetic component matrix verifies Global Admin/member/client-admin and white-label combinations. External Cerebru href inspected, not visited. Only three frontend product files differ from selector fix; no backend/domain/permission changes.
- **Passed — persistence/appearance:** all seven real available client themes saved and survive reload with selected state; client default reset survives reload. Built-Next saved Dark pre-hydration, geometry reload matrix and approved503 fallback/recovery pass. Four targeted tests are not the entire temporal suite.
- **Passed, bounded accessibility:** actual open workspace panels at all five dimensions and actual theme panels scanned with axe WCAG2A/AA,2.1AA,2.2AA tags; keyboard and visible focus inspected. No whole-app conformance or screen-reader claim.
- **Passed — TP-QA-01/assertions:** fresh mechanical audit confirms72 replacements across42 test files in ed826d2; all non-guest files selector-only. Guest diff retains original assertions, uses configured baseURL and adds responsive theme/focus assertions. Current original guest suite passes with committed selectors. Prior sibling QA copy still contains desktop `/^Theme /` selectors; its passing checks are not substituted for original guest qualification.

### Numeric geometry examples
Before/open/closed values are asserted equal in independent-final.log. Platform component sidebar h/w:1280x600=600/247,1280x300=428/247,320x300=80/320,390x420=80/390,800x300=80/800. Desktop main navigation y166 unchanged while toggling workspace; after deliberate scroll to theme at short height y38 remains unchanged while toggling theme. This deliberate scroll is not menu displacement.

## Inspected screenshots
Fresh integrated captures under `output/selector-qa/real/workspace-QA-real-client-a-c050c--desktop-and-mobile-overlay/`:
- `workspace-1280x600.png`: readable overlay covers rather than pushes navigation; existing Accounts layout intact.
- `workspace-320x300.png`: visible focus, four links, panel within narrow viewport.
- `workspace-800x300.png`: breakpoint header overlay within viewport, readable links and focus.
- `320x300.png`: internally scrolled theme overlay above mobile settings; last reset control visibly focused, no clipping outside viewport.
Only those four images are claimed visually inspected; additional generated captures remain automated evidence. Next development indicator is visible and is not product UI.

## Failures, harness corrections and limits
Initial independent probe:4 passed/1 failed at800x300 because QA incorrectly used `width < 800` to select desktop Theme. Actual CSS uses max-width800; corrected only new QA probe to `<=800`, retained original log/trace, reran all five unchanged geometry/accessibility assertions successfully. This is an instrumentation error, not a product fix. Readiness ECONNREFUSED warnings occurred before isolated API startup; journeys then passed. An unattended execute_code call and a node -e environment probe were blocked before execution; supported file-based terminal checks succeeded, no approval bypass/config changes.

Fresh timestamped isolated PGlite/private storage under this worktree;3490/3491/55449 verified free before runs. Real and guest suites each launch a fresh fixture (reuseExistingServer:false), no shared installed database. Launcher disables SMTP/mail/live AI, ignores operator env and clears database/encryption overrides. First-paint uses separate synthetic transport3280/3281 and isolated production build, no database. TEMP/TMP/TMPDIR resolved into worktree output/selector-qa/tmp. No operator secrets, V2 data, live email/AI or external navigation. Raw authenticated traces/private-link screenshots are excluded from deliverable archive.

**Not Tested:** Firefox/Safari, manual screen reader, native touch/pinch zoom, PostgreSQL/RLS/concurrency, full migrated route and full temporal suites. Role visibility is synthetic component coverage plus source audit, not a new real-role authorization matrix. Production build and targeted built guest appearance tested; real client/navigation journey uses development renderer. No deployment authorization inferred.

Generated Next config changes inspected and restored; generated .next-workspace remains untracked locally. QA commits contain only report/config/probe and curated evidence. Root may review this bounded result; human acceptance remains deferred under project policy.

# Independent first-paint QA — t_8db94a12

## Verdict
**CHANGES REQUIRED for overall acceptance.** Original FOUC-01 is resolved in the exact four reload/cache/loading conditions. Remaining generated-theme outage fallback and visible loading geometry shifts prevent a blanket no-flash/no-layout-shift recommendation. Follow-up frontend card: `t_9ea2df68`. This completes independent testing/reporting, not feature acceptance or deployment approval.

Implementation tested: `68a39bf267193a41f872e4b5a1dabd13cda482f2`, cherry-picked as `a540f76`; application diff against source commit is empty after restoring build-generated next-env/tsconfig. Tests added independently; implementation unchanged. Build and all runs local, synthetic transport fixtures at 3280/3281; separate actual API/worker guest journey uses isolated PGlite at 3110/3111. Operator runtime 3100 and V2 untouched. No paid AI/live mail/push/deployment.

## Executed matrix
| Scenario | Result / evidence |
|---|---|
| Production build | Passed, build.log |
| Original built-Next suite, Chrome | Passed: 17 tests, existing-browser.log |
| Same pre-hydration/preference suite, Edge | Passed: 16, cross-browser.log; transient fixture ECONNRESET recorded, not a clean-server-log claim |
| Same suite, Firefox | Passed: 16, firefox-final.log. Initial wrong inherited channel and missing browser were harness failures; corrected config and isolated browser install, unchanged assertions |
| Independent normal warm Dark reload | Passed theme continuity; 31 visible samples |
| Independent hard warm Dark reload | Passed theme continuity; 35 visible samples |
| Independent normal cold Dark reload | Passed theme continuity; 48 visible samples |
| Independent hard cold Dark, 800ms latency, 200000 B/s down, 100000 B/s up | Passed theme continuity; 240 visible samples; pending/settled screenshots |
| Four reload conditions, layout stability | Failed strict no-shift criterion; see FOUC-QA-03 |
| Guest account/link, anonymous dashboard/assessments and not-found | Passed settled Dark; recorded frames all Dark. Protected routes are anonymous boundary checks, NOT authenticated workflow qualification |
| Light/Dark conflicting OS preference, three neons, Platform Light/Dark | Passed pre-hydration canvas, native scheme, reload on Chrome/Edge/Firefox |
| Missing/corrupt/blocked storage, configured reset | Passed on all three browsers |
| Delayed authenticated context at account/security and dashboard | Passed synthetic shared/client scope precedence, no guest substitution; not real authentication qualification |
| Same-scope return navigation | Passed all three browsers; stale initial default does not replay |
| Branding failure with saved built-in Dark and retry | Passed all three browsers |
| Branding failure with saved generated Platform Dark and retry | **Failed**, FOUC-QA-02; independent.log |
| Widths 1440, 801, 800, 390, 320 | Passed Chrome visible sampled navy palette and horizontal-overflow checks; 390 includes 200ms throttling. Mobile screenshot visually inspected |
| Five built-in palettes, retained email value, keyboard Email→Password | Passed; independent accessibility test |
| Axe WCAG A/AA tagged checks for five built-in palettes | Passed, zero violations; accessibility.json. Reduced-motion emulation active; this is not full manual WCAG certification |
| Existing real-API authentication/private account-link journey | Passed 1 test; guest.log. Startup health ECONNREFUSED is retained; readiness subsequently succeeded |
| Branding domain regression | Passed 6; branding.log |
| Server/web typecheck; whitespace | Passed; typecheck.log and git diff --check |
| OS-following System option | Not Applicable: not implemented. Configured default is not OS theme; no new behavior introduced |

Independent Chrome version recorded: **157.0.8103.78**, Windows headless, reload matrix viewport 1280×720. This differs from baseline Chrome 156 / dev runtime / 762×428 screenshot: comparison demonstrates correction under equivalent operations, not identical binary/pixel environment. Cold means HTTP cache cleared, local preference retained; hard means CDP Page.reload(ignoreCache=true), not a keyboard shortcut. Frame sampling verified visibility=visible, and every reload canvas sample was rgb(7,11,22). No pageerror or hydration mismatch observed in the independent matrix; not all console/network warnings are asserted absent.

## Before/after and visual inspection
Baseline t_62461e98 REPORT and dark intermediate screenshot are included. Baseline four cases all showed Light→Dark (observed intervals 307.4, 287.9, 338.1, 6020.1ms). After correction, none of the collected visible samples in the four cases used Light or historical neutral-black canvas.

Actually inspected: baseline intermediate; after hard-cold-800ms intermediate and settled; generated-outage and recovered; 390px settled. The normal pending frame is navy with known Scalyn text and loading status, then retains navy as form arrives. Logo space is reserved while image loads. Mobile fields/controls fit and text is readable. Captures are real screenshot pairs plus per-frame observations, not a compositor video or proof about every sub-frame. Additional automated screenshots exist but are not claimed individually visually inspected.

## Defects
### FOUC-QA-02 — saved generated Dark renders Light during branding outage
**Medium; reproducible once in dedicated deterministic negative test; known implementation limitation, now independently confirmed.** Environment: built implementation above, Chrome, `/login`, fixture API. Preconditions: localStorage training.v21.appearance.platform.guest=platform-dark; fixture cookie brand-failure=1 makes branding return 503.
1. Load /login. Observe appearance error and Retry appearance.
2. Inspect html theme / canvas and screenshot: Light and fallback Training Tracker.
3. Remove failure cookie; activate Retry appearance.
Expected: no incorrect Light frame for intended Dark; unavailable authority must receive explicit approved disposition, not a passing claim.
Actual: html light then platform-dark; full light-to-dark repaint and branding replacement. Saved preference remains intact. Evidence: independent/qa-independent-QA-generate-e9781-ses-incorrect-initial-theme/{outage.png,recovered.png,outage.json,trace.zip}; failing assertion in independent.log. Owner frontend, `t_9ea2df68`. Do not solve through unsafe cross-user palette caching. Generated fixture contrast is not qualified.

### FOUC-QA-03 — existing visible content shifts when login form replaces loading status
**Low; reproduced in all four reload conditions.** Same build, `/login`, saved Dark, 1280×720. Reload, particularly hard/cold/800ms, and compare intermediate versus settled captures.
Expected: insertion of form in pending region should preserve already visible introduction/footer/theme control positions where feasible; strict root acceptance requires no visible layout shifts.
Actual: left introduction rectangle y271.3125→297.3125, footer y542.671875→706; theme control x1104.9375→1129.53125 as Loading changes to Dark. Non-input layout-shift value sum 0.01688325932290819 for each reload. This is small, not a severe Core Web Vitals failure, and form insertion itself is legitimate; the separately visible movement remains observable. Evidence: matrix.json, summary.txt, hard-cold screenshot pair. Pre-existing versus newly introduced geometry regression is not established; parent implementation already disclosed the limitation. Owner frontend, `t_9ea2df68`.

## Explicit incomplete coverage / acceptance mapping
- No-outdated/incorrect-theme refresh: Passed normal available-brand paths; Failed generated outage case.
- Dark immediately active on reload: Passed built-in Dark; generated outage fails.
- No visible layout movement: Failed strict criterion above; no universal zero-CLS claim.
- All views/components use one system: Not Tested exhaustively; bounded guest/shared/client shell evidence only.
- Loading states match selected theme: Passed sampled available-brand states; generated outage fails.
- Desktop/tablet/mobile: Passed bounded Chrome CSS viewport tests, not physical devices or all browser×viewport combinations.
- Existing functionality: Passed focused real API guest/auth/account links and branding domain; full application regression Not Tested.
- Designer additional routes `/platform`, dialogs, cross-client switching, real distinct-user signout/signin appearance isolation, authenticated complete dashboard data, independent page-data failure and all client-light/client-dark permutations: Not Tested in this run. Synthetic scope tests do not replace these.
- WebKit/Safari, physical mobile, full screen-reader/focus-order audit, generated contrast, CPU throttling, load/rate limits and 2500ms server-deadline edge: Not Tested.
- No exact stale-asset-version causation or old stylesheet delivery claimed. No external Figma review or human acceptance performed.

## Reproduction commands
```
API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build
FIRST_PAINT_BUILT=1 npx playwright test --config=playwright.first-paint.config.ts
FIRST_PAINT_BUILT=1 npx playwright test --config=playwright.qa-paint.config.ts first-paint.spec precedence.spec
npx playwright test --config=playwright.guest-ui.config.ts
npx vitest run tests/branding.test.ts
npm run typecheck
```
The independent generated-outage assertion intentionally remains failing, not skipped or weakened. Firefox installation for this run used PLAYWRIGHT_BROWSERS_PATH within evidence/first-paint/browsers; binaries excluded from deliverable. Logs preserve original infrastructure failures and successful retries. Raw authentication artifacts, database files and private links are excluded from evidence archive.

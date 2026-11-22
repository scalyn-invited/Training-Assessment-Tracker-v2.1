# Root QA round 3 — reviewer rework completed

## Candidate and recommendation

Product remains **37fe632303d44678a685e836fc1987d9da1f252d**; starting QA commit **6e5386c1b5cca8b0523ef9563d1628d60b7fc272**. No application files changed. `git diff --exit-code 37fe632 -- apps packages`, prior evidence integrity against 6e5386c, and `git diff --check` pass. Actual production Next builds from the previous exact-product run were reused, not rebuilt or described as newly built. Windows installed Chrome, isolated synthetic in-memory PGlite/API/worker; live AI/mail disabled. All browser fixture processes use dedicated test ports, not operator port3100.

**Recommendation: accept the bounded automated QA evidence for this feature, subject to independent orchestrator review.** R2-1, R2-2 and R2-3 have executed dispositions below. No newly confirmed product defect remains from these three findings. This does not approve deployment, claim universal pixel invariance, or complete deferred human acceptance.

Read with `evidence/candidate-final/REPORT.md` and `ROUTE_MATRIX.md`: their 38-route family/workflow evidence, original failures and limitations remain preserved. This report supersedes only their unresolved identity/scope classifications and missing representative dynamic temporal coverage.

## R2-1 — malformed synthetic dashboard response: resolved in QA fixture

Confirmed source contracts: `apps/web/app/dashboard/page.tsx:11–23,40,151` requires `{total,page,records}`; `components/background-receipts.tsx:32,75–78` requires an array. `tests/first-paint-browser/server.cjs` previously returned HTTP200 `{}` for both. The earlier renderer failure is a malformed test fixture, not a real-API authentication defect.

The fixture now returns a successful empty overview and empty jobs array. Identity tests retain pre-hydration guest-override negatives, and additionally assert both resolved empty states, the next real jobs polling response, mounted dashboard/Sign out, absence of recovery boundary, and no console/render/page errors. This closes the early-Sign-out-before-crash false-pass race.

- Focused identity repetition: **10 passed** (five shared + five client), `identity.log`.
- Full first-paint suite: **22 passed / 1 explicitly superseded-contract failure**, `paint.log`. Only retained strict generated-theme outage assertion expects platform-dark instead of user-approved built-in dark. Separate outage-policy test passes. No assertion disabled or converted to skip.
- Original identity failure/trace in `evidence/candidate-final/paint-results` unchanged.

## R2-2 — exact transition anomaly: capture-induced viewport perturbation demonstrated

The instrumentation keeps the original held/released real-API shared→client transition and all destination-theme/branding assertions. It adds per-rAF viewport/client dimensions, computed body/main layout, stylesheet URLs/rule counts/enabled/media states, screenshot interval markers, DOM style/stylesheet mutation records and LayoutShift observer evidence. This is not an idle dashboard calibration.

`transition-summary.json` aggregates the raw files:

| Control | Transitions | rAF samples | Outcome |
|---|---:|---:|---|
| Initial full-page capture | 12 | 883 | no anomalous sample |
| Initial capture-free | 12 | 642 | no anomalous sample |
| Full-page capture stress | 60 | 4115 | **one reproduced anomalous sample; test fails and is preserved** |
| Capture-free stress | 60 | 3000 | pass; no anomalous sample |
| Viewport-only capture stress | 60 | 3761 | pass; no anomalous sample |

Decisive reproduction: `capture-stress/25/scope-transition.json`, frame34 at t1171.7ms. During **settled full-page capture**, viewport and document client width temporarily become **1×1**, bracketed by **1280×720** frames. The main becomes **x0/y613/width32**, and visible brand copy disappears—matching the original frame166 signature exactly. Theme remains client-dark. Both stylesheets remain enabled and loaded (164/804 rules), with no media replacement. The screenshot itself is a correctly styled full-width QA Alpha dashboard; independently inspected. We do not claim that the rAF sample is a real user's normal-viewport painted frame.

Source explains the signature: `apps/web/app/platform/overview.module.css:542–595` switches to mobile below800px, hides `.brandCopy`, removes the desktop margin, and applies `8px 16px 24px` main padding. This is correct responsive CSS under the capture's abnormal viewport, not late/old CSS or stale appearance authority. Playwright's installed `coreBundle.js:39188–39205` invokes Chromium `Page.captureScreenshot` with captureBeyondViewport for full-page capture. The causal conclusion is bounded to this observed Chromium/automation capture perturbation; no claim about its upstream browser internals or all browser versions is made.

**Harness correction:** main scope test uses viewport-only captures for the sampled transition and records/asserts configured viewport dimensions. Every original destination-frame theme/branding, nonblank pending, history, retry, stale-response/race and identity/client preference assertion remains. No frame is filtered out to obtain a pass. Full scope test **1 passed**, `scope-final.log`. The original failed evidence and new causal RED remain untouched.

## R2-3 — representative dynamic layouts: executed at three widths

New tests: `editor-temporal.spec.ts`, `learning-temporal.spec.ts`, `temporal-helper.ts`. Actual isolated real API/role fixtures and built Next; not mocked success HTML. Dark selected through UI and preference POST awaited. Widths **1440 / 820 / 390**, height1000. Measurements exclude unpainted/offscreen elements, record existing painted control rectangles/font/colors and overflow, and observe completed animation frames after state assertions.

Final runs (`verified-editor.log`, `verified-learning.log`) pass:

| Family | Temporal cases | Samples | Tested changes and invariant anchors |
|---|---:|---:|---|
| Assessment editor | 12 | 179 | held authority→ready nav controls; visible title typing; section switch with invariant Back link; rich prompt input |
| Lesson and receipt | 12 | 336 | held lesson/receipt data→ready with existing Back link; lesson response autosave with fixed textarea geometry; receipt integrity expansion with fixed summary geometry |

All final samples remain Dark and have no horizontal overflow; required visible anchors satisfy the explicit geometry/style assertions. These are **24 cases / 515 samples**, not 24 independent browser tests (two tests execute them). Content insertion and action-dependent controls are not falsely called identical rectangles.

Source-backed equivalence:
- `/assessments/definitions/[id]` renders the same `AssessmentBuilder` for new/saved definitions. These responsive samples exercise new editor; existing gate/save/history tests from the prior candidate cover saved-ID reattachment/newer edits. No assertion of published-action equivalence.
- `/enrolments/[id]/delivery/[blockId]/[index]` delegates to `LearningLesson`; shared pending/content/work-form paths in `components/delivery.tsx:200–457`. Representative member lesson0 uses a real activated synthetic plan, published quiz and authorized early start. Existing full lesson suite covers other permission/preview/error branches; no visual equivalence of every branch is invented.
- `/enrolments/[id]/submissions/[submissionId]` delegates to `SubmissionReceipt`; shared pending/immutable receipt at `delivery.tsx:630–769`. Representative real submitted learner receipt; existing full receipt/review suites retain reviewer/withdrawal/grading/appeal branch coverage. Reviewer-only form rectangles are not newly frame-qualified.

### Preserved diagnostics and corrections

Initial editor probe failed because it froze intentional active-tab background and a source-defined Add question toolbar insertion; at820px that insertion moves nav by13px and at390px Save draft splits its row. Source: `assessment-builder/builder.js:75–78`, `ui/assessment-builder.module.css:17–35,99–110`. These changes occur from explicit section selection, not delayed styling. The corrected test asserts the expected active step and visible Add question, preserves nav/save measurements, and compares the invariant Back link across selection. It also measures title/prompt input separately. It does **not** claim the changing toolbar has zero action-induced geometry movement. Original `editor.log` and JSON retained.

A second diagnostic required nav samples while the prompt scrolled it offscreen; that fails honestly with zero/one sample. Corrected explicit scrolling before measuring the prompt and required the visible prompt, retaining both diagnostic outputs. Mobile title likewise requires a separate scrolled observation rather than counting an offscreen box as painted. No product change.

Initial TypeScript verification caught extensionless new helper imports; changed to `.js` per NodeNext, reran both browser tests unchanged and server/web typecheck successfully (`typecheck-final.log`). Original typecheck failure preserved.

Inspected images: causal full-page dashboard capture25; mobile editor prompt, mobile lesson response, tablet expanded receipt. Dark surfaces and visible measured controls render consistently without horizontal clipping. Sticky editor header and legitimate viewport scroll are visible; these images do not prove unseen frames or full manual accessibility.

## Consolidated acceptance status

| Original criterion | Automated QA outcome |
|---|---|
| No outdated/incorrect theme on refresh | Passed bounded reload/cache/pre-hydration matrices; fixture race now corrected and post-data identity stable. |
| Dark immediately active after reload | Passed existing four reload conditions and representative responsive samples; approved generated-theme 503 fallback retained. |
| Navigation without outdated theme/style flicker | Passed real scope/history/race matrix and capture-free/viewport-capture controls. Historical abnormal scope frame causally classified as capture viewport perturbation, not waived. Intentional user-driven content/toolbar insertion remains documented. |
| Shared design system across views | Prior38-route executed matrix retained, plus representative dynamic painted-control checks; source-backed renderer equivalence above. |
| Theme-matched loading/placeholders | Passed existing first-paint/gate/outage tests and newly held dynamic pending→ready states. |
| Desktop/tablet/mobile consistency | Prior54 static cases plus new24 dynamic cases at1440/820/390. Not a pixel audit of every component permutation. |
| Existing functionality unaffected | Prior exact-product workflow/family/integrated passes retained; current full scope, first-paint, dynamic journeys, policy14 and server/web types pass within disclosed strict-outage exception. |

No physical-device/WebKit/full manual WCAG/all palette contrast qualification added; PostgreSQL concurrency, real installation and live services remain outside this feature run. Deferred human reviews remain deferred, not inferred completed.

## Reproduction

Use workspace TEMP/TMP/TMPDIR under `evidence/round3/tmp`. Each bootstrap-owning real-API spec needs its own fresh server:

- `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts precedence.spec.ts -g 'identity never' --repeat-each=5`
- `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts` (one documented superseded-contract failure)
- `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_CAPTURE=1 QA_EVIDENCE_DIR=<fresh-dir> npx playwright test -c playwright.qa-expanded.config.ts scope-instrumented.spec.ts` (60 exact transitions; causal anomaly intermittent)
- Same probe with `QA_CAPTURE=0` or `QA_CAPTURE=viewport` for controls.
- Same built config, separately: `scope.spec.ts`, `editor-temporal.spec.ts`, `learning-temporal.spec.ts`, with fresh `QA_EVIDENCE_DIR`.
- `npm run typecheck`; `npx vitest run -c vitest.appearance.config.ts`.

Use committed formatted spec files directly. `make-*` files under raw evidence document initial probe construction and are not the canonical regenerators after subsequent harness corrections.

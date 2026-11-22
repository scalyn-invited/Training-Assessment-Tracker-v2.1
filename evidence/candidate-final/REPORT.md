# Root QA — exact-candidate expanded verification

## Verdict and candidate

**Bounded fix retest PASSED; expanded route/workflow coverage is ready for orchestrator review. No unconditional all-interactions/no-flicker acceptance or deployment approval is claimed.** Two intermittent observations remain explicitly unresolved below; successful reruns do not erase them.

Product: `37fe632303d44678a685e836fc1987d9da1f252d`, fast-forwarded from root `2938878`. Independent production builds and server/web typechecks passed. `git diff --exit-code 37fe632 -- apps packages` passed after restoring generated Next configuration. QA changed only tests, harnesses and evidence. Existing RED/outage evidence remains untouched; no push, deployment, live mail, paid AI or production data.

Environment: Windows, installed headless Chrome, actual built Next `.next-expanded`, isolated in-memory PGlite/API/worker and synthetic fixture data. Each bootstrap-owning spec ran with a fresh server. TEMP/TMP/TMPDIR were scoped under this evidence directory. First-paint uses its separate built renderer and fixture API. PostgreSQL/RLS/concurrency, real installer provisioning and external integrations are not qualified here.

## Prior confirmed defects

| Defect | Independent result |
|---|---|
| FOUC-01 saved Dark | Passed exact normal/hard × warm/cold reload, navy pre-hydration, responsive/throttled checks in first-paint repeat. |
| FOUC-QA-02 outage | Approved bounded built-in Dark fallback, retained generated preference, repeated failure and authoritative recovery pass. Original stricter generated-theme assertion still fails and is preserved. This is a contract change, not an unchanged-test pass. |
| FOUC-QA-03 login geometry | Both existing-element geometry cases pass, including four reload conditions and pre-hydration/settled comparison. |
| FOUC-QA-04 authority gating | Scope/history/retry/races/client/identity test passes four unchanged repeat runs; first run has an unresolved anomalous frame described below. Approved authority-gated protocol retained; no guessed palette or old-heading-before-release contract reinstated. |
| FOUC-QA-05 blank builder | Focused gate/save/newer-edit/history test 1 passed; actual delayed lazy-bundle test 1 passed; unchanged full real-API builder 1 passed. Pending and settled screenshots independently inspected: explicit nonblank pending then real initialized builder. |

## Executed coverage

`ROUTE_MATRIX.md` maps **38 source page files to 38 executed rows**, verified against source in code, with the original source-derived family/state inventory retained in `evidence/expanded/route-inventory.md`. Each primary family now has a successful execution at this exact product tree. This includes platform overview/clients/people/admins/audit/settings/alias/status, account access/security, chooser, client people/administration/AI/appearance, dashboard, training directory/record, onboarding, curriculum, generation, document review, delivery, lesson, receipt, progress, review queue, notifications, assessment directory/builder/assignment/response, guest/account link/setup and recovery/redirect surfaces. Mock administration also passed in an explicitly mock isolated server.

The existing family suites execute their source-inventoried pending/error/retry, child controls, dialogs, steps, permission projections, responsive/overflow and axe assertions; they are not merely heading smoke tests. Dynamic/private learning families use their own authorized synthetic fixtures, not the administrator denial states used in parts of the static-route sweep. Platform Appearance and its alias share the exact component and retain direct-entry checks. Hosted/local installation remains UI-fixture coverage, not real installation qualification.

Additional independent temporal sweep: **54 cases across 18 static routes at 1440, 820 and 390 CSS pixels**, 2,521 frame samples, 200ms browser API latency. All samples remained Dark; no visible heading glyph movement/font change or horizontal overflow was found. `layouts-calibrated/summary.json` and per-case JSON preserve results. This measures visible heading glyph geometry, not every component dimension. The original container-width probe remains separately failed: Clients/People at 820px changed unused H1 container width by 18px without changing x/y/height/font. It was not silently labelled a no-size-change pass. A separate held-directory probe, corrected to exclude invisible closed-details descendants, confirms existing visible controls retain their positions. Inspected pending/settled tablet directory screenshots agree.

Visual inspection in this run: builder pending and settled; tablet directory pending/settled; mobile dashboard Dark; tablet platform Dark; CSS-probe settled dashboard pair. No clipping observed in those inspected frames. The other automated screenshots are not claimed individually inspected.

## Regression results (not inflated by repeated runs)

| Check | Result |
|---|---|
| Full first-paint repeat | 22 passed / 1 preserved superseded-contract failure |
| Initial first-paint run | 21 passed / 2 failed: same superseded assertion plus one client-identity visibility timeout |
| Appearance policy | 14 passed |
| Branding domain | 6 passed |
| Full workflow component suite | 22 passed (`full-workflow.log`) |
| Builder-focused subset | 10 passed; overlaps full workflow, not additional unique coverage |
| Real Next dirty-history/sidebar navigation | 1 passed on installed Chrome; original launch failed before testing due absent bundled Chromium |
| Broad integrated foundation journey | 1 passed unchanged (4.9m). Earlier hidden-section baseline failure is not reproduced at this candidate. |
| Real API client-selection / directory-history / shared shell | 1 passed each |
| Source-mapped UI families | Successful scenario logs listed individually in execution-index.json and ROUTE_MATRIX.md; setup 3 passed, other listed invocations 1 each |
| Production builds / typecheck / product-tree equality / diff whitespace | Passed |

## Failure triage — original outputs retained

1. **Generation harness race:** immediate protected-route `goto` competed with asynchronous logout redirect (`ERR_ABORTED`). Added explicit successful logout response, completed login navigation and null authenticated user assertions before the protected-route probe. Original redirect/error assertions remain. Corrected sequence passes; no product modification.
2. **Setup fixture mismatch:** browser-only 503 interception did not affect healthy SSR branding and could be unused. Added an explicit `brandingchanged` refresh and required the actual intercepted 503 before checking Retry. Recovery, persisted Dark, requirements/upgrade and saved-step assertions pass. This is **refresh outage** coverage; first-document outage remains in the dedicated first-paint suite, not falsely inferred here.
3. **Lesson focus sequencing:** previous theme POST completed asynchronously and could focus its menu summary after native invalid-form focus. Waiting for successful theme save, applied Dark and closed menu before invalid publication preserves the original first-invalid-field focus assertion; full lesson scenario passes.
4. **Initial layout harness:** shared-scope theme is stored locally, not a preference POST. Corrected the probe to wait for a POST only in client scope. Initial timeout remains recorded.
5. **Container/visibility instrumentation:** the initial heading-box probe measured unused flex width, not glyph position. Initial directory probe counted closed-details descendants with nonzero rectangles and ambiguous empty labels; screenshots showed they were not painted. Corrected probes record glyph ranges and real visibility respectively. These invalid measurements are not confirmed product bugs, nor proof that all layout dimensions are stable.
6. **CSS-delay probe invalid:** no new stylesheet request was intercepted, so its prerequisite assertion failed. Both inspected captures were styled. It does not prove a CSS-delivery defect or CSS-delay resilience.
7. **Next infrastructure:** bundled Chromium was absent; reran identical navigation assertions using installed Chrome via a QA-only config. Passed.

## Unresolved intermittent observations — not waived

- **Scope temporal first run:** one captured `/dashboard` frame had correct `client-dark` but missing visible `QA Alpha`, main rect x=0/y=613/width=32, among otherwise x=248/y=165.5/width=1032 frames. Original test failed. Four unchanged fresh-server repeats passed. A stable-dashboard calibration (181 idle frames and 167 frames around 20 full-page captures) did not reproduce it. Cause and actual painted visibility remain **unclassified**; neither application defect nor screenshot artifact is asserted. Raw frame sequence is retained. Recommend targeted review of this observation before a literal universal no-flicker acceptance claim.
- **Initial first-paint client identity:** one Sign out visibility assertion timed out after authority release. Whole-suite unchanged repeat passed this case, leaving only the known superseded outage assertion. This is an intermittent failure, not deleted or established as a fixed product defect.

No newly confirmed reproducible product defect is created from either observation. These are explicit reliability risks for the reviewer, not an implicit waiver.

## Acceptance matrix

| Criterion | Status and boundary |
|---|---|
| No outdated UI/incorrect refresh theme | Passed bounded pre-hydration/reload matrices and 54-route/viewport observations; universal claim not established by finite testing; intermittent identity timeout retained. |
| Dark remains active immediately | Passed measured first-paint and static-route cases; generated outage uses the explicitly approved Dark fallback. |
| No navigation flicker/layout shift | Passed repeated scope/history/race checks and measured heading/visible-control geometry; **overall unresolved** because of the single anomalous scope frame and unmeasured component geometries. |
| All views/components use design system | Passed source-mapped family scenarios and sampled visual/axe checks; exact alias equivalence documented. Not a pixel audit of every dialog in every theme. |
| Theme-matched loading/placeholders | Passed first-paint/outage/gate and existing family pending/recovery assertions, plus Dark temporal samples. No new skeleton requirement invented. |
| Desktop/tablet/mobile consistency | Passed 1440/820/390 static temporal sweep and suite-specific responsive dynamic-family scenarios. Dynamic editors/delivery states have not all received the same three-width frame-by-frame geometry sweep. |
| Existing functionality unaffected | All selected exact-candidate UI/workflow/integrated regressions have successful runs, with sequencing corrections and original failures disclosed. Not proof of all unported V2 functionality. |

Not Tested: physical devices/WebKit/full manual WCAG; every dynamic-route component rectangle during every transition; all generated palette contrast combinations; real installation/upgrade, live provider/mail/antivirus and PostgreSQL concurrent security qualification. These are not represented as passed or deferred human approvals completed.

## Reproduction / handoff

From root workspace, with TEMP/TMP/TMPDIR under evidence/candidate-final/tmp:

- Build: `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build`.
- Real API families: `QA_BUILT=1 QA_TEST_DIR=tests/<suite> npx playwright test -c playwright.qa-expanded.config.ts --output=<fresh-dir>`; separate server per bootstrap-owning file. For mock: `QA_MOCK=1`, client-admin mock.spec.ts only.
- Root probes: same command with QA_TEST_DIR=tests/expanded-appearance-browser and specific scope/builder-gate/builder-loading/layouts/scrollbar spec. Supply QA_EVIDENCE_DIR or BUILDER_GATE_EVIDENCE to avoid overwriting prior evidence.
- Paint: build web with API_INTERNAL_ORIGIN=http://127.0.0.1:3281 and NEXT_DIST_DIR=.next-first-paint; `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts`.
- Components/navigation: `npx playwright test -c playwright.qa-workflow.config.ts`; `npx playwright test -c playwright.qa-next.config.ts`.
- Unit checks: `npx vitest run -c vitest.appearance.config.ts`; `npx vitest run tests/branding.test.ts`; `npm run typecheck`.

Request orchestrator re-review of this substantially expanded execution matrix, QA-only harness corrections and unresolved transient evidence. Do not interpret this handoff as final feature acceptance, waived remaining temporal coverage, deployment authorization or a request for deferred between-feature human approval.

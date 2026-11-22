# Independent review round 3 — APPROVED for local automated feature QA

Candidate QA commit: ff1d19fb427c054efd9e48bc546c9ec1398ef835.
Product tree: 37fe632303d44678a685e836fc1987d9da1f252d.

## Verdict

The original feature criteria, with the explicitly approved narrow 503 fallback and authority-gated navigation contracts, now have sufficient bounded automated evidence. Both previous review requests are resolved. Approve this local QA task; this is not deployment authorization, deferred human acceptance, or a claim that finite testing proves every pixel/permutation.

## Independent execution

All commands ran in the assigned worktree against isolated synthetic test services, not the operator application. Existing exact-product production builds were reused.

- FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts precedence.spec.ts -g 'identity never' --repeat-each=2: 4 passed.
- Full first-paint config: 22 passed / 1 preserved superseded-contract failure. Inspected failure: qa-independent.spec.ts expects platform-dark but receives approved built-in dark. Not a new defect or a wholly green suite.
- QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser, playwright.qa-expanded.config.ts, separate fresh services for editor-temporal.spec.ts, learning-temporal.spec.ts, scope.spec.ts: 1 passed each.
- Dynamic executions produced 12 editor cases/163 samples and 12 lesson/receipt cases/350 samples at 1440/820/390. These are two browser tests, not 24 independent tests.
- npx vitest run -c vitest.appearance.config.ts: 14 passed.
- npm run typecheck: server and web passed.
- git diff --check, product equality against 37fe632 for apps/packages, and preservation of candidate-final/final-scope evidence against 6e5386c passed.
- Startup ECONNREFUSED readiness noise remains in real-API logs; tests subsequently started and passed. No product edits by reviewer.

## Requested corrections

R2-1: Reviewed schema-correct overview/jobs fixtures against dashboard consumers. Identity assertions now wait for empty states and the next jobs polling response, retain Sign out/dashboard, reject recovery boundary and console/page errors. Focused independent repetitions and full suite pass. Original malformed fixture failure preserved.

R2-2: Independently parsed raw exact-transition evidence, not just the summary. capture-stress contains 60 transitions/4115 samples and exactly one matching anomaly: viewport 1x1, main x0/y613/width32, capture=settled; both stylesheets remain enabled with 164/804 rules. Capture-free 60 transitions/3000 samples and viewport-capture 60/3761 have no wrong destination frames. Reviewed instrumentation and responsive CSS at overview.module.css:542–595, which hides brand copy and changes main layout below 800px. This supports the bounded capture-induced classification rather than a waiver based on passing retries. Corrected scope captures viewport only, asserts viewport dimensions, retains theme/branding/pending/history/race/identity checks; independent full scope passes.

R2-3: Reviewed dynamic test/helper assertions, real fixture setup, required painted anchors, and source equivalence in round3 report. Independently executed editor title/prompt/section checks and lesson pending/autosave plus receipt pending/details at all three widths. Mobile editor and lesson screenshots visually inspected: consistent navy surfaces and legible controls without horizontal clipping. Intentional active-section/toolbar insertion is not represented as zero geometry change. Pending-gated editor controls are checked when they exist, not invented as visible during authority hold.

## Original acceptance mapping

- Refresh/initial Dark: full first-paint reload/cache/pre-hydration and responsive matrix passes under approved outage policy.
- Navigation consistency: independent real scope/history/retry/races/client/user test passes; anomalous historical capture causally classified.
- Shared components/all views: 38 source page files verified; preserved 38-row route execution matrix maps all families and explicit aliases. Prior exact-product family/workflow evidence retained, not claimed rerun wholesale this round.
- Theme-matched pending: first-paint, scoped gating, dynamic lesson/receipt loading and prior builder gate evidence cover representative pending/recovery states.
- Desktop/tablet/mobile: prior 54 static temporal cases plus new representative dynamic families, independently rerun, provide bounded responsive evidence.
- Functionality preservation: prior exact-product family/workflow/integrated evidence plus present scope, dynamic, policy and type checks support the scoped regression claim.

## Integrity and limits

round3-qa.zip independently verified: 21,122,691 bytes; 921 entries; SHA256 f7f0ff7cbd9dae610602a9360ca22be697a3a6b0b52903c98ae909cd2a553ebd.

Physical devices, WebKit, full manual WCAG, every palette contrast/permutation, real installer provisioning, PostgreSQL concurrency and live integrations are not newly qualified. These are not silently marked passed. No remote push, merge, deployment, production-data change or completed human acceptance is claimed.

Evidence: sibling identity.log, paint.log, scope.log, editor-temporal.log, learning-temporal.log, policy.log, typecheck.log and per-case captures/JSON.

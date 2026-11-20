# First-paint same-feature rework — t_9ea2df68

Status: **PARTIAL IMPLEMENTATION; BLOCKED on generated-appearance outage policy.** No self-approval, overall acceptance, push, deployment or operator-runtime change.

## Baseline and scope

Applied 68a39bf as a7292b0; a540f76 was an equivalent empty cherry-pick and skipped. Applied independent QA a5d9768 as c5cfcf5. QA assertions/report remain unchanged. Work is isolated in wt/t_9ea2df68, not the QA worktree. UX Engine instructions read from the installed Downloads/ux-engine-v2.4.0 package because the documented project-relative folder is absent here.

## FOUC-QA-03: geometry correction

Root cause: the desktop grid grows with the loaded password form; the introduction uses auto margins within that growing grid and footer uses normal flow/auto margins. The theme control sizes to its changing Loading/Dark text. Reproduced all three element rectangle changes in all four conditions before changing application CSS (`geometry-red.log`).

Correction is limited to guest.module.css: reserve a 500px minimum sign-in main footprint above 800px and a 14ch minimum guest theme-label slot. No hidden application, overlay, fixed-height/clipped form, animation, new dependency or authentication changes. Longer interactive states may grow; mobile remains fluid. DESIGN.md records the geometry extension.

New regression captures each visible animation frame in the exact 1280×720 reload matrix, plus a separate deterministic withheld-JavaScript pre-hydration/settled comparison. Every observed introduction/footer/theme-control rectangle must remain identical; no coordinate tolerance. Some intermediate warm runs completed hydration before the first animation sample, so the dedicated gated test guarantees pre-hydration coverage without disabling browser cache in the reload matrix. The final run actually captured pending and settled samples in every matrix row:

| Reload | Samples | Pending samples | Existing geometry |
|---|---:|---:|---|
| Normal / warm | 33 | 3 | Stable |
| Hard / warm | 35 | 9 | Stable |
| Normal / cold | 33 | 11 | Stable |
| Hard / cold / 800ms, 200000 down, 100000 up | 231 | 207 | Stable |

Final rectangles are identical before/after: introduction y300.3125, footer y712, theme summary x1067.53125. Footer remains below the short viewport in both states (previous settled footer was also below the fold); page remains scrollable. Actual pre-hydration and settled screenshots inspected: branding/introduction/title/theme location retained and form inserts into reserved space. This proves bounded existing-element stability, NOT zero CLS across every route, failure, font environment or future content.

## FOUC-QA-02: still failing, decision requested

The unchanged independent negative reproduces `platform-dark` stored preference + branding 503 -> Light, then generated Dark on retry. This remains failing in the final built run. `appearanceScript` excludes generated choices when authoritative palettes are missing. The persisted preference contains only a theme enum, not generated colors, logo or name. A fresh outage document cannot derive the eventual authoritative palette from that enum. Reusing another identity or stale unscoped palette is not an acceptable fix.

Proposal sent to root t_d56e101f (not implemented or approved): when a safely resolved scope has a saved generated Dark preference but authority fails, show the built-in navy Dark fallback with explicit appearance-unavailable/retry feedback; preserve the stored generated selection and restore authoritative branding/palette on retry. This prevents Light but deliberately permits a bounded generated-palette/branding change on successful recovery. Unknown identity/default stays explicitly unresolved; no cross-identity cache and no arbitrary blank-app wait. Root/product must approve this exception or specify an alternative authority/cache contract before implementation. Do not relabel guessed tokens `platform-dark` merely to pass the DOM assertion.

## Executed verification

- `npm ci --ignore-scripts`: installed, audit zero vulnerabilities.
- Geometry RED: all four cases reproduce movement; original outage negative RED.
- Production build: passed (actual Next renderer with synthetic API on 3280/3281).
- Full built first-paint directory: **21 passed, 1 failed** (only the unchanged generated-outage negative). Includes both new geometry tests, seven theme variants, scope/storage/default/reset/navigation tests, unchanged QA reload/keyboard/axe checks and responsive temporal tests.
- Real API guest/account-link journey (isolated PGlite/API/worker/Next on 3110/3111): **1 passed on unchanged rerun**. First run failed a non-retrying image-complete assertion after reload; retained `guest.log`, rerun `guest-retest.log` passes. No root cause resolution of that transient is claimed. Startup ECONNREFUSED readiness messages retained.
- Branding domain: **6 passed**.
- Server/web typecheck passed; diff whitespace check passed. Generated Next next-env/tsconfig edits restored, not application changes.
- Intermediate geometry dev run hit 5s Email readiness timeout under throttling; built runs initially caught missing warm pending samples rather than coordinate changes. All logs retained, not erased.

Commands:
```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build
FIRST_PAINT_BUILT=1 npx playwright test --config=playwright.first-paint.config.ts --output=evidence/rework/browser-final
npx playwright test --config=playwright.guest-ui.config.ts
npx vitest run tests/branding.test.ts
npm run typecheck
node evidence/rework/summarize.cjs
git diff --check
```

Evidence: evidence/rework logs, browser-final screenshots/JSON/traces, original RED matrix and geometry-summary.json. The archive excludes real-auth browser artifacts, credentials, databases and runtime storage. Existing independent evidence under evidence/first-paint is not modified.

## Handoff

FOUC-QA-03 is ready for independent exact-commit retest. FOUC-QA-02 is NOT fixed or waived. This task cannot be completed under current acceptance criteria; approve/reject the bounded policy through the root and unblock this implementation card. Root is currently a downstream dependency of this card, so a human/root coordinator must supply the disposition without waiting for an automatic successful completion. Broader distinct-user/client switching, every authenticated route/dialog, other engines in this run, physical devices, full manual WCAG and rate-limit/deadline edges remain untested. No claim of human review or overall feature acceptance.

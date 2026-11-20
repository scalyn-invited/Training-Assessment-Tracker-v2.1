# Root QA resumed: CHANGES REQUIRED — FOUC-QA-05

## Candidate / isolation
Product candidate 7e4ec7c6480a43ebc1f2eca2a2b74ea005d6b6de integrated into root via a3cbf59. Merge add/add conflict in scope.spec.ts resolved using the approved upstream test; prior RED evidence/history preserved. `git diff 7e4ec7c -- apps packages` is empty after restoring Next-generated next-env/tsconfig. No application implementation edits, push, production data, paid AI or email delivery. Windows Chrome, production `.next-expanded`, isolated in-memory PGlite/real API/worker with new synthetic data per command; TEMP/TMP/TMPDIR under this evidence directory. PostgreSQL/RLS not qualified.

## Independent exact-product results
Production build PASSED. Revised approved authority-gated scope test PASSED independently (scope.log): directions, history, failed-authority retry, stale/racing authority, A/B client and distinct identity preference controls. This is the explicitly approved contract, not unchanged original negative. Prior outage exception remains unchanged; original strict outage test was not rerun this attempt and prior evidence remains preserved.

Executed using `QA_BUILT=1 QA_TEST_DIR=tests/<suite> npx playwright test -c playwright.qa-expanded.config.ts --output=evidence/final-scope/<suite>-results`. Logs named by suite. Scope adds `QA_EVIDENCE_DIR=evidence/final-scope/scope`. Build: `NEXT_DIST_DIR=.next-expanded API_INTERNAL_ORIGIN=http://127.0.0.1:3111 npm run build`.

Passed fresh isolated family suites: overview, clients, platform people, audit, settings (including alias/status), account, client chooser, learning overview, training directory, training record, onboarding, curriculum, document review, delivery. Client administration default administration case and AI settings case passed; running additional files in those same initialized harnesses caused setup conflicts, NOT product failures. Separately rerunning `people.spec.ts` and `appearance.spec.ts` with a new server each PASSED. Mock administration was incorrectly selected in the password-mode combined run and remains NOT TESTED in its required mock harness. Preserve original invalid combined-run failures; no silent green replacement. Per-command exact results are in run-summary.json.

Delivery log records 1 passed despite outer six-suite shell hitting its 600-second timeout after that output; it is not a claim that the outer process exited cleanly. Initial API readiness ECONNREFUSED messages precede test launch and are not the assertion failures.

Generation suite FAILED with `page.goto net::ERR_ABORTED`; not yet classified/retested. No claim of a confirmed generation product defect. Existing builder suite FAILED twice at initial heading line118 (not its earlier baseline dirty-guard line124). It now cannot start authoring.

## FOUC-QA-05 — High — blank assessment authoring after gate
Owner frontend; correction t_ec45899d. Core authoring workflow unavailable under reproducible appearance/data timing.

Precondition: isolated initialized application, authenticated Demo Coordinator 1.2, selected Demo Client 1. Normal unchanged existing suite reproduces on two fresh production runs.
1. Navigate to `/assessments/definitions/new`.
2. For a focused timing reproduction, hold browser `/api/branding/current?*`; assert explicit Opening workspace pending.
3. Release successful real branding authority.
4. Wait for shell and Build an assessment heading.
Expected: authoritative destination and working builder controls appear together, with reliable work guards. Actual: shell is ready, main remains empty, builder host has no markup, heading never appears within 15 seconds. `builder-gate/state.json` records `{url:'/assessments/definitions/new',theme:'light',host:'<div id="assessment-builder"></div>',main:''}`; `errors.json` is empty. The separately named focused regression is `tests/expanded-appearance-browser/builder-gate.spec.ts`; log builder-gate.log. Screenshot builder-gate/settled.png was inspected directly and shows blank content with rendered navigation/client/account shell. It contains synthetic display names only, no credentials.

Source investigation lead (not proven root cause): AssessmentBuilder's effect at lines57–80 exits when host.current is absent. Guest/ApplicationShell gates child DOM; subsequent host mounting may not retrigger effect dependencies. Frontend must confirm lifecycle cause and repair without bypassing authority gating. Original FOUC-QA-04 fixed behavior must remain.

## Acceptance and source inventory update
Original `evidence/expanded/route-inventory.md` remains the 38-route source/state map. This is an execution supplement, not a false claim every route is now qualified.
- Refresh/immediate Dark: prior bounded evidence preserved; scope responsive reload controls rerun and pass. Full first-paint suite at this correction NOT TESTED by root this attempt.
- Navigation consistency: approved scope temporal/race checks PASS; broad no-regression criterion FAILS due blank builder.
- Design-system/component and loading consistency: listed family suites executed with their existing responsive, theme, recovery/dialog/step/axe assertions; no blanket all-view temporal/geometry claim. Distinct-layout new temporal geometry expansion remains NOT TESTED.
- Desktop/tablet/mobile: scope controls and existing listed suites' assertions pass within their bounded coverage, not physical-device qualification or all-state equivalence.
- Existing functionality unaffected: FAILED FOUC-QA-05, generation failure unresolved. Baseline integrated hidden-field and dirty-sign-out issues remain untriaged, not waived.

Pending after correction: independently rerun focused builder plus unchanged builder, full first-paint and workflow/nav regressions; complete remaining guest/setup/recovery, lesson/receipt/progress/review queue/notifications/assessment-directory/assignment/response exact-candidate family suites, mock administration with its correct server; classify generation ERR_ABORTED, legacy integrated hidden-field and dirty-sign-out failures; add remaining source-derived temporal/geometry cases. Existing earlier assignment/response/component passes are not imported as exact-current results. Full manual WCAG, physical devices/live integrations remain disclosed limitations, not new human-review gates.

Root waits on real correction dependency rather than submitting unchanged incomplete coverage for acceptance. No final acceptance, deployment or human review claimed.

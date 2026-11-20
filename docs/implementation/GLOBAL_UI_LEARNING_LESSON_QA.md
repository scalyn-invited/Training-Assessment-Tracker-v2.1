# Learning lesson - 19 November 2026

## Scope and design

`/enrolments/[id]/delivery/[blockId]/[index]` now uses the shared learning shell and visual system, including unavailable lesson URLs. Learning context, lesson content/objective/prerequisites, time and rubric, resources, response and objective questions, evidence, attempt history and the coordinator publication disclosure retain their existing order. Shared headers, panels, fields, buttons and feedback replace the legacy presentation. Scoped styles preserve whitespace, wrap long labels/content, group native radio/checkbox controls and provide coarse-pointer targets. DESIGN.md records the UX Engine form, state, feedback, responsive and visual-character decisions.

The lesson's 800ms autosave, revision tracking, exact draft versions, private response, zero-indexed answers, native immutable-submission confirmation and version-bound idempotency key remain. Successful submission uses the existing confirmed-mutation navigation helper. Draft changes, quiz text/reason/correct-option changes, selected upload files and pending saves/uploads/publication/submission now participate in the shared shell's work guard. Signed-out visits reach login; the shared header provides a fallback for nullable lesson titles. No backend, migrations, approval, permissions, scan-state, immutable-record, budget or N+2 rule changed.

ResponseEvidence has a shared-presentation opt-in used by this lesson. Its assessment response consumer retains the legacy classes and controls pending that feature's migration. Upload double-submit prevention uses a synchronous pending flag; scan restrictions, five-file selection limit, failed-upload file retention, successful reset and refresh instructions remain. Generic legacy panel/prose/feedback styles retain other consumers and were not removed.

## Verification

- Isolated lesson browser journey passed (36.2s / 44.1s overall, including unavailable-index recovery). Command: `npx playwright test --config playwright.lesson-ui.config.ts`.
- Isolated shell regression passed (13.8s / 22.8s overall). Set `OVERVIEW_QA_SUITE=shell`, then run `npx playwright test --config playwright.overview.config.ts`.
- Delivery and assessment-response domain tests: 11 passed (16.03s). Command: `npx vitest run tests/delivery.test.ts tests/assessment-responses.test.ts`.
- TypeScript and separate-output production build passed. Build uses `NEXT_DIST_DIR=.next-clients-build`; generated Next config files are restored after verification.

The browser journey creates an isolated synthetic record, grants separate sensitive authority, confirms onboarding/calendar, generates with the local mock provider and approves/activates the exact plan. The coordinator publishes a real immutable quiz through the UI; a member first sees a future preview, then edits after authorized early start. A coordinator draft mutation is denied. Native required-field focus, cancelled publication, failed publication with retained inputs, dirty shell exits and pending-publication exit refusal are exercised.

Member checks cover lesson loading and outage/retry, empty evidence/attempts, failed autosave retention and submit disabling, cancelled dirty navigation/client switch/sign-out, newer edits during a pending save, pending-save exit refusal, a real competing stale-version write, reload recovery and saved zero-index quiz answers. A real upload retains the selected file after a simulated failure, blocks exit while pending, clears selection on success, and remains quarantined and unavailable for download. An explicitly labeled isolated scanner-result fixture permits attachment; a later rejected scan allows removing that selected file and saving again. This is not live scanner qualification.

Submission checks cancel the confirmation, then intentionally lose a successful server response. Retrying reuses the request key and opens the original immutable receipt, with one attempt and unchanged body. Pending submission disables response editing and blocks sign-out. The attempt link points to that receipt. Cross-client reads are denied; client/global administrators without training authority receive concealed-record responses. Domain tests separately cover immutable snapshots, stale writes, clean-evidence enforcement, role boundaries and duplicate/pending-attempt restrictions.

Light, Dark and client-default precedence; keyboard retry/refresh; axe A/AA checks and page overflow at 320, 390, 800 and 1440px pass. A touch-enabled browser context checks 44px radio-label/upload-button targets, 16px response text and axe. Presentation-only fixtures cover long unbroken titles/content, paused read-only display and the five-file selection limit. These fixtures do not claim actual pause or six-file upload workflows. Coordinator quiz and member response screenshots were visually inspected on desktop/mobile and saved in `screenshots/global-learning-lesson/`.

The initial test expected HTTP 423 for quarantined downloads; the existing API uses 409 and correctly denied access. The expectation was corrected. Build checking caught the nullable lesson title passed to PageHeader; a safe existing-context fallback fixes it. The route matcher also covers malformed lesson indexes so unavailable lesson states use the shared shell rather than falling back to the old one.

## Preservation and limits

Fresh `.runtime/overview-browser` database/private storage and separate Next output isolate browser work from the operator's demo. Live email/AI are disabled; synthetic content uses the local mock provider. Domain tests use their own isolated fixtures. No real scanner, paid provider, full programme completion, fresh PostgreSQL/RLS qualification or human acceptance is claimed.

All 67 originally inventoried files and stashes remain unchanged. V2 is untouched; historical evidence remains. Seventeen additional route rows are checked; seven reference routes retain final qualification work. Remaining routes and full legacy retirement stay open. Nothing pushed/deployed; future authorized PRs target `dev`. Automated checks and agent visual inspection do not establish full parity, global completion or production readiness.

Next bounded feature: submission receipt `/enrolments/[id]/submissions/[submissionId]`, including its review controls.

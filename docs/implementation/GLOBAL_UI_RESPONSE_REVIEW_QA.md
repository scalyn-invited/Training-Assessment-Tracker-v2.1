# Assessment response and review - local QA, 19 November 2026

## Scope and design

The bounded feature is `/assessments/assignments/[id]`, including AssessmentResponse, ResponseQuestions, ResponseEvidence and AssessmentReview. Shared shell, headers, panel/field styles, buttons, feedback and native controls replace legacy presentation. Member answers, section navigation, evidence, submission history, objective score, private review evidence/history, file verification, provisional analysis, human decision, approved result and appeal content retain their existing order and actions.

UX Engine form, state, responsive and shared-system guidance is applied through DESIGN.md. Shared semantic themes preserve personal precedence and client branding. Panel padding is 24px, 16px on mobile; actions wrap, mobile fields use 16px type, coarse-pointer controls have 44px targets. Existing matrix container behavior and native radio semantics remain, with an explicit label override to preserve alignment. Historical content uses its pinned questions/sections. No new Figma layout or workflow is invented.

Existing autosave, exact-operation retry, ambiguous outcomes, version conflicts, section gates, immutable submission and reviewer work guards remain. ResponseEvidence uses its existing shared presentation/guard option. ReasonForm adds dirty/pending protection for analysis and appeal reasons and acknowledges confirmed saves. After an independent appeal decision, the existing destination uses the shared committed-navigation helper so the completed mutation can leave without a spurious pending-work prompt. Signed-out direct visits reach login. The unconsumed `.assessment-workspace` global block was removed after checking application consumers; matrix/section/editor utilities remain.

No backend, migration, permission, evidence scan, approval/release, immutable-record, budget, N+2 or independence rule changed. Native submit behavior is explicit on shared review form buttons.

## Verification

- Real-application browser journey passed (29.7s / 38.9s overall): `npx playwright test --config playwright.response-ui.config.ts`.
- Six existing review workflow checks passed (10.3s): `npx playwright test --config playwright.review-workflow.config.ts`.
- Sixteen response/review domain tests passed across two files (15.08s): `npx vitest run tests/assessment-responses.test.ts tests/assessment-reviews.test.ts`.
- Separate-output production build, standalone TypeScript, formatting and whitespace checks passed. Shell regression passed (13.8s / 23.4s overall), using OVERVIEW_QA_SUITE=shell with playwright.overview.config.ts.

The real-application journey creates synthetic users, a scoped enrolment, explicit sensitive authority, a published mixed-question definition and assignment. It exercises required matrix validation, sequential sections and focus, a real committed autosave with its response deliberately lost, exact payload replay, persisted draft/reload, cancelled submission and actual submission. The member cannot see private reviewer fields. A coordinator returns the attempt using separate member-safe feedback/private rationale; the member sees only the public guidance and no released grade. A second UI submission preserves the first attempt unchanged. UI approval publishes the reviewed score and feedback. A member opens an appeal; existing approved results stay visible. After API routing to a different eligible coordinator, UI uphold returns to the directory and case access ends (404).

Fixtures distinguish quarantined file presentation from actual scanning. Six component workflow cases independently cover private/member-safe feedback separation, historical pinned references, cancelled reload retaining review/file inputs, confirmed evidence becoming clean without discarding an unrelated review draft, and uncertain decisions stopping newer writes. File/extraction fixtures do not claim a live scanner, extraction engine or real file confirmation. The analysis request remains available but no paid/live AI operation is performed. Domain tests cover member-only editing, section/matrix gates, evidence access, immutable submissions, versions, grading, appeal independence and N+2 constraints.

Light, Dark, client-default themes, axe A/AA and overflow checks cover 320/390/800/1440px on the response; desktop/mobile review and themed results are checked. A separate touch context checks 16px response text, 44px save target and accessibility. Navigation cancellation retains private rationale and appeal reason. Native required fields and section-heading focus remain. Global-only and Client Admin users cannot view private submission history. Four desktop/mobile screenshots are retained under `screenshots/global-response-review/` after inspection. Automated accessibility checks are not exhaustive assistive-technology qualification.

Early journey runs corrected fixture-only issues: matrix area/rating identifiers must be UUIDs; the final question remains Question 3 from the full pinned definition rather than restarting at 1. Production validation/reference semantics were preserved.

## Preservation and limits

Browser checks use fresh `.runtime/overview-browser` databases/private storage and separate Next output; domain tests use isolated databases. No operator demo data, V2 private files, live email/scanner or paid AI was used. Historical evidence is preserved. All 67 originally inventoried file hashes and stashes are unchanged; generated Next configuration was restored after verification.

Twenty-five additional route rows are checked. Seven reference routes retain final qualification; guest/setup/recovery routes and global legacy retirement remain open. Automated checks and agent inspection do not establish human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification. Nothing pushed/deployed; future authorized PRs target `dev`.

Next bounded feature: guest sign-in and account-link screens, using Christian's supplied authentication designs while preserving existing authentication flows.

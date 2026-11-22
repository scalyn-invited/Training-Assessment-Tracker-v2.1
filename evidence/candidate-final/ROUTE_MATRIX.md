# Exact-candidate route execution matrix

Product 37fe632. Every source page is mapped; route-specific states/equivalence rationale remain in the original source inventory. Passed here means the named UI scenario executed successfully, not exhaustive temporal coverage of every child state. Shared aliases are explicit.

| # | Route/source | Family | Executed evidence | Status |
|---|---|---|---|---|
| 01 | `/`; `app/page.tsx:1–4` | Redirect only | recovery-ui-browser.log | Passed (bounded scenario) |
| 02 | `/login`; `app/login/page.tsx` | Guest split sign-in / mobile form | guest-ui-browser.log | Passed (bounded scenario) |
| 03 | `/account/link`; `app/account/link/page.tsx` | Guest centered private-link card | guest-ui-browser.log | Passed (bounded scenario) |
| 04 | `/setup`; `app/setup/page.tsx` | Guest legacy initializer steps/review | setup-ui-browser-triaged.log | Passed (bounded scenario) |
| 05 | `/setup/local`; `InstallationWizard mode="local"` | Guest installer stepper, local engine/progress/handoff | setup-ui-browser-triaged.log | Passed (bounded scenario) |
| 06 | `/setup/hosted`; `InstallationWizard mode="hosted"` | Guest installer stepper, owned PostgreSQL/restart | setup-ui-browser-triaged.log | Passed (bounded scenario) |
| 07 | `/platform`; `app/platform/page.tsx` | Platform metric cards/activity/status overview | overview-browser.log | Passed (bounded scenario) |
| 08 | `/platform/clients`; `app/platform/clients/page.tsx` | Responsive searchable directory + management dialogs | clients-ui-browser.log | Passed (bounded scenario) |
| 09 | `/platform/people`; `app/platform/people/page.tsx` | Account directory switches + access forms/dialog | people-ui-browser.log | Passed (bounded scenario) |
| 10 | `/platform/admins`; `app/platform/admins/page.tsx` | Grant directory + appointment/revocation dialog | account-ui-browser.log | Passed (bounded scenario) |
| 11 | `/platform/audit`; `app/platform/audit/page.tsx` | UTC grouped event rows/filter panel/read-only detail | audit-ui-browser.log | Passed (bounded scenario) |
| 12 | `/platform/settings`; `Appearance platform` | Platform appearance editor/gallery/live preview + settings route tabs | settings-ui-browser.log | Passed (bounded scenario) |
| 13 | `/platform/appearance`; `Appearance platform` | Alias of platform appearance editor | settings-ui-browser.log | Passed (bounded scenario) |
| 14 | `/platform/settings/status`; `PlatformSystemStatus` | Read-only connections/status panels + settings route tabs | settings-ui-browser.log | Passed (bounded scenario) |
| 15 | `/accounts`; `app/accounts/page.tsx` | Account issuance/recovery review forms + link directory | account-ui-browser.log | Passed (bounded scenario) |
| 16 | `/account/security`; `app/account/security/page.tsx` | Password/MFA security panels | account-ui-browser.log | Passed (bounded scenario) |
| 17 | `/clients`; `app/clients/page.tsx` | Shared-scope client chooser/button list | client-choice-ui-browser.log | Passed (bounded scenario) |
| 18 | `/dashboard`; `app/dashboard/page.tsx` | Learning welcome/account/journey + plan cards/receipts | learning-overview-ui-browser.log | Passed (bounded scenario) |
| 19 | `/people`; `app/people/page.tsx` | Client-scoped member directory | client-people.log | Passed (bounded scenario) |
| 20 | `/administration`; `app/administration/page.tsx` | Composite teams/assignments/allocations/enrolment/promotion administration | client-administration.log | Passed (bounded scenario) |
| 21 | `/settings/ai`; `app/settings/ai/page.tsx` | Provider registry/task-route forms/uncertain-charge reconciliation | client-ai.log | Passed (bounded scenario) |
| 22 | `/settings/appearance`; `Appearance` without platform prop | Client branding form/gallery/preview | client-appearance.log | Passed (bounded scenario) |
| 23 | `/enrolments`; `app/enrolments/page.tsx` | Training-record search/list with permission-dependent links | training-directory-ui-browser.log | Passed (bounded scenario) |
| 24 | `/enrolments/[id]`; `EnrolmentRecord` | Two-column foundation/private evidence + full-width receipts | training-record-ui-browser.log | Passed (bounded scenario) |
| 25 | `/enrolments/[id]/onboarding`; `OnboardingScreen` | Six input steps + review, schedule/KPI groups | onboarding-ui-browser.log | Passed (bounded scenario) |
| 26 | `/enrolments/[id]/plan`; `Curriculum` | Block/lesson/rubric editor + history/comparison/full review | curriculum-ui-browser.log | Passed (bounded scenario) |
| 27 | `/enrolments/[id]/generation/[runId]`; `GenerationRun` | Polling progress/budget/provenance/attempt list | generation-ui-browser-triaged.log | Passed (bounded scenario) |
| 28 | `/enrolments/[id]/documents/[fileId]`; `DocumentReview` | Scan/extracted read-only text + editable findings/history | document-review-ui-browser.log | Passed (bounded scenario) |
| 29 | `/enrolments/[id]/delivery`; `LearningDelivery` | Lifecycle header/actions + ordered blocks/lessons/resume preview | delivery-ui-browser.log | Passed (bounded scenario) |
| 30 | `/enrolments/[id]/delivery/[blockId]/[index]`; `LearningLesson` | Lesson content/rubric + draft/quiz/evidence/history | lesson-ui-browser-triaged.log | Passed (bounded scenario) |
| 31 | `/enrolments/[id]/submissions/[submissionId]`; `SubmissionReceipt` | Immutable receipt + grading/history/human review/appeals | receipt-ui-browser.log | Passed (bounded scenario) |
| 32 | `/enrolments/[id]/progress`; `LearningProgress` | KPI cards/lineage + observations/future definitions/support | progress-ui-browser.log | Passed (bounded scenario) |
| 33 | `/learning-reviews`; `LearningQueue` | Oldest-first queue + independent case-routing panel | review-queue-ui-browser.log | Passed (bounded scenario) |
| 34 | `/notifications`; `app/notifications/page.tsx` | Preference radio form + paginated notice list | notifications-ui-browser.log | Passed (bounded scenario) |
| 35 | `/assessments`; `app/assessments/page.tsx` | Definition and assignment directories + appeal-routing panel | assessment-directory-ui-browser.log | Passed (bounded scenario) |
| 36 | `/assessments/definitions/[id]`; `AssessmentBuilder` (`new` included) | Imperative four-step authoring editor/sticky header/preview/recovery | builder.log | Passed (bounded scenario) |
| 37 | `/assessments/definitions/[id]/assign`; `AssignmentForm` | Published revision/recipient mode/search/confirmation + team rules | assignment-ui-browser.log | Passed (bounded scenario) |
| 38 | `/assessments/assignments/[id]`; `AssessmentResponse` | Sectioned response/matrix/evidence + results/review/appeals | response-ui-browser.log | Passed (bounded scenario) |

38 source page files / 38 mapped rows verified in code. RecoveryFrame error/404 is additionally exercised by recovery-ui-browser. Mock administration separately passed mock.log. Private dynamic routes use each suite’s real synthetic setup, not the global-admin denial view from the static temporal sweep. Setup installer completion is UI-fixture qualification only, not real database provisioning.

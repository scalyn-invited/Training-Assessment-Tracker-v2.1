# Submission receipt and review - 19 November 2026

## Scope and design

`/enrolments/[id]/submissions/[submissionId]` and its LearningReview controls now use the shared application shell, header, panels, native fields/buttons and feedback. The submitted snapshot, evidence/quiz answers, integrity and rubric, requested changes/approved feedback, grading attempts, human assessment, appeals and withdrawal retain their existing order and actions. Independent reviewers retain their case-only links and closure screen. UX Engine form, state, feedback, responsive and visual-character guidance is applied through DESIGN.md, with the existing rubric fieldsets retained rather than a new workflow or layout.

Shared 24px section/16px internal spacing, semantic themes, wrapping hashes/filenames/prose, native grouped choices and coarse-pointer targets replace the old presentation. All exact-version decision payloads, deterministic quiz comparison, provisional versus official results, insufficient-evidence gates, confirmations, immutable history and role predicates remain. Human-assessment inputs and all reason actions now register dirty/pending state with the shared guard, covering client switch and sign-out as well as links. Discarding unrecorded inputs clears their stale feedback; cancelling discard retains inputs. Signed-out direct visits reach login. Queued grading polling and retained receipt details on refresh failure remain unchanged.

No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed. LearningReview has only this receipt consumer. ReasonAction opts in here and on delivery; its other consumers remain legacy until their own migrations. Removed the single unused `.preserve-lines` global rule after checking application/package consumers; necessary remaining legacy styles are retained.

## Verification

- Isolated receipt browser journey: passed (1.1m / 1.3m overall). Command: `npx playwright test --config playwright.receipt-ui.config.ts`.
- Isolated shell regression: passed (18.1s / 28.7s overall). Set `OVERVIEW_QA_SUITE=shell`, then run `npx playwright test --config playwright.overview.config.ts`.
- Delivery/grading domain and grading-contract suites: 19 passed (37.18s). Command: `npx vitest run tests/learning-grading.test.ts tests/delivery.test.ts tests/learning-grading-contract.test.ts`.
- TypeScript, production build with separate `.next-clients-build` output, formatting and whitespace checks passed. Generated Next config files were restored afterward.

The browser fixture creates a real synthetic team-scoped record, separately grants sensitive authority, confirms onboarding/calendar, generates using the local mock provider and approves/activates the exact plan. It publishes a real quiz before early start and creates two immutable member submissions. The first has no written body and an unanswered question; withdrawal preserves its content hash. The second is deterministically graded, independently approved, appealed by the member, assigned to another team coordinator through the existing API and upheld through the receipt UI. Case-only access closes and subsequent reads are denied. The primary coordinator then records human assessment, including an insufficient-evidence rejection, a real competing decision causing stale-version rejection, discard recovery and a successful supported override. Earlier approved feedback remains visible when changes are requested, and the submitted content hash stays unchanged.

Coverage includes session/client redirects, receipt loading/outage/keyboard retry, empty grading history, native required-field focus, cancelled confirmations, failed withdrawal reason retention, dirty/pending shell exits, queued automatic refresh and disabled human assessment, retained receipt details during a refresh failure, technical-failure guidance, human input retention, cancelled/confirmed discard, pending human-decision edit/exit refusal and post-save reset. Members cannot request grading or see provisional reviewer controls; primary review is withheld while an appeal is open; unassigned client/global administrators cannot read the receipt; cross-client requests are denied. Lesson/review-queue destinations are checked.

Explicit response fixtures cover queued/technical-failure presentation and recovery, long unbroken content and an evidence download link. Those are display checks, not a new file upload, live grading-provider failure or live scanner qualification. Actual quiz grading uses the pinned answer key without a paid provider. Light/Dark and client-default theme precedence, keyboard controls, axe A/AA and overflow at 320/390/800/1440px are covered. A touch-enabled context checks 44px radio/button targets, 16px fields and accessibility. Desktop reviewer and mobile withdrawal, member appeal, human review and closed-case screenshots are saved under `screenshots/global-submission-receipt/` after visual inspection.

Initial test compilation caught a reused fixture variable name, corrected before the journey ran. Repeated role logins hit the existing rate limiter late in the first complete journey; the test now reuses real separately authenticated role sessions instead of logging in repeatedly. No rate limit or authentication rule was relaxed. Visual review found a stale review error persisting after discard and refresh; discarding the associated input now clears that feedback, with a regression assertion.

## Preservation and limits

Browser tests use fresh `.runtime/overview-browser` database/private storage and separate Next output; domain tests use isolated fixtures. No operator demo data, V2 files, live email or paid AI calls are used. All 67 originally inventoried file hashes and stashes are unchanged; historical evidence is preserved. No new PostgreSQL/RLS qualification, live scanner verification, human acceptance, full parity, global completion or production readiness is claimed.

Eighteen additional route rows are checked; seven reference rows still retain final qualification. Remaining routes and full legacy retirement stay open. Nothing pushed/deployed; future authorized PRs target `dev`.

Next bounded feature: progress and evidence `/enrolments/[id]/progress`, including its KPI and support controls.

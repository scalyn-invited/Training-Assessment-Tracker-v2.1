# Learning review queue UI - local QA, 19 November 2026

## Scope and design

The bounded feature is /learning-reviews: LearningQueue, LearningAppealRouting and LearningRoute. It now uses ApplicationShell and the shared header, panels, fields, buttons, feedback and pagination. Existing list order, attempt/status labels, twenty-item pages, case disclosures and actions remain. No table, new workflow or additional private information was introduced. The separate assessment appeal-routing component remains for its own migration.

UX Engine form, state-completeness, responsive and visual-character guidance is applied through DESIGN.md. Shared semantic themes, 24px sections, 16px record spacing, 8px status spacing and wrapping case identifiers replace legacy presentation. Mobile fields retain 16px type; coarse-pointer links/disclosures/controls have 44px minimum targets. Client branding and personal theme precedence remain inherited.

Signed-out direct visits reach login. Queue loads show progress and disable refresh/paging; failed page loads retain the fetched page label and records. Retrying the same next page works. Routing loads independently and retains mounted forms after a refresh failure. Reviewer selection and ReasonAction use shared dirty/pending guards; reviewers cannot change during assignment. The original native confirmation, required reason, server eligibility and case-only grant are preserved. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed. Removed obsolete global file-list rules after checking all application consumers. Unrelated legacy utilities remain. An older workspace test still mentions the removed selector; it is not an application consumer or evidence for this migration.

## Verification

- Isolated browser journey: passed including touch checks (1.0m / 1.2m overall). Command: npx playwright test --config playwright.review-queue-ui.config.ts.
- Grading/domain contracts: 13 tests passed, two files (16.61s). Command: npx vitest run tests/learning-grading.test.ts tests/learning-grading-contract.test.ts.
- Production build passed with separate .next-clients-build output. Standalone TypeScript, formatting and whitespace checks passed. Isolated shell regression passed (13.5s / 26.0s overall), using OVERVIEW_QA_SUITE=shell with playwright.overview.config.ts.

The test reuses the established receipt lifecycle to create actual synthetic submitted work, human-approved grading and a member appeal. Client Admin can see routing identifiers/candidates but cannot read private submissions or scores. The original reviewer is not an eligible alternate. Cancelled and failed assignments retain selection/reason; navigation, client switching and sign-out respect dirty work, and pending assignment prevents exit. Real assignment makes the exact receipt link available in the independent reviewer's queue. Closing the appeal removes temporary receipt authority and leaves that reviewer's queue empty. Global Admin and member roles do not gain review or routing access. An admin with no open appeals sees the routing empty state.

Explicit network fixtures cover a 21-item paging total, long labels, page-two failure with page-one retention, retry/previous behavior, initial queue failure/loading, routing failure with independent queue availability, and no eligible reviewer. They do not claim 21 real submissions or actual eligibility revocation. The real case journey separately checks API payloads and scoped access. Domain suites cover grading/version rules, independent appeal routing and authority lifecycle.

Keyboard refresh, Light/Dark/client-brand presentation, axe A/AA and horizontal overflow are checked at 320/390/800/1440px. Desktop/mobile queue and routing screenshots are inspected and saved under screenshots/global-learning-queue/. Touch checks measure disclosure, reviewer selector and assignment button targets, 16px reason fields and axe accessibility.

## Preservation and limits

Tests use fresh .runtime/overview-browser database/private storage and local mock generation; domain fixtures are separately isolated. No operator demo data, V2 private files, paid AI or live email is used. Generated Next configuration was restored after QA. All 67 originally inventoried file hashes and stashes are unchanged; historical evidence is retained.

Twenty additional route rows are checked. Seven reference rows retain final qualification; remaining routes and global legacy retirement stay open. Automated checks and agent visual inspection do not establish human acceptance, full parity, production readiness or fresh PostgreSQL/RLS qualification. Nothing pushed/deployed; future authorized PRs target dev.

Next bounded feature: notifications and preferences at /notifications.

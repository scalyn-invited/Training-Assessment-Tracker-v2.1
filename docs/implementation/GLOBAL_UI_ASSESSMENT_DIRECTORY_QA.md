# Assessment directory and appeal routing UI - local QA, 19 November 2026

## Scope and design

The bounded feature is /assessments and AppealRouting/RoutingForm. ApplicationShell and shared header, panels, directory tables, fields, actions, feedback and pagination replace legacy presentation. The definition library, assigned-assessment list and routing controls remain in that order. Every column and edit/revise/assign/open destination remains; shared labeled stacked rows apply below 1270px. Keep separate twenty-item pagination and permission-dependent authoring links. Definition builder, assignment form and response/review screens remain separate bounded migrations.

UX Engine design-system, visual-character, responsive, form and state guidance is applied through DESIGN.md. Shared semantic themes, 24px sections, 16px form gaps, wrapping titles/case identifiers, 16px mobile fields and 44px coarse-pointer links/disclosures preserve the reference character. Personal theme precedence and client branding are unchanged.

Signed-out direct visits reach login. Pagination retains the fetched records/page on failure and retries the same requested page correctly. Appeal forms stay mounted during pagination and routing refresh failures. Reviewer selection, reason and pending save participate in the shared work guard. The original required fields, eight-character reason minimum, native confirmation and exact route payload remain. Successful assignment retains the entered reason, marking the submitted selection/reason saved; later edits become dirty again. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed. Existing shared legacy directory helpers retain other consumers and are not removed.

## Verification

- Isolated assessment directory browser journey passed (31.7s / 40.5s overall). Command: npx playwright test --config playwright.assessment-directory-ui.config.ts.
- Definition, assignment and review domain suites: 22 passed, three files (22.20s). Command: npx vitest run tests/assessment-definitions.test.ts tests/assessment-assignments.test.ts tests/assessment-reviews.test.ts.
- Separate-output production build, standalone TypeScript, formatting and whitespace checks passed. Isolated shell regression passed (12.1s / 20.4s overall), using OVERVIEW_QA_SUITE=shell with playwright.overview.config.ts.

The browser journey uses actual synthetic users, a team-scoped enrolment and a separate sensitive grant. It creates/publishes a definition, retains an unpublished draft, assigns the published revision, submits member evidence and records a supported human approval through existing APIs. The coordinator sees both definitions and assignment destinations; the member sees the scoped assignment with no library/build link. Member definition API access and cross-client assignment reads are denied. Existing assignment URLs are opened through the directory.

An actual member appeal yields only eligible independent reviewers. Client Admin sees routing identifiers and candidates without private assignment access. Required-field focus, cancelled confirmation, dirty navigation/client-switch/sign-out, failed assignment retention and pending-save exit refusal are tested. A real UI assignment grants the alternate access to the exact case. A fixture-induced routing refresh failure keeps the submitted form and reason; a subsequent edit survives retry. Returning to the saved values clears dirty state. The independent reviewer opens the case from the directory and upholds it through the API; assignment access ends and the directory returns to empty. Global Admin does not gain private assignments or routing authority.

Explicit response fixtures exercise 21-item totals for both pagers, independent page movement, failed next-page retention/retry, long titles, initial loading/error/keyboard retry, routing failure with the directory visible, no eligible coordinator and long case identifiers. They do not claim 21 real assessments or actual eligibility revocation. Domain suites separately cover immutable definitions, assignment eligibility/version behavior, N+2 and appeal independence/role revocation/access termination.

Light, Dark, client-default branding, axe A/AA and overflow checks cover 320/390/800/1440px. Touch checks measure disclosure and assignment-button targets, 16px reason fields and accessibility. Desktop/mobile directory and routing screenshots are inspected and saved under screenshots/global-assessment-directory/.

## Preservation and limits

Browser tests use fresh .runtime/overview-browser database/private storage and separate Next output; domain fixtures use isolated databases. No paid AI, live email/scanner, operator demo data or V2 private files were used. Generated Next configuration was restored after checks. All 67 originally inventoried file hashes and stashes are unchanged; historical evidence is preserved.

Twenty-two additional route rows are checked. Seven reference rows retain final qualification; remaining routes and global legacy retirement are still open. Automated checks and agent inspection do not establish human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification. Nothing pushed/deployed; future authorized PRs target dev.

Next bounded feature: assessment definition builder /assessments/definitions/[id], including new.

# Assessment assignment form - local QA, 19 November 2026

## Scope and design

The bounded feature is `/assessments/definitions/[id]/assign` and AssignmentForm. It now uses ApplicationShell, shared header, panel/field styles, buttons, badges and feedback. Published revision, recipient mode/search/selection/confirmation, eligibility guidance and team-rule information/actions retain their order and content. Native selects and the required confirmation checkbox remain. This page has no separate assignment or rule-action confirmation dialog; the inventory now describes the existing controls accurately.

UX Engine form, state-completeness, feedback, responsive and shared-system guidance is applied through DESIGN.md. Semantic colors preserve personal theme precedence and client branding. Panels use 24px padding, 16px on mobile; actions wrap, mobile fields use 16px type and touch controls retain 44px targets. No new Figma layout or workflow is invented.

Selected recipients, required confirmation and pending mutations participate in the shared navigation guard. Successful assignment acknowledges the submitted selection while retaining it and clearing confirmation. Later confirmation or a different selection is dirty again. Assignment and team-rule refresh errors keep the mounted form, selections and fetched rules. Successful mutation feedback is separate from refresh failure; retry fetches current options/versions without erasing form values. Initial-load errors retain their existing retry. Signed-out visits reach login. Busy labels identify assignment, stop/resume or processing checks.

Two unused global assignment/correct-choice style lines were removed after consumer searches. Builder choice controls use their own scoped styles; other assessment/editor/response utilities remain. No API, migration, eligibility, approval, permission, scan-state, immutable-record, budget or N+2 rule changed.

## Verification

- Real-application browser journey passed (25.1s / 32.6s overall): `npx playwright test --config playwright.assignment-ui.config.ts`.
- Eleven definition/assignment domain tests passed across two files (10.54s): `npx vitest run tests/assessment-assignments.test.ts tests/assessment-definitions.test.ts`.
- Separate-output production build, standalone TypeScript, formatting and whitespace checks passed. Shell regression passed (14.0s / 21.2s overall), using `OVERVIEW_QA_SUITE=shell` with `playwright.overview.config.ts`. One final browser launch exited during isolated server startup before executing tests; the fresh retry passed without changing application behavior.

The browser journey creates synthetic accounts, an enrolment, an explicit sensitive grant and a published definition through existing APIs. It assigns that definition to a member through the UI, checks the required confirmation, and verifies the resulting assignment. A real team-rule creation preserves the existing assignment ID. A real competing rule update exercises stale-version recovery; UI resume, processing retry and stop/resume retain the original assignment ID and published revision. Domain tests separately cover future eligible records, idempotency, source revision pins, stopped rules, creator authority loss and missing sensitive authority.

Explicit fixtures exercise assignment denial, a held assignment request with pending-navigation refusal, successful assignment followed by a failed options refresh, initial-load failure/keyboard retry and empty recipients/unavailable team/waiting rule results. These fixtures do not claim actual eligibility revocation or scheduler failure. Dirty back-link, client-switch and sign-out cancellation preserve selected recipients. A successful saved selection can leave without another dirty prompt. Member, Client Admin and global-only users cannot load private assignment options; API reads return 403. Signed-out and no-client navigation are checked.

Light, Dark, client-default branding, axe A/AA and overflow checks cover 320/390/800/1440px. A separate touch context checks 16px search text, a 44px assignment button, keyboard checkbox operation and accessibility. Four desktop/mobile screenshots are retained under `screenshots/global-assignment/` after visual inspection. These checks do not establish exhaustive assistive-technology coverage.

## Preservation and limits

Browser tests use fresh `.runtime/overview-browser` databases/private storage and separate Next output. Domain tests use isolated databases. No operator demo data, V2 private files, paid AI, live email or live scanner was used. All 67 originally inventoried file hashes and stashes are unchanged. Historical evidence is preserved; generated Next configuration is restored after verification.

Twenty-four additional route rows are checked. Seven reference rows retain final qualification; remaining routes and global legacy retirement stay open. Automated checks and agent inspection do not establish human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification. Nothing pushed or deployed; future authorized PRs target `dev`.

Next bounded feature: assessment response and review `/assessments/assignments/[id]`.

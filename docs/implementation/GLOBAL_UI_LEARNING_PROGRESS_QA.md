# Progress and evidence - 19 November 2026

## Scope and design

`/enrolments/[id]/progress`, MetricCard, Observation, Definition and LearningSupport now use the shared application shell, header, panels, native fields/buttons and feedback. KPI cards still precede support. Evidence lineage, observation forms, the three future-definition fieldsets, adaptation requests/review and suggestions retain their order, disclosures, information and actions. UX Engine form, responsive, state, feedback and visual-character guidance is applied through DESIGN.md. Existing full field groups are retained rather than inventing a wizard or dashboard.

Shared 24px sections, 16px internal spacing, semantic themes and wrapping identifiers replace the legacy presentation. Teaching paragraphs have 8px separation, while separate lessons/support records keep 16px spacing. Native mobile fields use 16px type and coarse-pointer controls/disclosures use 44px targets. Evidence reference has an explicit label that remains stable after textarea edits.

Observation/definition changes, adaptation block selection, reason inputs and pending mutations register with the shared work guard. A successful adaptation request acknowledges its submitted block selection; a newer selection stays dirty. Queued background preparation remains safe to leave after the request completes. Signed-out visits reach login, initial support errors render once with a separate retry, and refresh failures retain existing content. Existing payloads, confirmations, future effective times, comparability, version IDs, missing-sample semantics, immutable snapshots, human approvals and N+2/freeze/started-block rules remain. No backend, migration, approval, permission, scan-state, immutable-record or budget rule changed. Generic old styles retain other consumers and were not removed.

## Verification

- Isolated progress browser journey: passed (49.0s / 58.2s overall). Command: `npx playwright test --config playwright.progress-ui.config.ts`.
- Isolated shell regression: passed (12.1s / 20.0s overall). Set `OVERVIEW_QA_SUITE=shell`, then run `npx playwright test --config playwright.overview.config.ts`.
- KPI/support domain suites: 12 passed (32.39s). Command: `npx vitest run tests/learning-kpis.test.ts tests/learning-support.test.ts`.
- TypeScript and separate-output production build passed. Build uses `.next-clients-build`; generated Next configuration was restored afterward. Formatting and whitespace checks passed.

The browser fixture creates a real synthetic team-scoped record with separately granted sensitive authority, confirms onboarding/calendar and generates/approves the plan using the local mock provider. Before activation, KPI definitions are absent. One approved human grade produces a one-of-three evidence snapshot with a null value, not zero. Three verified workplace observations produce a mean of 90 with three source IDs. Failed observation and snapshot requests preserve input/evidence; dirty and pending operations block or confirm shell exits. Successful observation resets its fields.

Future definition checks reject an invalid band, create a genuine competing revision, retain stale editor values and reload the latest definition. A successful future band revision becomes version 3 while current definition 1 and its 90-valued snapshot remain intact. Pending revision prevents editing and sign-out. The definition includes the existing baseline field; there is no separate baseline workflow.

Support checks cover independent loading and retry, one error message, changed-block exit protection, refusal without approved source evidence, cancelled requests, pending-request exit refusal, real provisional block 1 -> block 3 generation, retained approval reason during refresh, failed exact-version approval recovery and real human approval. The started first block retains its ID/content; the future third block becomes version 2 with its reading minutes preserved. Real mock support suggestions remain provisional and coordinator-only. Members cannot mutate snapshots or request suggestions, cannot see unapproved adaptations or future-definition controls, and can read the approved adaptation. Out-of-scope client/global administrator and cross-client reads are denied.

Explicit response fixtures cover queued polling, retained support after polling failure, source-review-required/stale/final-support/failed/ambiguous guidance, paused adaptation disabling and long text/source identifiers. They do not claim those transitions actually occurred in the browser journey. Domain tests separately cover N+2 selection, exact approval, source regrade invalidation, resumed schedules, ambiguous reservations, freeze/started targets, final support and revoked authority.

Keyboard retry/refresh, Light/Dark/client-default precedence, axe A/AA and overflow at 320/390/800/1440px pass in the journey. A touch-enabled context checks 44px snapshot/disclosure targets, 16px observation inputs and accessibility. Desktop KPI, mobile future definition, coordinator support and member screenshots are saved under `screenshots/global-learning-progress/` after visual inspection.

The first browser run found that an implicit textarea label lookup changed after editing; an explicit label resolves that. A later held-request test removed its network handler before the handler completed; cleanup now waits for the resulting UI state. Neither correction changes domain rules. Mobile visual inspection added paragraph spacing inside teaching previews.

## Preservation and limits

Fresh `.runtime/overview-browser` database/private storage and separate Next output isolate browser tests from the operator demo; domain fixtures are isolated separately. No paid AI, live email, live scanner, V2 data or private files were used. All 67 originally inventoried file hashes and stashes are unchanged; historical evidence is preserved. Automated checks and agent inspection do not establish human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification.

Nineteen additional route rows are checked; seven reference rows retain final qualification. Remaining routes and full legacy retirement remain open. Nothing pushed/deployed; future authorized PRs target `dev`.

Next bounded feature: learning review queue `/learning-reviews`, including independent appeal routing.

# Assessment definition builder UI - local QA, 19 November 2026

## Scope and design

The bounded feature is `/assessments/definitions/[id]`, including `new`. It now uses ApplicationShell and shared buttons, inputs, panels, feedback and semantic styles. The existing Details, Questions, Rubric and Review steps, authoring order, rich-text tools, section/question controls, matrices, preview and publication actions remain. Assignment and response/review pages are separate migrations.

UX Engine design-system, visual-character, responsive, form and state guidance is applied through DESIGN.md. An imperative presentation adapter applies the same CSS Module classes as the React controls to initial markup and dynamically created elements. The existing builder state, event handlers, API payloads and work guard remain authoritative. Desktop question list/editor columns become a single column below 1000px; the narrow question list retains its bounded scroll region below 640px. Mobile fields use 16px text and coarse-pointer controls retain 44px targets. Header measurement supplies scroll clearance. Personal themes and client branding remain unchanged.

Loading, session/client selection and failure recovery use shared presentation. The previous definition is hidden while a new load is pending or fails. Builder-only global CSS is replaced with scoped styles after checking consumers; prompt image, correct-choice, assessment matrix and response/editor utilities with remaining consumers are retained. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed.

## Verification

- Isolated real-application browser journey passed (32.2s / 40.5s overall): `npx playwright test --config playwright.assessment-builder-ui.config.ts`.
- Ten existing builder workflow checks passed (10.6s): `npx playwright test --config playwright.builder-workflow.config.ts`. This wrapper selects the existing workflow cases and installed Chrome locally; CI retains the default browser.
- Seventeen definition, content and media domain tests passed across three files (9.31s): `npx vitest run tests/assessment-definitions.test.ts tests/assessment-content.test.ts tests/assessment-media.test.ts`.
- Separate-output production build, standalone TypeScript, formatting and whitespace checks passed. Isolated shell regression passed (14.9s / 22.8s overall), using OVERVIEW_QA_SUITE=shell with playwright.overview.config.ts.

The real-application journey uses synthetic users, an isolated team enrolment and an explicit sensitive grant. It authors multiple-choice, self-assessment matrix and open-response questions, sections, rubric guidance/weights and threshold. It verifies question/matrix removal undo, question movement, section order, persisted draft contents, readiness and privacy of learner preview. Cancelled publication retains the draft. Actual publication commits while the HTTP response is deliberately lost; existing exact-definition readback confirms it. Editing that published definition creates a distinct draft with source provenance. The original title and assignment revision/content remain unchanged.

A real competing save exercises stale-version conflict: local text survives, private comparison shows both versions, cancelled discard retains edits and confirmed discard reloads the saved definition. Fixtures exercise validation failure, held-save exit refusal, initial-load failure/keyboard retry and unavailable image processing. The upload uses a synthetic PNG and an explicitly mocked unavailable scan status; it does not claim successful scanning or a usable media asset. Prompt contents and retry remain. Dirty client-switch, sign-out and back-link cancellation are checked; the later leave confirmation discards remaining image metadata edits.

The ten separate workflow cases use synthetic responses to check exact publication readback for published/draft/unavailable/denied outcomes, stale comparison, exact-operation save replay, published handoff, durable copy provenance, preview scope/pinned section references and cancelled link/Back/Forward navigation. These are fixture-based behavior checks, distinct from the real API publication and competing-save journey.

The browser journey denies builder reads to member, client-admin and global-only users; signed-out visits reach login and no-client visits reach client selection. Light, Dark, client-default branding, axe A/AA and overflow checks cover 320/390/800/1440px. A separate touch context checks 16px fields/editor text, 44px save target and preview accessibility. Desktop/mobile authoring and review screenshots are retained under `screenshots/global-assessment-builder/`.

Early QA runs exposed test setup/assertion issues: missing local Chromium was addressed by selecting installed Chrome; fixture initialization and a label locator were corrected; assignment verification now uses the response's existing title/revision/content contract; leaving edited image metadata explicitly accepts the existing guard. No production permission or workflow was weakened to satisfy these checks. Visual inspection corrected mobile panel padding specificity and joined the rich-text toolbar to its editor and restored matrix answer alignment where generic label styling had overridden it. Five final screenshots were visually inspected.

## Preservation and limits

All 67 originally inventoried file hashes and stashes are unchanged. Browser checks use fresh `.runtime/overview-browser` databases/private storage and separate Next output; domain checks use isolated fixtures. No operator demo data, V2 private files, paid AI, live email or live scanner was used. Generated Next configuration was restored after verification. Historical evidence remains intact.

Twenty-three additional route rows are checked after final verification. Seven reference routes retain final qualification; remaining routes and global legacy retirement stay open. Automated checks and agent inspection do not establish human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification. Nothing pushed or deployed; future authorized PRs target `dev`.

Next bounded feature: assessment assignment form `/assessments/definitions/[id]/assign`.

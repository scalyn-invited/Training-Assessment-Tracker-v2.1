# Curriculum editor — 18 November 2026

## Scope and design

`/enrolments/[id]/plan` and its GenerationRequest disclosure now use the shared shell, headers, panels, fields, buttons, badges and feedback. Block navigation, reference disclosures, rubric/lesson inputs, generation notes, history, comparison, full-baseline review and approval receipts retain their information order and actions. Native discard, approval and generation confirmations remain. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed. GenerationRun remains for the next bounded feature.

UX Engine design-system, visual-character, responsive, restyle, state-completeness and form-ux guidance applies through DESIGN.md. Legacy panel/lesson/step/receipt presentation is replaced with semantic colors, shared typography, 14px panels, 24/16px panel padding and 16px groups. Two-column rubric/time/comparison groups stack at 800px; block buttons wrap. Existing labels and native field constraints are retained. Removed 16 obsolete selector occurrences from globals.css/workspace.css after checking consumers: step-nav, lesson, receipts and comparison families. Mixed rules keep their remaining selectors; review-section, file-list, preserve-lines and other editor styling remain.

The page's bespoke click/unload listener is replaced by the shared work guard. Dirty block inputs, approval rationale and generation notes now participate in client-switch/sign-out checks. Pending generation requests report their state to the parent, preventing shell exit or block/version changes while queuing. Existing block/version discard behavior remains. Signed-out direct visits reach login instead of remaining pending. No new layout or business workflow is introduced.

## Verification

- Curriculum browser suite: final pass, 22.2s / 29.6s overall. Command: `npx playwright test --config playwright.curriculum-ui.config.ts`.
- Shell regression: pass, 10.6s / 17.9s overall. Set `OVERVIEW_QA_SUITE=shell`, then run `npx playwright test --config playwright.overview.config.ts` for isolated storage and build output.
- Learning-plan/onboarding domain tests: 14 passed, 19.43s. Command: `npx vitest run tests/learning-plans.test.ts tests/onboarding.test.ts`.
- Generation domain/contract tests: 28 passed, 14.49s. Command: `npx vitest run tests/programme-generation.test.ts tests/programme-generation-contract.test.ts`.
- TypeScript, separate-output production build and whitespace checks pass. Build uses `NEXT_DIST_DIR=.next-clients-build`; generated Next config files are restored afterward.

The browser journey creates isolated synthetic accounts, a separately authorized coordinator, onboarding/calendar inputs and a four-block curriculum. It fills and saves all four blocks, rejects incomplete baseline review, validates and approves exact version five, checks its content hash, creates version six and verifies the original approval hash remains unchanged. It covers read-only historical/member access, global/unallocated-client-admin denial, cross-client API denial, signed-out and missing-client redirects, initial loading/retry, injected stale-save retention, cancelled block/client/sign-out/approval actions and pending-queue exit refusal.

Generation checks cover empty requests, retained notes, cancelled confirmation, failed submission and same-key retry, keyboard refresh, list failure/recovery, and queued/ambiguous display fixtures disabling another request. Fixture links retain the existing progress destination. Light, Dark and client-default themes, axe A/AA and horizontal overflow checks pass at 320, 390, 800 and 1440px. Desktop editor and mobile comparison/approval screenshots were visually inspected and saved under `screenshots/global-curriculum/`.

The expanded test initially expected a list error while a previous queue error still had display precedence; it now reloads between these independent failure scenarios. No application behavior changed for that test correction. An initial shell command selected the generic harness and stopped before tests because the operator Next server already held `.next`; the final regression used the isolated Overview harness. The operator server was not stopped. Browser test databases/storage are ephemeral; the final harness uses fresh `.runtime/overview-browser` storage with email/AI disabled.

## Limits and preservation

Queued/ambiguous generation rows and HTTP failures are explicit browser fixtures, not actual provider or charge evidence. Real generation contracts are covered separately by domain tests using synthetic providers. No live email or paid AI call occurred. Native browser dialog chrome is retained. Automated axe/keyboard checks and agent visual inspection do not establish human accessibility or design acceptance. PostgreSQL/RLS qualification, full parity, global completion and production readiness are not claimed.

All 67 originally inventoried untracked file hashes and stashes are preserved. Historical evidence remains intact; V2 is untouched. Nothing pushed or deployed. Next bounded feature: generation progress `/enrolments/[id]/generation/[runId]`.

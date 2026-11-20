# Learning delivery - 19 November 2026

## Scope and design

`/enrolments/[id]/delivery`, its lifecycle controls and its reason actions now use the shared application shell, header, badge, panels, fields, buttons and feedback. Member/title/timezone/status, curriculum/progress links, activation/lifecycle panel, ordered lesson blocks and submissions retain their information order and destinations. Native decision confirmations, reason constraints, API payloads, exact versions, pinned approval, calendar capacity and completion rules remain. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed. Lesson editing, submission receipts and progress remain separate bounded migrations.

UX Engine visual-character, responsive, form-ux, state-completeness and feedback-and-affordance guidance applies through DESIGN.md. Before: legacy page-heading, badge, panel, file-list and reason/lifecycle controls. After: shared sans-serif hierarchy and semantic themes, 14px panels, 24px section/16px internal spacing and 8px list spacing. Lesson metadata stays below its link; long content wraps. Resume previews retain nested articles and exact replacement dates. Coarse-pointer lesson targets meet the stylesheet's 44px rule. Generic global list/panel styles remain because other routes still consume them.

ReasonAction has an explicit shared opt-in used only by this feature; existing consumers retain native fields/buttons/feedback and the old guard. Shared reason forms use the established work registry for dirty reasons and pending mutations. Lifecycle preview reasons/changed weeks and pending resume operations register there too. Saved preview weeks cease to count as a new change; inactive preview forms do not guard hidden inputs. Existing confirmation behavior remains. Signed-out delivery visits reach login; loading feedback distinguishes the session, learning plan and lifecycle. The hook now exposes session reload separately so session failures can recover without a client ID.

## Verification

- Delivery browser journey: passed, 27.9s / 36.6s overall. Command: `npx playwright test --config playwright.delivery-ui.config.ts`.
- Isolated shell regression: passed, 12.7s / 20.4s overall. Set `OVERVIEW_QA_SUITE=shell`, then run `npx playwright test --config playwright.overview.config.ts`.
- Delivery/lifecycle domain tests: 11 passed, 19.55s. Command: `npx vitest run tests/delivery.test.ts tests/learning-lifecycle.test.ts`.
- TypeScript, separate-output production build, formatting and whitespace checks pass. Build uses `NEXT_DIST_DIR=.next-clients-build`; generated Next config files are restored afterward.

The browser fixture creates a real synthetic record, separately grants sensitive authority, confirms onboarding/calendar inputs, generates four blocks with the local mock provider and approves that exact plan version. UI actions activate the approved plan, lock an early-start block, pause, preview a two-week shift and resume. The started block keeps its ID/content; unstarted blocks receive new versions/dates. Preview alone leaves delivery dates unchanged. Attempted completion without required evidence is rejected and retains its reason. This does not claim successful completion of the programme.

Checks cover empty/unapproved delivery, no submissions, initial session/data/lifecycle recovery, failed activation/preview input retention, cancelled decision and dirty shell actions, pending activation/resume exit refusal, changed-week guarding, stale-preview disabling, new-reason disabling of old previews, exact curriculum/progress/lesson links, keyboard activation, member-only visibility, denied member lifecycle mutation, concealed administrator reads and cross-client denial. Explicit fixtures cover completed/withdrawn presentation, Today marker, a submission link and long titles; these are display checks rather than actual completion/withdrawal/submission evidence. Light/Dark, client-default precedence, axe A/AA and overflow at 320, 390, 800 and 1440px pass.

Active desktop, coordinator resume mobile and member mobile screenshots were visually inspected and saved under `screenshots/global-learning-delivery/`. The first browser attempt used a text locator matching both a disclosure and its hidden button; it now targets the summary. Initial type checking caught a missing session-loader alias, corrected before final verification. The existing full delivery-flow helper now selects lesson links by their route rather than the retired file-list class; that full downstream workflow suite was not rerun for this bounded UI change.

## Limits and preservation

Tests use fresh `.runtime/overview-browser` database/private storage and `.next-overview` output. Live email and AI are disabled; the mock provider generates synthetic material only. Domain tests cover lifecycle restrictions separately. Other ReasonAction consumers remain in their legacy presentation and require their own migration/verification. No PDF/scanner, full lesson/submission flow or PostgreSQL/RLS qualification is claimed here.

All 67 originally inventoried untracked file hashes and stashes are unchanged. Historical evidence is preserved; V2 remains untouched. Automated results and agent visual inspection do not establish human acceptance, full parity, global completion or production readiness. Nothing pushed/deployed; future authorized PRs target `dev`.

Next bounded feature: lesson page `/enrolments/[id]/delivery/[blockId]/[index]`.

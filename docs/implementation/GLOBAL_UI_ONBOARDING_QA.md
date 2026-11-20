# Onboarding — 18 November 2026

## Scope and design

`/enrolments/[id]/onboarding`, OnboardingFiles and PlanCreate now use the shared shell, headers, badges, fields, buttons, panels and feedback. Six input steps and review/create retain their order, labels, field constraints, autosave handlers, exact-version requests, role predicates and confirmation actions. Schedule and KPI groups retain their existing two-column layout, stacking at 800px. Review disclosures, native file chooser, quarantine messages and curriculum links remain. No backend, migrations, approval, permission, scan-state, immutable-record, budget or N+2 rule changed.

UX Engine design-system, visual-character, responsive, state-completeness, restyle and form-ux guidance applies through DESIGN.md. Before: legacy page-heading, badge, step-nav, panel, lesson, review-section and native field presentation. After: shared sans-serif hierarchy, semantic theme colors, 14px panels with 24/16px padding, 16px group spacing, wrapping step controls and explicit current-step styling. Existing three KPI groups remain together under the user's instruction to retain information and layouts. File controls reuse the prior record styling. Legacy generic styles remain because curriculum, account and other unmigrated consumers still use them.

The page's old click/unload guard did not register dirty work with the shell's client-switch/sign-out checks. It now uses the existing registerWorkGuard with unsaved input generations, calendar/curriculum reasons and pending saves. PlanCreate reports its dirty state to the parent and no longer adds a duplicate unload handler. Existing assessment/calendar confirmation and curriculum-reason step-discard dialogs remain. Pending saves use the shared guard's blocking message; dirty exits use its existing discard confirmation. Signed-out direct visits now reach login rather than remaining pending. No new layout or business workflow is introduced.

## Verification

Eighteen existing onboarding, learning-plan and calendar tests pass (26.79s), covering encrypted immutable drafts, exact revisions, independent confirmation, active-record restrictions, complete input requirements, shared capacity, budgets and preserved plan history. Initial complete UI verification passed (45.3s / 53.3s overall); final expanded UI and regression results are recorded in FEATURE_CHECKLIST.md.

The final expanded browser suite passes (48.1s / 55.5s overall). The isolated journey covers real setup/roles, member-owned and coordinator-only fields, separately granted sensitive access, autosave, newer edits during an in-flight save, stale-tab retention, confirmation cancellation/reconfirmation after edits, shared calendar confirmation, quarantined TXT upload and real version-one curriculum creation. It verifies blocked shell mutations when draft exits are cancelled and sign-out refusal while a save is pending. Injected initial-load/upload/save/create failures preserve recovery or input. Active-record display fixtures disable fields/actions; long names wrap; coarse-pointer weekday targets meet 44px. Light/Dark, client-default reset, keyboard step-heading focus, axe A/AA and overflow at 320, 390, 800 and 1440px pass.

Profile/review desktop and schedule/KPI mobile screenshots were visually inspected; seven synthetic captures are saved under `screenshots/global-onboarding/`. Reproduce with `npx playwright test --config playwright.onboarding-ui.config.ts`. Domain command: `npx vitest run tests/onboarding.test.ts tests/learning-plans.test.ts tests/learning-calendar.test.ts`.

The first browser attempt opened the theme menu before the coordinator page finished loading; the test now waits for the editable field and shared shell. This required no theme behavior change. Browser fixtures use fresh `.runtime/overview-browser` database/storage and `.next-overview`, with email/AI disabled. The production build uses `.next-clients-build`; generated Next files are restored afterward. No operator database, live provider or V2 file is used.

## Limits

UI fixtures for long names and active/read-only state are display tests, not fabricated database activation or authorization evidence. Domain tests cover actual active-record restrictions. Browser uploads remain quarantined with no scanner configured. Existing native browser confirmations are retained; their platform chrome is not custom restyled. No offline capability is introduced. Historical evidence remains intact. Automated checks do not establish human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification.

Next bounded feature: curriculum editor `/enrolments/[id]/plan`. Nothing pushed or deployed.

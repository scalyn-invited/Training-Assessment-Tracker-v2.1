# Learning workspace Overview — 18 November 2026

## Scope and design

`/dashboard` now uses ApplicationShell, PageHeader, Panel, Badge, Button and Pagination, with scoped Overview styles. The welcome, baseline message, account/journey pair, plan cards, record link and background receipts retain their existing order and information. Plan title/team/member/status/duration, twelve-item paging and destinations remain. No API, workflow, permission, budget, approval, scan, immutable-record or N+2 logic changed. Global Admin learning visibility remains server-scoped.

The existing DESIGN.md contract and local UX Engine design-system, visual-character, responsive, state-completeness and restyle guidance govern the migration. Before: legacy hero/panel/card selectors and old workspace typography. After: shared semantic palettes, reference sans-serif hierarchy, 14px panels, compact badges and 24/16px desktop/mobile spacing. The existing two-column summaries/cards become one column at 800px. The already-hidden decorative orbit is removed; no new layout or action is introduced.

BackgroundReceipts also serves `EnrolmentRecord`, which is not migrated yet. Its new `shared` presentation is opt-in for Overview. The old consumer retains its markup/classes, verified by opening a real plan. Polling remains five seconds; local receipt copy, status/error messages and retry are unchanged. Removed 71 obsolete dashboard selectors after searching application/package/script/test consumers, using PostCSS selector parsing to preserve shared selectors in mixed rules. Setup's journey styles and training-record receipt styles remain.

## Verification

Thirteen existing tests across `workspace-overview.test.ts`, `enrolments.test.ts` and `foundation-checks.test.ts` pass (14.46s). The focused browser suite first passed 26.6s / 34.3s overall, then passed 29.3 / 37.9 after the explicit page-two recovery assertion and obsolete CSS retirement. It covers:

- Guest and no-client redirects; Global Admin's empty learning scope; real thirteen-plan creation and member/coordinator/client-admin projections; role-specific navigation and denied cross-client reads.
- Plan loading, empty list, error/retry, twelve-item paging, empty later-page recovery, exact record destination, keyboard activation and the `#learning-plans` fragment.
- Independent receipt/list errors, successful retry, empty receipts and injected queued/complete/cancelled/failed receipt states with both existing explanatory errors; repeated polling is observed. Receipt state fixtures do not claim live delivery.
- Dark and generated client Light, personal preference precedence and client-default reset; long unbroken plan/team names and wrapped member names; desktop/mobile axe A/AA and overflow at 320, 390, 800 and 1440px.
- Mobile menu role filtering, focus containment, Escape and trigger focus return. The unmigrated plan-detail page retains its existing receipt presentation.

The existing shell suite uses semantic plan-link/heading locators now that the old `.plan-card` presentation class is retired. Its assertions and fixture behavior remain. Final shell, TypeScript and build results are recorded in FEATURE_CHECKLIST.md. Production build uses `.next-clients-build`; browser QA uses fresh `.runtime/overview-browser` database/storage and `.next-overview`, with live AI/email disabled. Generated Next configuration changes are restored.

Screenshots in `screenshots/global-learning-overview/` include desktop, mobile, branded mobile and receipt states. Desktop/mobile and receipt states were visually inspected. All are synthetic fixtures. No credentials or private links are included. Historical evidence, user files and stashes remain preserved.

## Reproduction and limits

`npx playwright test --config playwright.learning-overview-ui.config.ts`; shell regression uses `OVERVIEW_QA_SUITE=shell` with `playwright.overview.config.ts`. Domain command: `npx vitest run tests/workspace-overview.test.ts tests/enrolments.test.ts tests/foundation-checks.test.ts`.

Nine additional route rows are checked. Remaining learning/training-record, assessment and guest/setup/recovery routes, reference-route final qualification and full legacy retirement are open. No push/deployment, V2 change, live mail/provider call, human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification is claimed. Next bounded feature: training-record directory `/enrolments`.

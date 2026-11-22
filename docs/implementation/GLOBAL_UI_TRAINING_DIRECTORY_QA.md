# Training-record directory — 18 November 2026

## Scope and design

`/enrolments` now uses ApplicationShell, PageHeader, Input, Button, Panel, Feedback and Pagination. Existing single-column search/list order, record title/member/status, twenty-item paging, destinations and `canDetails` projection remain. UX Engine design-system, visual-character, responsive, state-completeness, restyle and form-ux guidance and DESIGN.md govern this bounded migration. Shared semantic palettes, typography, 14px panels, 24/16px panel padding and wrapping controls replace the legacy presentation. Record links have visible focus and 44px coarse-pointer targets. No new table, filter, workflow or dialog is introduced.

Corrected the inventory's reference to a status filter: the existing directory has search only. Fixed an unchanged search clearing results without triggering a request, which left loading stuck; every submission now triggers the existing request. Signed-out direct visits now reach the existing login route instead of remaining pending. Learning plans retains its existing destination and correctly marks the training-record URL family active in the shared navigation. No API, migration, permission, approval, scan-state, immutable-record, budget or N+2 logic changed. Nested record routes remain on legacy presentation pending their own migration. Generic legacy styles still have other consumers and remain.

## Verification

Eight existing tests in `enrolments.test.ts` and `workspace-overview.test.ts` pass (23.72s). The focused browser suite passed initially (49.6s / 1.1m overall), then passed after the navigation correction and active-link assertion (41.7s / 55.8s overall). Coverage includes:

- Guest/no-client redirects, Global Admin's empty learning scope, twenty-one real records, and Member, Client Admin and summary-only Coordinator projections. Cross-client reads remain denied.
- Initial loading, unchanged empty and nonempty repeat searches, twenty-item pagination, page reset on search, no matches, retained query after an injected failure and successful retry.
- Exact record/onboarding/delivery links, keyboard activation of a real record, Back navigation and summary-only private-input explanations with no onboarding links.
- Light/Dark, generated client branding, personal theme precedence and client-default reset; axe A/AA and overflow at 320, 390, 800 and 1440px; search-to-submit keyboard order and coarse-pointer record-link targets.
- Long title/member wrapping and mixed detail permission rendering using explicitly injected display fixtures. Real API role checks are exercised separately; fixture states do not establish additional authorization.

Final shell regression, TypeScript and separate-output production build results are recorded in FEATURE_CHECKLIST.md. Browser QA uses fresh `.runtime/overview-browser` database/storage and `.next-overview`; the production build uses `.next-clients-build`. Live email/AI remain disabled. Generated Next configuration changes are restored after verification.

Desktop and mobile screenshots were visually inspected and saved in `screenshots/global-training-directory/`, alongside a summary-only mobile capture. All data is synthetic. Historical evidence is retained; original untracked file hashes and stashes are checked separately before committing.

## Reproduction and limits

`npx playwright test --config playwright.training-directory-ui.config.ts`; shell regression uses `OVERVIEW_QA_SUITE=shell` with `playwright.overview.config.ts`. Domain command: `npx vitest run tests/enrolments.test.ts tests/workspace-overview.test.ts`.

Ten additional route rows are checked. Remaining training-record, learning, assessment, guest/setup/recovery routes, reference-route final qualification and legacy retirement remain open. No push/deployment, V2 change, live mail/provider call, human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification is claimed. Next bounded feature: training-record detail `/enrolments/[id]`.

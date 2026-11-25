# Review Queue Figma UI — 25 November 2026

## Scope and source

Local branch `ui/review-queue-figma`, based on freshly fetched `origin/dev` at `e1035b44ce8448b4ecae1e721718d7c00dc2dea8`. Implementation is isolated in `D:/TAT/.runtime/review-queue-figma`. The original checkout, saved workspace and running localhost:3100 remain on `ui/global-design-system`; this feature has not replaced that running app.

Read-only Figma reference: file `eQejFiVgug5zmBTd9aVGHx`, desktop `7054:11807`, mobile `7054:14089`. Both design contexts and screenshots were inspected. Existing shared shell/navigation/account/client-selection controls remain; this is a queue-content change, not a shell redesign. The sample's static identities and Example data label are not shipped as application data.

Before: shared header, plain review-link list and attempt/status text. After: client-aware Review Queue header, guidance callout, desktop five-column table, mobile cards, status pills and explicit Open actions. Same records, receipt URLs, refresh request, oldest-first ordering and twenty-item paging contract. Existing totals/page labels and Back to workspace are retained. The separate appeal-routing panel, reason/confirmation controls, dirty/pending guards and all permission rules are unchanged. Backend, migrations and role definitions are untouched.

UX Engine visual-character, responsive, state-completeness and review guidance were applied with DESIGN.md. Reused PageHeader, Panel, Button, Badge, DirectoryTable, Pagination and semantic tokens. Seven source SVG assets are stored under `apps/web/public/images/review-queue/`, used as theme-colored masks at original dimensions: information 20px; desktop arrow 16px; mobile arrow 18px; four status dots 6px. Inspected nonempty SVG root dimensions, callsites/CSS slots, browser loading and screenshots; automated arrow geometry assertions also pass.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed, including Next production compilation, TypeScript and route generation.
- `npx vitest run tests/learning-grading.test.ts tests/learning-grading-contract.test.ts`: 13 passed across two files, 13.37 seconds.
- `npx playwright test --config playwright.review-queue-ui.config.ts`: passed, one integrated scenario, 1.1 minutes test / 1.3 minutes overall.

The browser scenario uses fresh isolated PGlite/private storage and synthetic identities. Real API flows cover submitted work, grading, member appeal, independent reviewer assignment, resolution and loss of temporary access. Client Admin routing does not grant private receipt access; Global Admin, member and unassigned coordinator do not gain review authority. Existing reasons, confirmation cancellation, failed assignment retention, dirty navigation and pending-action guards are exercised.

Queue checks cover session/client boundaries, empty data, initial loading/error/retry, independent routing failure, page-two failure retaining page one, retry and backward pagination. Theme checks cover Light, Dark and client branding/personal precedence. Axe WCAG A/AA, horizontal overflow, keyboard refresh/focus and 44px touch controls are checked. Four-status presentation fixtures cover 1440, 1100, 801, 800, 390 and 320px, with one semantic table/card representation and named Open links. Status text accompanies color. Fixtures are explicitly synthetic; they do not establish four real pending submissions or completed-regrade behavior.

First browser run stopped at a pre-existing Personal settings theme selector expecting a `summary`; current dev uses a button. Updated both affected selectors to the named Theme button and reran the entire suite successfully. The first build attempt did not execute because approval review hit a usage limit; the resumed build completed successfully. Generated Next configuration changes were removed after verification.

## Visual evidence and UX review

- [Desktop, four-status fixture](screenshots/review-queue-figma/desktop.png)
- [Mobile, four-status fixture](screenshots/review-queue-figma/mobile.png)
- [Desktop, real assigned appeal with client theme](screenshots/review-queue-figma/assigned-appeal-desktop.png)
- [Mobile, real assigned appeal with client theme](screenshots/review-queue-figma/assigned-appeal-mobile.png)

Agent visual inspection confirms column/card layout, wrapping, badge labels, arrows, callout and action hierarchy. Shared shell differences from the supplied frames are retained intentionally, including active client selection, menu and account controls. Pagination remains on mobile although the example frame omits it. Shared accessible palette values take precedence over static Figma colors.

UX review: no blocking issue found in this bounded diff. Loading/error/empty/partial states remain available; fetching another page preserves mounted records and page information. Refresh disables while pending. Links carry member/plan context, keyboard focus is visible, and mobile Open targets are at least 44px. Existing appeal form behavior is unchanged. No new workflow or missing-data metric is invented.

## Limits and preservation

Completed regrades, dashboard metrics and member-safe resolved-assessment-appeal explanations remain pending the separately sent clarifications. The existing assigned-appeal queue can show an approved submission that has an open appeal; this is existing behavior, not implementation of completed regrades.

Root tracked files/stashes were not changed. No V2 files, operator credentials or saved databases were copied into the feature checkout. No push, PR, merge, deployment, live email or paid AI call. No fresh PostgreSQL/RLS qualification, human acceptance, full parity or production-readiness claim. Historical global UI evidence is preserved.

# Client administration UI — 18 November 2026

## People directory checkpoint

`/people` now uses the shared application shell, PageHeader, Panel, DirectoryTable with labeled stacked cells, Pagination and Feedback. The original data projection, actions and page query remain. The shared shell now retains the legacy client-required loading boundary before showing client-scoped pages. The API requires client administration access; the earlier inventory's general-member description was inaccurate, and no permission change is made.

Isolated browser test `playwright.client-admin-ui.config.ts people.spec.ts` passes (19.4s / 27.1s overall). Covers guest/client redirects, delayed loading, real rows, errors/retry, empty and injected pagination fixtures, Global/Client Admin access and Coordinator/Member denial, desktop/mobile axe A/AA and overflow at 320–1440px. Real client-brand save and persisted personal Dark override/reset to generated Client Dark pass. Desktop/mobile screenshots inspected. Seventeen tenancy/branding domain tests pass (9.66s); TypeScript passes. Historical evidence and user files are preserved.

## Administration migration

`/administration`, `Allocations`, `EnrolmentForm`, `PromotionPerson` and `PromotionLedger` now use the shared controls and native dialogs. Consumer search confirmed those child components are only used by administration. Existing handlers, payloads, permissions, order, version/reason fields and review/confirmation stages remain. Buttons retain explicit native types. The original client-required shell gate now also applies to migrated client pages.

The local UX Engine design-system, visual-character, responsive, state-completeness, restyle and form-ux guidance informed the work. `DESIGN.md` records the existing layout and visual contract. No invented layout or workflow is included. Global legacy CSS is still needed by unmigrated consumers and was not removed.

The administration browser journey passes real team creation, assignment/grant/revoke, cancellation of membership end, enrolment review/back-to-edit with retained fields, injected creation failure and successful retry, and the existing complete promotion helper (preparation/review, retained idempotency key, failed dispatch with no configured adapter, explicit historical-export fixture). An independent Client Admin exercises allocation creation, separate sensitive grant/revocation and allocation end. Client Admin cannot grant Client Admin roles; Coordinator and Member receive the existing page/API denial. It also checks directory outage/retry, no search results, keyboard focus containment, light/dark axe A/AA and overflow at 320–1440px.

Separate real stale-version browser test passes (4.4s / 11.9s overall): concurrent permission-version change preserves reason, disables the stale action, requires explicit refresh and allows the reviewed action afterward. Mock sign-in/local-person browser test passes (5.7s / 12.6s initial run): synthetic email restrictions retain fields on failure, Coordinator and synthetic identity choices persist correctly, successful creation resets the form, and the mobile form remains accessible. Final results after the layout correction are recorded in the feature checklist.

Domain verification: 23 tests across administration-version, enrolments, promotions and tenancy pass (15.39s), supplementing the earlier 17 tenancy/branding tests (the tenancy tests overlap). TypeScript and separate-output production build pass. No database or backend source changed.

## Corrections and evidence handling

Final isolated browser runs after the shared form correction pass: administration 25.0s / 32.3s overall, People 15.4 / 22.4, account UI 22.7 / 29.7, shell 11.3 / 18.7, and mock local-person 5.7 / 12.6. The separate stale-version run above also passes. Final TypeScript check passes after restoring generated Next configuration; the separate-output production build passes. All 67 originally inventoried untracked file hashes and the stash inventory are unchanged.

The first presentation pass revealed that generic form layout could override a form's `hidden` attribute. Excluded hidden forms and asserted that enrolment editing fields stay hidden during review. Visual inspection then found a specificity conflict that stacked the desktop search row; used `:where(:not([hidden]))` and added an explicit horizontal-alignment assertion. A new test helper import initially lacked the required `.js` extension; TypeScript now passes after correction. The installed TypeScript package no longer exposed the assumed AST API, so the one-off local presentation-edit helper used the installed Prettier TypeScript parser instead; no dependency was installed or changed.

Screenshots under `screenshots/global-client-admin/` include client People and administration desktop/mobile, assignment dialog, mock local-person form and promotion ledger. All are isolated fixtures. Browser runtimes use `scripts/overview-browser-start.ts` with fresh database/storage, external email/AI disabled and `.next-overview`; production build uses `.next-clients-build`. Known generated Next config changes are restored. Original user files/stashes and historical evidence remain preserved.

Reproduce with `playwright.client-admin-ui.config.ts`: `CLIENT_ADMIN_QA_SUITE=people` (default), `administration`, `versions`, or `mock`. For `mock`, additionally set `CLIENTS_QA_SUITE=accounts-mock` to use the isolated simulated-auth fixture. Run each suite in a separate invocation so its synthetic installation starts fresh. Existing account and shell regressions qualify shared CSS/context boundaries.

No push/deployment, global completion, human acceptance, full parity, live service readiness or fresh PostgreSQL/RLS qualification is claimed. AI settings, client Appearance, learning, assessments, guest/setup/recovery and final legacy presentation retirement remain open.

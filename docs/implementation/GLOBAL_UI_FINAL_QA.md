# Global UI final reconciliation — 19 November 2026

## Local completion boundary

The existing-route UI migration and shared-foundation checklist are locally complete. This means the 38 inventoried page routes and two shared recovery screens use the shared visual system, the old authenticated shell has no fallback path, and identified obsolete presentation code has been removed after consumer checks. It does not mean full V2.1 functional parity, human acceptance or production readiness. Prior bounded route evidence remains recorded in [GLOBAL_UI_ROUTE_INVENTORY.md](GLOBAL_UI_ROUTE_INVENTORY.md).

Baseline for this checkpoint: local `ui/global-design-system` commit `8ce90a6`. Read the feature checklist, DESIGN.md, UX Engine design-system/state-completeness guidance and installed Next.js CSS guidance.

## Final change and fixes

Clients management was the last raw native dialog outside the shared primitive. It now uses shared Dialog, Button and Input plus token-based scoped layout. Existing labels, information order, create/rename/suspend/reactivate actions, native constraints, reasons, displayed versions, read-only confirmation fields, pending-close guard and retained stale drafts remain. Submit buttons explicitly retain `type="submit"`. Existing confirmation cancellation and Escape/focus return are preserved; the shared focus loop prevents Tab from leaving the modal.

Visual inspection caught the old adjacent-button margin being overridden by the shared button reset. The scoped selector was corrected, and the final test verifies an 8px gap between Cancel and Confirm suspension. No workflow or server payload changed.

Removed ten obsolete selector alternatives: three workspace selectors (`workspace-dialog` and the unused global danger button), four directory dialog/danger selectors and three unused Overview page-header/panel adapters. PostCSS comparison confirms retained declarations, conditions and order are unchanged. Scoped shared danger styles remain. The only raw `<dialog>` is now inside `components/ui/dialog.tsx`.

## Reproducible source audit

Run `node scripts/audit-ui-style-contracts.cjs --report .runtime/ui-style-contracts.json` from the repository root. The checked-in [GLOBAL_UI_FINAL_AUDIT.json](GLOBAL_UI_FINAL_AUDIT.json) also records exact selector removals, dynamic-variant review and retained global consumers.

| Check | Result |
| --- | --- |
| Application source / CSS Modules | 95 source files / 33 modules |
| Static module references / compositions | 627 / 8; no missing definitions |
| Dynamic style lookups | Button primary/secondary/ghost/danger and Badge warning/success/error all resolve; absent tone is filtered |
| Unused module/class and unreferenced source candidates | None; lazy builder import and its declaration companion are retained |
| Page routes in source / inventory | 38 / 38; no missing row |
| Presentation dependencies | 37 pages reach AppShell; `/` retains `redirect('/dashboard')`; error/not-found reach RecoveryFrame |
| Shared shell choice | AppShell uses ApplicationShell for authenticated routes and GuestShell for guest/session flows; no old-shell branch or pathname allowlist |
| Evidence links | All 28 earlier QA documents referenced by the inventory exist |

This audit understands the repository's current imported CSS bindings and functional `:global` syntax. Dependency reachability does not prove every runtime branch, and it is not a universal dead-code detector. The two dynamic lookups and actual AppShell branch were reviewed separately. Browser evidence qualifies exercised behavior.

Retained presentation is intentional: base HTML/accessibility utilities; theme swatches and generated branding variables; the account/promotion directory count; shared reference page modules and `--ov-*` aliases; and necessary assessment/editor markup and styling adapted to shared tokens. All 55 public assets remain covered by the earlier consumer audit and are unchanged. Old filenames alone are not grounds for removal. Historical cleanup records remain intact.

## Final automated verification

All suites run sequentially through the established isolated launcher, using fresh PGlite databases/private storage, an unused dotenv path and separate test ports. No operator database, live email or paid AI is used.

| Suite / selection | Final result (test / overall) |
| --- | --- |
| Clients, default `playwright.clients.config.ts` | Pass, 21.3s / 30.5s |
| Overview, `CLIENTS_QA_SUITE=overview` | Pass, 18.6s / 26.8s |
| People, `CLIENTS_QA_SUITE=people` | Pass, 18.6s / 26.9s |
| Settings, `CLIENTS_QA_SUITE=settings` | Pass, 24.4s / 34.9s |
| Shell, `OVERVIEW_QA_SUITE=shell` with Overview config | Pass, 10.7s / 17.7s |
| Client Appearance, `CLIENT_SETTINGS_QA_SUITE=appearance` | Pass, 18.2s / 25.3s |

The extended Clients journey checks native required-field focus, keyboard containment, disabled save/Close while a real request is held, Escape during pending work, create/rename, confirmation cancellation, suspension/reactivation, stale rejection retaining the draft, focus return, role denial, search/retry, preserved access fragment, mobile overflow, axe A/AA and coarse-pointer targets. Light/mobile creation and dark desktop/mobile management are inspected. Existing suites cover Global Admin, Client Admin, Coordinator and Member boundaries, client switching, branding saves, personal theme precedence and logo safeguards.

`npm run typecheck`, the separate-output production build (`NEXT_DIST_DIR=.next-clients-build npm run build`), targeted Prettier and whitespace checks pass. Generated Next tsconfig/next-env changes are restored to their initially clean contents. Startup health-proxy refusals resolved before tests ran. No new domain results are claimed. Earlier route/browser results in the inventory are historical bounded evidence, not 40 screens rerun in this checkpoint.

## Visual evidence

Six inspected captures, using synthetic fixtures:

- [Create client, light mobile](screenshots/global-ui-final/client-create-dialog-light-mobile.png)
- [Manage client, dark desktop](screenshots/global-ui-final/client-manage-dialog-dark-desktop.png)
- [Suspension confirmation, dark mobile](screenshots/global-ui-final/client-suspend-dialog-dark-mobile.png)
- [Overview, desktop](screenshots/global-ui-final/overview-dark-desktop.png)
- [Overview, mobile](screenshots/global-ui-final/overview-dark-mobile.png)
- [Client branding, mobile](screenshots/global-ui-final/appearance-branded-mobile.png)

## Handoff and limits

Bernie's complete workflow-fix commit `e44b295` remains an ancestor of the integration branch. All 67 originally inventoried preservation entries and stashes are unchanged. Existing untracked drafts, archify, UX Engine and historical evidence remain. V2 is untouched. Approval, permission, scan-state, immutable-record, budget and N+2 rules are unchanged.

Nothing pushed, deployed or merged remotely. Remote CI is not claimed. Human technical/UX and owner acceptance remain deferred; this UI checkpoint does not qualify PostgreSQL/RLS/concurrency or hosting. Christian's additional authentication stages remain future workflow work per Bernie's direction.

The next step is the local handoff. Any subsequently authorized push/PR must first reconcile the then-current `dev` and target `dev`; Bernie handles merging. This checkpoint does not claim that current remote `dev` was fetched or reconciled.

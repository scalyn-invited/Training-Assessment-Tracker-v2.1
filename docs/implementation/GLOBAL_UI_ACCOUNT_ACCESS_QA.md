# Platform account-access controls — 19 November 2026

## Scope

Local branch `ui/global-design-system`, after `e098dc9`. Read the implementation checklist, DESIGN.md, UX Engine form/design-system/state-completeness guidance and installed Next.js CSS documentation. This bounded change covers the Clients account-access disclosure and People client/Global Admin access forms.

`PlatformAccounts` and `AccountAccess` now use shared Panel, Input, Select, Button, Feedback and Pagination components with scoped, token-based form spacing and confirmation labels. Global Admin appointment/revocation and the dialog Close control use the same controls. Explicit submit types preserve the existing native validation and submission behavior.

Visual inspection found People still referenced the removed `shell.dialog` style. Its frame was falling back to browser defaults. It now uses the existing shared Dialog, retaining its ref, title, showModal/close lifecycle and native Escape return, with the shared keyboard focus loop. No new dialog, action or information layout is introduced.

Unchanged: API endpoints and payloads, permission versions, reason constraints, membership/client defaults, fresh confirmation after client/action changes, invitation restrictions in password mode, affected-session invalidation, stale locks/reload, Global Admin eligibility and last-active-admin protection. Existing draft/close behavior is retained; no new unsaved-work workflow is claimed. Backend, migrations, approval, scan-state, immutable-record, budget and N+2 rules are untouched.

## Consumer cleanup

The final source and CSS Module consumer scan finds no remaining use of global `review-section`, `form-actions`, `choices` or `directory-panel`. Removed 16 selector alternatives: nine in globals, three in workspace and four in directory. PostCSS comparison against `e098dc9` confirms all retained selectors, declarations, enclosing conditions and order are unchanged. The exact removals and remaining live consumers are in [GLOBAL_UI_ACCOUNT_ACCESS_AUDIT.json](GLOBAL_UI_ACCOUNT_ACCESS_AUDIT.json). Necessary native/editor utilities and all public assets remain.

## Verification

All browser suites use the existing isolated launcher, a fresh PGlite database/private storage, an unused dotenv path and separate test ports. No operator database/storage or live integration is used. Commands use `npx playwright test --config=playwright.clients.config.ts`, selected by `CLIENTS_QA_SUITE`.

| Final suite | Coverage | Result (test / overall) |
| --- | --- | --- |
| `accounts` | Paging, empty/error/retry, keyboard disclosure, native required-field validation, light/dark, retained selections after rejection, fresh confirmation, stale lock/reload, successful client grant/revoke, mobile overflow, touch targets and axe | Pass, 9.3s / 18.0s |
| `accounts-mock` | Explicit Join client, ambiguous default handling and account membership behavior | Pass, 3.7s / 12.0s |
| `people` | Both access forms, last-admin protection, stale recovery, grant/revoke, search/history, role denial, desktop/mobile, keyboard focus loop and Escape return, dialog frame, touch targets and axe | Pass, 18.7s / 27.8s |
| Default Clients | Existing client management, workspace selection, responsive layouts and permission checks | Pass, 20.8s / 28.7s |

The new mobile-size assertion initially resized a fine-pointer desktop context. Shared controls intentionally use 44px targets for coarse pointers. The account and People journeys now enable touch emulation before checking this rule; the ordinary Clients regression still covers its desktop context. No product rule was weakened. An overlapping test startup interrupted an earlier People's trace artifacts; rerunning sequentially passed. Only the final complete results above count as evidence.

`npm run typecheck` and `NEXT_DIST_DIR=.next-clients-build npm run build` pass. The generated Next tsconfig/next-env changes were restored to their initially clean contents. Targeted Prettier and `git diff --check` pass. No new domain test results are claimed for this presentation-only change.

## Inspected captures

Synthetic fixtures only, under `screenshots/global-account-access/`:

- [Clients access, light desktop](screenshots/global-account-access/client-access-light-desktop.png)
- [Clients access, dark desktop](screenshots/global-account-access/client-access-dark-desktop.png)
- [Stale-access recovery, mobile](screenshots/global-account-access/client-access-stale-mobile.png)
- [People dialog, desktop](screenshots/global-account-access/people-access-dialog-desktop.png)
- [People dialog, mobile](screenshots/global-account-access/people-access-dialog-mobile.png)
- [Global Admin confirmation, mobile](screenshots/global-account-access/people-global-access-mobile.png)

The dialog uses the shared navy surface, rounded border, backdrop and visible focus ring. Its existing long form scrolls vertically on desktop/mobile; both form actions remain reachable. Confirmation copy wraps, disabled stale fields remain readable and recovery stays available above mobile navigation.

## Preservation and remaining work

All 67 original preservation entries and stashes are unchanged. Existing untracked drafts, archify, UX Engine and historical QA remain. V2 is untouched. Nothing pushed or deployed; no live email or paid AI. Future authorized PRs target `dev`.

The route inventory remains at 38 page routes and two shared recovery screens with bounded evidence. Final shared-component/scoped-style reconciliation and the remaining foundation completion review are next. This checkpoint does not claim global completion, human acceptance, full parity, production readiness or PostgreSQL/RLS/concurrency qualification.

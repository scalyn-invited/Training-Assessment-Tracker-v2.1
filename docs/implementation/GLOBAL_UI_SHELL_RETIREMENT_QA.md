# Shared shell retirement and reference qualification — 19 November 2026

## Scope

Local branch `ui/global-design-system`. Read the feature checklist, DESIGN.md, UX Engine design-system/state-completeness guidance and installed Next.js CSS guidance. This checkpoint makes the existing application and guest layouts the only AppShell presentations. It preserves information order and existing workflows; it does not introduce a new layout or change permissions.

`AppShell` no longer maintains a route allowlist or a second authenticated shell. The old sidebar, mobile drawer, focus handlers and body-class effects are removed. Authenticated routes use `ApplicationShell`, retaining platform/learning role predicates, active navigation, client loading/selection, sole-client selection, workspace switching, logout and pre-mutation unsaved-work guards. Explicit login/setup/account-link routes remain guest pages even when signed in. Unresolved sessions now use the compact shared GuestShell, without authenticated navigation, and shared feedback/retry controls. The unused BrandHeader and Password helpers are removed; the live branding resolver, ThemePicker and shared PasswordField remain.

## Consumer and route audit

- All **38 filesystem page routes** are represented in GLOBAL_UI_ROUTE_INVENTORY.md; no missing route was found. Root redirect and the two standalone recovery screens retain their earlier evidence. This is a source-coverage check, not a fresh browser visit to every route/state combination.
- Removed **101 selector alternatives**: 77 in `globals.css`, 24 in `workspace.css`. PostCSS parsed each rule and retained live alternatives in mixed selector lists. A comparison against HEAD confirmed that every retained selector, declaration, enclosing at-rule and order remained unchanged.
- Checked 184 application/package TS/TSX/JS/HTML source files for the retired class names: `app-sidebar`, `app-layout`, `app-content`, `sidebar-top`, `sidebar-nav`, `sidebar-bottom`, `sidebar-message`, `workspace-nav-label`, `workspace-header`, `guest-header`, `nav-open`, `nav-close`, `nav-backdrop`, `mobile-bar`, `navigation-ready`. No source consumers remained after removing the old markup. This bounded audit does not treat generated build output or historical tests as presentation consumers.
- Kept global theme resolution, ThemePicker selectors, reference page adapters, shared form/directory utilities, and assessment/editor styling. Public assets were not removed by this checkpoint. Non-shell selectors, compatibility branches in page components and public assets still require the separate consumer audit before global retirement can be called complete.

## Browser verification

Fresh reference checks use `playwright.overview.config.ts`, and `playwright.clients.config.ts` with the `clients`, `people`, `audit` and `settings` suite selectors. The isolated launcher uses a new PGlite database/private storage directory per run, an unused dotenv path, local Chrome and disabled live integrations. They cover the seven remaining reference inventory rows, including the retained `/platform/appearance` URL.

| Suite | Final result | Principal coverage |
| --- | --- | --- |
| Overview | Pass, 18.4s / 27.3s overall | Scoped metrics/history, independent failures, status dialog, themes, responsive/touch navigation, role denial; added protected-session error/retry checks |
| Clients | Pass, 18.8s / 27.3s overall | Directory filters/sort, create/manage/suspend/reactivate, reasons/versions, account access, selection, desktop/mobile |
| People & access | Pass, 17.7s / 26.4s overall | Accounts/admin tabs, search/paging, access changes, last-admin protection, stale recovery, permissions, desktop/mobile |
| Audit Log | Pass, 15.8s / 23.8s overall | Read-only event projection, details, filter/date validation and history, empty/error states, responsive/touch navigation |
| Settings | Pass, 21.5s / 29.9s overall | Branding saves/previews/discard/logo, conflicts/validation, appearance URL, read-only system status and permissions |

The new protected-session test forces context failure at `/platform`, verifies the shared guest layout and absence of authenticated/legacy navigation, then retries by keyboard and reaches the existing sign-in route. Desktop/mobile axe A/AA checks, overflow, focused retry and mobile target size pass. Visual inspection found adjacent error/retry controls; the shared stack now supplies spacing. The initial test incorrectly demanded a 44px desktop button; the assertion now follows the established design's mobile target requirement, retaining desktop keyboard/accessibility checks.

Additional cross-feature regressions pass through the same isolated launcher:

| Suite/config | Test / overall duration |
| --- | --- |
| Shell (`OVERVIEW_QA_SUITE=shell`, Overview config) | 12.7s / 20.7s |
| `playwright.account-ui.config.ts` | 25.8s / 33.9s |
| `playwright.client-choice.config.ts` | 17.0s / 25.1s |
| `playwright.learning-overview-ui.config.ts` | 25.2s / 33.4s |
| `playwright.guest-ui.config.ts` | 16.5s / 25.1s |
| `playwright.recovery-ui.config.ts` | 17.7s / 25.6s |
| `playwright.response-ui.config.ts` | 28.0s / 36.1s |

Together these retain role-scoped navigation, sole/multiple-client selection and recovery, saved branding/personal themes, mobile dialog/keyboard behavior, private account/MFA handling, guest authentication, root/404/error recovery and assessment response/review safeguards. No new domain behavior was introduced; domain tests are not re-counted as fresh evidence in this checkpoint.

TypeScript, the separate-output production build (`NEXT_DIST_DIR=.next-clients-build`), targeted formatting and whitespace checks pass. Build-generated config changes are restored to the clean pre-task versions. The original preservation inventory confirms all 67 file hashes unchanged and identical stashes. Eight reviewed screenshots are retained without replacing historical evidence.

The standalone `playwright.shell.config.ts` invocation stopped before its browser journey because its bundled Chromium executable was absent. The shell suite is run through the existing Overview launcher with `OVERVIEW_QA_SUITE=shell`, which uses installed Chrome and fully isolated environment settings. Startup connection-refused messages occurred before the isolated API became ready.

## Visual record and limits

Reviewed generated Overview desktop/mobile, Clients desktop, People mobile, Audit desktop, Settings mobile and protected-session error captures. The retained screenshot set is under `screenshots/global-shell-retirement/`. Full-page mobile captures can show the fixed bottom bar at the viewport position; the suites separately check touch navigation and content clearance. Fixture accounts and events are synthetic; no private-link/password/MFA values are in the retained screenshots.

This checkpoint removes the old shell, not every remaining legacy CSS/helper/asset. Next, audit compatibility branches in `learning-controls.tsx` and `response-evidence.tsx`, live reference forms such as `platform-accounts.tsx`, and remaining global styles/assets before removing anything else. Keep dynamic theme classes, branding assets, and editor utilities with live consumers. Historical route evidence remains in place. Automated checks are not human acceptance, full V2.1 parity, production readiness or PostgreSQL/RLS/concurrency qualification. No backend, migration, approval, scan-state, immutable-record, budget or N+2 rule changed. V2 remains untouched. No push, deployment, live email or paid AI. Any future authorized PR targets `dev`.

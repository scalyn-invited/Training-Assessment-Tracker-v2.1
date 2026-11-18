# Overview UI verification — 17 November 2026

Scope: the authenticated Global Admin `/platform` Overview. Desktop Figma frame `6939:1670` and mobile frame `6939:4740` in file `eQejFiVgug5zmBTd9aVGHx` are the visual references. Figma was read only. The user authorized proceeding with the existing data and destinations while the team develops the user flow. This is a presentation update, not a new parity or owner-acceptance claim.

## Implementation

- Overview-specific shell and CSS module; other routes continue using the original AppShell. The only change to the existing client account section is its linkable ID.
- Responsive desktop sidebar, mobile workspace header and bottom navigation, dynamic profile, logout and original theme preference handling. Configured custom logos remain dynamic; the default logo mark follows Figma.
- Existing `/platform/overview` counts/status, `/platform/client-accounts` active-account total and latest three `/platform/audit` events. No new API, database migration, privilege rule or provider integration.
- Independent account/activity loading and retry states, first-client action, empty activity and no-notice states. Values and audit rows are never hardcoded from the design.
- Settings exposes existing destinations and theme choices; the status dialog retains existing provider-readiness qualifications. Both dialogs trap keyboard focus, support Escape and return focus to their trigger. Escape in an open theme menu closes that menu first.
- All 17 SVG assets were downloaded from the design context and used locally at their original dimensions (6, 16, 18, 20 or 22px). No temporary asset URLs are used at runtime.
- Dark-theme tertiary text is slightly lighter for contrast. Coarse-pointer actions are at least 44px high, increasing mobile row height as needed. The existing local Inter/Segoe UI font stack is retained; no external font requests. Light and branded themes inherit existing application tokens instead of forcing dark mode.

Interim mappings: People & access opens the existing client-account section; Settings exposes existing settings destinations; account totals mean active accounts with active sign-in identities; recent activity shows the latest three real platform audit events. These remain reviewable assumptions, not approvals inferred from the screenshots.

## Automated evidence

Final focused Overview browser run: **1 passed**, 14.4-second test / 21.1 seconds overall.

```powershell
npx.cmd playwright test --config playwright.overview.config.ts
```

Verified real isolated setup/login, live count and audit mapping, independent API error/retry handling, fixture-driven empty/configured states, administrator links, people/account destination, system-status dialog, theme persistence, Settings focus wrap/Escape/return, mobile navigation, learning workspace/client selection, retained learning navigation drawer, logout and standard-member denial (HTTP 403 for all three platform read APIs). Browser page errors: none.

Checked horizontal overflow at widths 320, 390, 768, 1024 and 1440px; light/dark views and a touch-enabled mobile context pass axe WCAG A/AA checks. Touch checks confirm 44px status actions, working Settings taps and footer clearance above the fixed navigation. Visible exported icons load successfully and their rendered geometry matches their intrinsic dimensions.

Existing shell browser regression: **1 passed**, 11.9-second test / 18.9 seconds overall.

```powershell
$env:OVERVIEW_QA_SUITE = 'shell'
npx.cmd playwright test --config playwright.overview.config.ts
Remove-Item Env:OVERVIEW_QA_SUITE
```

This retains checks for role redirects, client switching, scoped learning plans/pagination, mobile navigation, theme reset, standard-member restrictions and coordinator links. Assertions for the Overview were updated to its new Settings dialog and workspace menu.

`npm.cmd run typecheck` passed. `npm.cmd run build` passed with `NEXT_TELEMETRY_DISABLED=1` after the first build was blocked by an attempted Next telemetry-config write outside the workspace. The full domain/PostgreSQL suites were not rerun for this UI-only change.

## Isolation, fixes and visual evidence

The browser runner deliberately bypasses the saved `.env`, uses a fresh private directory under `.runtime/overview-browser`, an in-memory PGlite database, separate ports 3110/3111/55432 and `.next-overview` build output. SMTP, account mail and live AI are disabled. The installed demo database, credentials and storage were not used by QA. System Chrome ran with isolated browser contexts; no saved browser profile was used.

Initial test setup hit a shared Next dev lock; the configurable build directory resolved this without stopping the user's local server. A missing client-version field in the test fixture was corrected. Browser QA found a Settings keyboard-focus-wrap defect; an explicit focus trap fixed it, and reruns passed. Visual inspection also corrected inherited control sizing and desktop footer alignment.

Screenshots inspected under `output/playwright`:

- `overview-dark-desktop.png` and `overview-light-desktop.png` (1440px).
- `overview-dark-mobile.png` and `overview-light-mobile.png` (390px).
- `overview-touch-mobile.png` (touch-enabled viewport at page bottom).

The images use isolated synthetic data, including six clients after test creation; they do not represent the user's three-client saved workspace. Local automated/visual checks do not establish human technical/UX review or owner acceptance. No commit, remote push, deployment, live email or paid AI call was performed.


## PR review artifacts

Committed synthetic screenshots: [desktop](screenshots/overview/dark-desktop.png) and [mobile](screenshots/overview/dark-mobile.png). The focused Overview and shell browser suites now run in GitHub Actions using installed Chromium; local runs retain system Chrome. Each CI job uploads its report and screenshots. The PR is for review and must remain unmerged pending Bernie's direction.

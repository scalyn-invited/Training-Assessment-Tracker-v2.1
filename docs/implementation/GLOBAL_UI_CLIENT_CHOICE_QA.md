# Client selection — local UI verification, 18 November 2026

## Bounded scope

`/clients` now uses `ApplicationShell` in learning mode and shared Panel, PageHeader, Button, Feedback and existing form spacing. It retains the original single-column client forms, text, loading/empty/retry states, busy labels, Back to workspace link, selection endpoint and dashboard navigation. The shell's existing client selector remains available. No new layout or workflow, API/domain change, migration, permission change or assessment change is included.

UX Engine's restyle, visual-character, responsive and state-completeness instructions were applied with the existing `DESIGN.md` contract. Before: legacy shell/panel with generic global controls. After: reference navy/light semantic surfaces, 32px desktop/24px mobile title, 14px body, 14px panel radius, 24px desktop/16px mobile padding, shared buttons and visible focus. At 390px the existing list remains single-column, long names wrap, and coarse-pointer buttons have 44px minimum height. No extra styles were needed.

`useBrand` already treats `/clients` as shared/platform scope; its implementation and personal preference persistence are unchanged. Client branding still applies on the existing client-scoped destinations. The stale design-status sentence about an unidentified workflow branch was corrected to match the already completed `e44b295` integration.

## Evidence

- `npx.cmd playwright test --config playwright.client-choice.config.ts`: **passed, 17.4s test / 26.0s overall**. Isolated synthetic installation and ephemeral PGlite/storage using the existing Overview fixture, separate from the saved local environment.
- Covers signed-out redirect, delayed loading, loaded choices, list outage/retry, empty access, long unbroken client names, busy selection with all page choices disabled, failed selection preserving context/CSRF, successful real selection and dashboard destination, fresh CSRF plus rejection of the old token. Visiting this chooser with one available client does not add automatic selection.
- Global Admin, Client Admin, Coordinator and Member are exercised. Non-platform roles see only their allowed client; attempting another client is rejected by the real API and does not expand access. Global administration navigation remains restricted. Existing sole-client behavior on routes that require a client is not changed.
- Axe WCAG A/AA and no horizontal overflow at desktop and 320/390/800px; Light/Dark and persisted personal Dark choice; keyboard Enter selection, menu Tab containment and Escape/focus return; coarse-pointer 44px choice targets.
- `npx.cmd vitest run tests/client-selection.test.ts tests/tenancy.test.ts`: **12 tests passed**, 6.68s. Includes atomic CSRF/audit behavior, denied choices and rollback.
- TypeScript and production build passed. Production build uses `.next-clients-build`, separate from `.next-overview` used by browser fixtures. Existing shell regression is recorded in the feature checklist.
- Desktop/mobile screenshots inspected and retained in `screenshots/global-client-choice/`. They contain synthetic names and no credentials. The page keeps the previous action order and available choices.

No failing product behavior was found during this pass. The isolated API's readiness probe can briefly log connection refusal before startup; the test waits for readiness. No obsolete global CSS was removed: the retired `client-choice` class had no CSS consumers and remaining legacy pages still need the old styles. Known generated Next configuration changes are restored after verification.

## Boundaries

Only `/clients` is newly migrated. Client administration, learning, assessments, guest/setup/recovery and old-shell retirement remain open. Historical QA and original user files/stashes remain preserved. No push, deployment, live email or AI call, human acceptance, full parity or new PostgreSQL qualification is claimed.

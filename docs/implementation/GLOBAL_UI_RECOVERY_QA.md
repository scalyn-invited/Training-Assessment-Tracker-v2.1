# Shared recovery and root redirect — 19 November 2026

## Scope

Local branch `ui/global-design-system`. Updated shared `error.tsx` and `not-found.tsx`; verified the unchanged `/` redirect. Read FEATURE_CHECKLIST, DESIGN.md, UX Engine design-system, visual-character, state-completeness and responsive guidance, plus installed Next.js error/not-found/client-component guidance and error-boundary implementation. This applies the established design system to the existing title/message/action layout; no new Figma frame or layout is claimed.

RecoveryFrame shares tokens, PageHeader and controls, with navy/light/generated theme inheritance, wrapping content and 48px mobile/coarse-pointer actions. It focuses the main landmark and retains the skip link. Existing text, saved-record reassurance and return destination remain. It does not fetch session, branding or navigation, infer a role, or expose exception messages. The current document's resolved appearance survives client-side failure. On a fresh document before appearance resolves, the existing root default remains; no additional theme-resolution mechanism was introduced.

Next.js 16.4.6 supplies both `reset` and `retry`. The installed implementation confirms that `retry` refreshes the router and resets the boundary. The action now uses that supported callback. This is read/re-render recovery, not a repeated application mutation. The real client render error is exercised below; root-layout errors, server-error variants and a new global-error boundary are outside this bounded change.

## Evidence

`npx playwright test --config=playwright.recovery-ui.config.ts`: final pass, 17.6s test / 25.4s overall. The existing isolated launcher uses fresh PGlite/private storage and no operator environment file. No live email, paid AI or scanner.

- `/` returns 307 to `/dashboard`. Uninstalled visitors reach setup; installed signed-out visitors reach login. An authenticated Global Admin without a selected client reaches the current client chooser; after selection, root reaches the learning dashboard. No new platform redirect was invented.
- Real Client Admin, Coordinator and Member sign-ins follow the existing sole-client selection to the dashboard. Context assertions retain their actual authority predicates and selected client. Return from an unknown path retains that client and reaches the dashboard.
- An unknown route returns HTTP 404 and noindex, with one main landmark and the original return link. It renders and passes checks while all API requests are blocked; the fallback makes zero API requests. Keyboard activation reaches the application/login chain.
- A malformed overview-read fixture triggers the real Next.js/React page error boundary. After entering from a document with a real saved Dark preference, the fallback retains Dark. A retry while the fixture still fails shows recovery again; removing the fixture and activating Try again restores the real dashboard. Overview data before/after is equal. The fixture induces a client render failure; it is not evidence of a real backend defect or recovered mutation.
- WCAG A/AA axe scans, single landmark, initial focus, keyboard retry/return, mobile target sizes and no horizontal overflow pass at 320/390/800/1440px where exercised. Not-found styling is checked with light, dark, neon-cyan and platform-dark document-theme fixtures. Real personal Dark preference is used for the error journey. No new branding fetch or preference write occurs in RecoveryFrame.
- Standalone TypeScript and production build using `.next-clients-build` passed. Formatting and whitespace checks pass. No new domain tests were needed: no backend, authorization, migration or protected rule changed.

Initial checks found a CSS specificity override reducing mobile targets to 36px; scoped selectors now enforce 48px. Test fixes aligned cookies with the browser session, used client navigation to test resolved-theme inheritance (a hard navigation starts with the root default), and matched the existing Client Admin/coordinator distinction. Final browser checks pass. Startup briefly logged refused connections before the isolated API became ready.

## Visual record and limits

Four inspected screenshots under `screenshots/global-recovery/`: error and not-found at desktop/mobile widths. No credentials or account records are shown. Automatic screenshots/traces are disabled; QA hides Next's development-only overlay/indicator to inspect the actual fallback.

No change to `/` source, authentication, client selection, approval, scan-state, immutable-record, budget or N+2 rules. Existing original files and stashes are preserved; V2 untouched. Nothing pushed/deployed. Future authorized PRs target `dev`; Bernie merges. This evidence does not establish human acceptance, full parity, production readiness or global completion. Reference-route qualification and removal of the remaining legacy-shell fallback remain open.

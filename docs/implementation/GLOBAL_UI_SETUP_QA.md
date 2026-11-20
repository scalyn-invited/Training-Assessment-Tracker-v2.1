# Setup and installer UI — 19 November 2026

## Scope and design

Branch `ui/global-design-system`. Bounded routes: `/setup`, `/setup/local`, `/setup/hosted`. No backend, migration, database-ownership, authentication, approval, scan, immutable-record, budget or N+2 rule changed. V2 untouched. Existing workflows remain authoritative.

Used the project checklist, DESIGN.md, UX Engine design-system/visual-character/form-ux/responsive/state-completeness/feedback guidance, Figma design-to-code and local Next.js client/CSS guidance. Read the setup frame code and screenshots from `eQejFiVgug5zmBTd9aVGHx`: requirements `7001:6540`, database `7001:6636`, administrator `7001:6749`, review `7001:6860`, progress `7001:6962`, complete `6984:3323` on Christian's Pre-login page. No Figma writes.

All three routes now share GuestShell and SetupFrame with the shared controls, semantic themes and platform branding. The stepper, 640px card, paired desktop fields, bordered checks/review, progress list and 560px completion card follow those frames. Mobile adapts the existing 800px contract: wrapping steps, stacked fields, 20px card padding, 48px controls and 16px input text. No mobile setup frame was supplied/read; this is responsive implementation, not pixel parity with an unseen frame.

## Preserved behavior

- `/setup` retains its existing initializer stages, name/email/password/demo fields, review, actual setup call, completed receipt and installed/mode redirects. No new confirmation or database stage was invented for this legacy endpoint.
- Local PGlite/PostgreSQL choices, hidden PostgreSQL field retention, empty-database ownership checks, administrator/demo password separation, hosted setup-token gate and current validation remain. Hosted setup still creates no fictional clients or accounts.
- Requirements render only actual API checks. The design's sample extra checks and fake percentage are not shown. Progress uses the four saved installer stages and local 25-step fixture count.
- Retry, paused steps, reload/resume, completion after a lost response, automatic local API handoff and hosted restart guidance remain. No credentials appear in review summaries; no secrets are added to browser storage.
- Dirty/pending forms join the existing work guard. A rejected or failed same-step reload keeps mounted inputs; the chosen database engine is not reset while edited. Back confirms discarding unsaved fields. The prototype's separate Test connection and Edit shortcuts are not new workflows.
- Shared guest branding, personal theme precedence and appearance retry remain. Public setup uses platform branding rather than assuming a selected client's brand.

Bernie's forwarded response confirms preserving the existing authentication flow and leaving Christian's additional flows for future work. The historical `guest-auth-team-clarifications.txt` is preserved as sent; that question is resolved, not human acceptance of the UI.

## Verification

- Local installer browser: final pass, 1.3m test / 1.4m overall. Real isolated PGlite setup, database-choice input retention, administrator validation, review privacy, interrupted fixture preparation/reload, pause/resume, completion reload, automatic runtime handoff and real administrator sign-in. Database assertions confirm 31 users, 21 enrolments and 42 evidence records.
- Hosted installer browser: pass, 18.0s / 35.3s overall. Isolated PostgreSQL and local HTTPS fixture; invalid/valid token, security headers, unrelated-table rejection without deletion, retained credentials after failure, forged-origin rejection, review/back, interruption/reload/retry, production-only administrator, restricted migration role/policy and real sign-in after restart. This is bounded installer evidence, not full PostgreSQL/RLS/concurrency qualification.
- Additional setup UI suite: all three cases passed (7.7s / 1.7s / 1.8s; 18.9s overall). Real legacy initialization/sign-in plus fixtures for initial loading, appearance failure/retry, guest theme precedence, requirement failure, local upgrade token, unavailable PGlite choice, context failure/retry retaining fields, changed setup ownership, pending/dirty navigation guards and lost completion response.
- Installer domain suites: `installation-state`, `installation-transport`, `installer`, `local-installer`: 14 tests across four files passed (56.42s), using isolated databases/storage.
- Desktop/mobile axe A/AA, overflow at 320/375/390/800/1440px where exercised, native validation/focus, keyboard continuation, radio semantics, mobile control dimensions and exact SVG render dimensions pass in installer/UI journeys. Light, dark, neon-cyan and generated platform-dark are exercised; brand-name/default-theme differences are controlled fixtures.
- Shared-shell regression passed (12.5s / 22.0s overall); guest-authentication regression passed (16.4s / 24.0s overall). Standalone TypeScript and production build using `.next-clients-build` passed. TypeScript caught missing `.js` extensions in the new test-helper imports; corrected imports pass TypeScript and Playwright discovery for all three affected configs. Formatting and whitespace checks pass.

Initial additional UI runs exposed broad alert selectors including Next's route announcer and an unsynchronized branding-failure fixture. Scoped selectors and an explicit wait for the failed appearance state corrected those test issues. Initial sandboxed browser runs completed their assertions but needed cleanup of their verified isolated test-server trees; final runs used Windows process access and exited normally. Readiness and installer-to-runtime handoff briefly logged refused/reset connections before their retry checks succeeded.

## Presentation retirement and evidence

Checked application consumers before removing login-grid, login-panel, intro heading, steps and journey-steps CSS. Retained the shared mobile grid rule and unrelated utilities; the old application-shell fallback and global retirement are separate work. Source review corrected an intermediate combined-selector cleanup before final regression checks.

Six original Figma SVG exports are local under `apps/web/public/setup`: step check (16px), shield/arrow (18px), requirement check/schedule (20px), complete (26px). Existing `/auth/info.svg` is reused. No temporary Figma asset URL is used at runtime. Dynamic branding remains API-owned.

Reviewed screenshots are retained in `screenshots/global-setup/`. They contain empty credential fields or synthetic review/completion data. Automatic installer/UI failure screenshots and traces are disabled; explicit screenshots exclude entered tokens/passwords. Screenshot-only styles hide Next's development indicator.

All 67 originally inventoried file hashes and stashes are preserved. No push, deployment, live email, paid AI or scanner use. Future authorized PRs target `dev`; Bernie merges. No human acceptance, full V2 parity, global completion or production readiness claim. Next bounded feature: shared error/not-found screens and root redirect verification; reference qualification and old-shell retirement remain open.

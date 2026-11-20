# Guest sign-in and account-link UI — 19 November 2026

## Scope and source

Local branch `ui/global-design-system`. Bounded routes: `/login` and `/account/link`. No backend, migrations, authorization, token lifecycle, MFA policy or account membership rules changed. Setup/installer flows, shared errors/not-found and final reference qualification remain separate work.

Read the project checklist, DESIGN.md and UX Engine design-system, visual-character, form-ux, responsive, state-completeness and feedback-and-affordance guidance. Figma design-to-code context and screenshots were read from file `eQejFiVgug5zmBTd9aVGHx`, Christian's page `6984:2309`; the page required metadata discovery before reading individual frames. Sources: desktop sign-in `6984:3988`, mobile sign-in `7007:8148`, password recovery `7001:7171`/`7007:8206`, setup password `7001:7574`, invitation `7007:7854`/`7007:8356`.

Before: legacy guest header/container, marketing steps, generic panels and native legacy fields. After: shared guest shell, desktop split sign-in, centered account card, borderless mobile form, semantic theme tokens, shared inputs/buttons/password/feedback and responsive controls. PasswordField has optional icon/guest presentation without changing default account consumers.

## Preserved behavior and deliberate adaptations

- Local password sign-in, installed/session redirects, mock identities and unavailable configuration remain. MFA uses the existing combined authenticator/recovery input with current credentials retained. No six-input OTP, new MFA endpoint or new stage flow.
- Forgot password reveals existing administrator-issued private-link guidance. No email-recovery endpoint or self-service account creation was invented.
- Setup/reset retain password plus confirmation on one form and existing length/byte guidance. The Figma strength/common-password examples are not displayed as fabricated validation. The server remains authoritative.
- Recipient, client and expiration remain visible. Invitation acceptance keeps its required checkbox and existing account/permission explanation. Missing/used/invalid states retain retry and administrator guidance.
- Dynamic brand names/logos and theme controls remain. The public auth context does not provide an environment value: no unsupported sandbox claim. Guest selection uses its existing platform-scoped storage key; selected client branding is not substituted on account links.
- Account-link inputs survive a failed same-link recheck. Dirty/pending work participates in the existing navigation guard. Fragment changes clear the prior view; redemption removes the fragment and existing session invalidation remains. Passwords remain only in the mounted form.
- Shared 48px mobile inputs/buttons and 16px input text override legacy field specificity locally. No global CSS overrides. Legacy login-grid/intro/login-panel selectors still serve `/setup` and remain.

These adaptations preserve current workflows as instructed. They are recorded separately for team confirmation and are not evidence of human design acceptance.

## Automated evidence

- Guest browser journey: `npx playwright test --config playwright.guest-ui.config.ts`, passed (16.0s test / 23.7s overall). Fresh PGlite/private storage through the existing isolated launcher; no operator `.env` or saved local database. No live mail/AI/scanner.
- Real password setup, mismatch rejection retaining input, one-time reuse denial, recipient sign-in, required invitation checkbox/acceptance, new membership after reauthentication, password reset/session invalidation and MFA recovery-code sign-in pass. Actual recovery-code reuse and TOTP rules are covered by domain tests.
- Guest browser fixtures cover options outage/retry, invalid-login response, inspection outage/retry retaining input, pending redemption/navigation block, unavailable authentication and empty mock identities. These fixture responses are not claims of configured live SSO/email services.
- Dark/light/neon-cyan/generated platform-dark, 320/390/800/1440px overflow, WCAG A/AA axe scans, mobile input size/type, keyboard disclosure/theme Escape/focus, show/hide and dirty navigation cancellation pass. Private tokens do not enter GET URLs or visible text. No page exceptions.
- Domain: `npx vitest run tests/auth.test.ts tests/accounts.test.ts`, 19 tests passed (8.16s), isolated databases.
- Existing account/security browser regression passed (25.1s / 33.2s overall). Existing shell regression passed (12.4s / 21.0s overall), covering session retry, roles, client selection and redirects. Its initial failure caught a changed retry label; the established "Try loading again" label was restored before retesting.
- Standalone TypeScript and separate-output production build passed. Formatting and whitespace checks recorded with the final local checkpoint.

The first guest runs exposed an overly broad test alert locator (including Next's route announcer), a test assumption that invitation acceptance preserved its session, and CSS input specificity defects. Assertions and scoped styles were corrected; the final guest journey passed. Startup readiness briefly received connection-refused responses until the isolated API started; the ready check subsequently succeeded.

## Visual and asset evidence

Explicit screenshots only; automatic failure screenshots and traces are disabled for private-link/MFA tests. Inspected desktop/mobile sign-in and account-link screenshots are retained in `screenshots/global-guest-auth/`. Screenshot account identities are synthetic and fields are empty. URL fragments, credentials and MFA secrets are excluded.

Original Figma SVG exports are stored locally in `apps/web/public/auth/`: mail/lock (18×18) in sign-in inputs, key and accepted (26×26) in desktop account headers, info (18×18) in the invitation explanation. Root dimensions are unchanged. Sources are assets from sign-in frame `6984:3988`, reset frame `7001:7171` and invitation frame `7007:7854`. No temporary asset URLs are used at runtime. Mobile hides the account header icon as in the supplied frames. Brand imagery remains API-supplied.

## Limits

Automated evidence does not establish human UX/owner acceptance, complete global migration, full V2 parity, production readiness or fresh PostgreSQL/RLS qualification. No push/deployment. Future authorized PRs target `dev`; Bernie merges. Preserve all historical evidence and local drafts/stashes.

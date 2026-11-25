# Sign-in password visibility icon

Scope: `/login` only, based on Christian's updated Figma frame `6984:3988` in `eQejFiVgug5zmBTd9aVGHx`. Branch `ui/login-password-figma`, base `origin/dev` at `e1035b4`.

The shared PasswordField accepts an opt-in icon toggle. Sign-in uses the supplied visibility/visibility-off SVGs, stored locally without changing their source geometry. A 20px CSS mask inherits semantic theme color. The native button has Show password/Hide password accessible names, a visible keyboard focus outline, and a 44px mobile/coarse-pointer target. Password text reserves 52px on the right. Other consumers retain the separate text control.

Authentication, recovery, MFA, validation, autocomplete and password limits are unchanged. No backend or migration changes.

## Verification — 25 November 2026

- `npx playwright test --config playwright.guest-ui.config.ts`: 1 passed (27.8s), using fresh ephemeral PGlite and private test storage; mail and live AI disabled.
- Existing guest/account-link journey checks authentication, private one-time links, recovery and MFA. Desktop 1440px and widths 390/320/800, theme switching and axe accessibility checks pass.
- Added checks: mobile target size, keyboard Enter/Space show/hide, retained field value/focus, zero login requests from toggling, and text clearance.
- First run exposed an existing decorative-image load race after theme reload; the assertion now waits for image loading. Second run exposed overridden right padding (12px); corrected to 52px. Final run passes.
- TypeScript and production build pass on the final implementation.
- UX Engine review and visual inspection: labelled input, primary Sign in action, visible eye at the input's right edge, responsive containment and keyboard control preserved. Desktop uses the existing 40px field height; mobile targets are 44px high.

Screenshots contain empty fields and synthetic branding: [desktop](screenshots/login-password-icon/desktop.png), [mobile](screenshots/login-password-icon/mobile.png).

These are local automated checks and visual inspection, not human acceptance or a claim of full application parity. Nothing pushed, merged or deployed.

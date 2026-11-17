# Settings UI — 17 November 2026

## Scope

Figma file `eQejFiVgug5zmBTd9aVGHx`, desktop Appearance `6939:2692` and System status `6939:2861`, mobile `6939:5599` and `6939:5741`. Dedicated branch `ui/settings-figma` starts from Audit Log commit `e09e8f6`; earlier UI PRs remain dependencies.

Appearance is available at `/platform/settings`, with read-only connections at `/platform/settings/status`. The existing `/platform/appearance` URL renders the same Appearance view. Tabs use links, supporting direct URLs, reload and browser history. The existing client Appearance page retains its workflows and layout.

## Preserved safeguards

- Reuses the existing branding controller and API: Global Admin authority, CSRF, displayed version, required audit reason, server validation and environment scope are unchanged. No backend or migration changes.
- Live name/colour previews do not save. Generated light/dark palettes retain the existing contrast algorithm rather than copying fixed Figma colours. Save refreshes shared branding; Discard reloads saved values. Stale saves retain the draft and offer explicit reload.
- Logo selection uses the native file input. The existing 2 MB client limit and server-side type/decode/dimension/re-encoding rules remain intact. Current custom logo display and removal remain available even though absent from the initial Figma frame. File selection is not advertised as drag-and-drop.
- System status uses `/platform/overview`. It does not expose credentials or enable services. Configured email/AI is explicitly described as unverified here. Real counts and identity mode replace design fixture values.
- Personal theme overrides and account security remain available through the profile avatar's accessible Personal settings button. The existing native dialog, Escape handling and focus return are retained. Desktop sidebar theme control remains available. Main/bottom Settings navigation now opens the page.
- No V2, saved demo database, private configuration or baseline manifest changes. Live emails and paid AI calls remain disabled in QA.

## Visual and accessibility choices

Uses existing platform CSS tokens and CSS Modules, original Figma SVG assets at intrinsic dimensions, and the existing font stack. No external fonts or UI dependency added. Form borders/help text retain accessible contrast; mobile fields use 16px text and coarse-pointer controls are at least 44px. Preview stacks below the form on narrow screens. Logo selection wraps within the mobile card. Status rows wrap labels/badges where required.

Personal settings placement is an interim navigation decision while the team develops userflows. The Overview's existing system-status dialog remains functional. Final navigation placement can be aligned later without changing permissions or service configuration.

UX Engine is unavailable in installed tools/skills. Figma design context, repository components/tokens, screenshots and axe checks were used; no UX Engine or human acceptance is claimed. Team follow-up stays in the separate local `.txt` draft.

## Verification

Fresh ephemeral PGlite/storage on ports 3110/3111/55432, isolated from the saved demo, with email/AI disabled. Build output uses `.next-overview` for browsers and `.next-clients-build` for production verification. Screenshots contain fictional QA data only.

- `npx vitest run tests/branding.test.ts`: all 6 tests passed, including permissions, version conflicts, isolated theme preferences, palette contrast, image rejection/re-encoding and platform audit recording.
- Focused Settings browser scenario passed. Covers desktop/mobile layouts, 320–1440px overflow, light/dark and neon/generated-theme axe A/AA checks, live preview without save, discard, required reason, real save/reload, logo upload/removal/oversize/corrupt-image rejection, audit reason, concurrent-edit rejection/recovery, status failure/retry, configured/unverified labels, mock/password identity labels, history/legacy URL, personal theme/security access, ordinary-account denial, touch targets and footer clearance.
- Overview and shell browser regressions passed, preserving personal-settings dialog focus trapping, Escape return, theme choice and account security.
- Clients, People & access and Audit Log regressions also passed (16.2s, 13.6s and 12.6s respectively). Final Settings scenario: 16.8s / 23.6s overall.
- TypeScript and production build passed. Integrated browser assertions now use the Settings heading and visible save/reason labels. Full integrated coverage runs in remote CI.
- CI UI matrix includes Settings alongside the eight existing suites. Remote check results are recorded on the PR, separately from local evidence.

Initial browser checks exposed exact field-label matching and inherited global input spacing; corrected with explicit accessible labels and scoped selectors. Status values are separate from decorative dots for reliable text access. Final desktop/mobile screenshots were inspected and copied to `screenshots/settings/`.

The legacy baseline source folder previously recorded as missing remains unavailable locally; no baseline qualification or full-port acceptance is claimed. PR remains for Bernie to review and merge.

## CI assertion correction

The first push UI run exposed an ambiguous alert locator: Next.js's transient route announcer could match alongside the expected branding error. The application correctly rejected the stale save. Settings assertions now target alerts inside the main content and verify the conflict message explicitly; the corruption check uses the same scope. No application behavior changed.

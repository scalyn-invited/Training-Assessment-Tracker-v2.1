# Document review - 19 November 2026

## Scope and design

`/enrolments/[id]/documents/[fileId]` now uses the shared learning shell, page header, panels, fields, buttons and feedback. File/scan context, untrusted-text notice, original download, extraction request/status, read-only extracted text, five review fields, save/confirm actions and attempt history retain their existing order and copy. Native confirmation and reload dialogs remain. Source/run/onboarding versions, editability, clean-scan requirements, request/save/confirm handlers and payloads remain authoritative. No backend, migration, approval, permission, scan-state, immutable-record, budget or N+2 rule changed.

UX Engine form-ux, visual-character, responsive, restyle and state-completeness guidance applies through DESIGN.md. Before: the legacy shell, generic panel/notice/form presentation and inline preformatted-text styling. After: the existing sans-serif hierarchy, semantic theme colors, 14px panels, 24px section/16px field spacing, wrapping actions and 16px mobile controls. Read-only document text preserves whitespace and wraps long lines; it uses the shared body font. No new document editor, field order, layout or AI action was introduced. Generic legacy styles still serve other routes and remain.

The old click/unload listener did not participate in the shell's client-switch/sign-out checks. The page now registers dirty and pending work with the existing shared guard. Pending work blocks departure; dirty work uses the shared discard prompt. Original downloads remain new-tab links exempt from navigation guarding. Existing explicit reload and findings-confirmation prompts are unchanged. Signed-out visits now reach login. The inventory now accurately records management/sensitive authority and direct extraction request/retry, rather than implying a separate re-extraction confirmation.

## Automated and visual evidence

- Document browser journey: passed, 43.4s / 52.8s overall. Command: `npx playwright test --config playwright.document-review-ui.config.ts`.
- Isolated shell regression: passed, 12.7s / 22.6s overall. Set `OVERVIEW_QA_SUITE=shell`, then run `npx playwright test --config playwright.overview.config.ts`.
- Extraction/parser domain tests: 22 passed, 22.32s. Command: `npx vitest run tests/document-extractions.test.ts tests/document-parser.test.ts`.
- `npm run typecheck`, production build with `NEXT_DIST_DIR=.next-clients-build`, formatting and whitespace checks pass. Generated Next config files are restored afterward.

The browser journey creates synthetic accounts/record, separately grants sensitive access, uploads a real TXT assessment and verifies quarantine/download denial and waiting-scan behavior. An explicit clean-scanner outcome is then supplied only in the isolated database. The real worker extracts TXT, the real API saves reviewed findings, a concurrent API save creates a genuine stale-version conflict, and the browser retains local text until the existing reload prompt is accepted. Confirmation creates onboarding version one with extraction provenance and a SHA-256 source hash. Confirmed findings become read-only. HTML-like source text stays literal and produces no page error.

Coverage includes signed-out/missing-client redirects, held initial loading, failed extraction request/retry, invalid confirmation, cancelled back/client-switch/sign-out/confirmation/reload actions, pending-save exit refusal, disabled fields during saving, keyboard reload, initial read error/recovery and original download attributes/API. Member, unallocated Client Admin and Global Admin reads remain concealed with 404; cross-client reads return 403. Fixture states cover queued/running/waiting-scan polling, failed extraction/manual entry, changed scan status, active-record read-only display, warnings and long file/text values. Light/Dark and client-default precedence, axe A/AA and overflow at 320, 390, 800 and 1440px pass.

Desktop review, mobile review and mobile confirmed receipt were visually inspected and saved under `screenshots/global-document-review/`. The first test attempt used the wrong multipart field name; it was corrected to the existing `evidence` contract. No upload implementation changed.

## Limits and preservation

The clean-scan transition is an explicit test fixture, not a real malware scanner result. Polling/failure/active/scan-change display fixtures do not establish worker execution or permission enforcement for those fabricated responses; domain tests provide separate rule coverage. Real TXT extraction and actual source-bound confirmation were exercised. This bounded UI check does not qualify native PDF/OCR tools, production scanning or PostgreSQL/RLS. Tests use fresh `.runtime/overview-browser` database/private storage and `.next-overview` output; email/live AI are disabled. No operator database or V2 data is used.

All 67 originally inventoried untracked file hashes and stashes are unchanged; historical evidence remains intact. Automated checks and agent visual inspection do not establish human acceptance, full parity, global completion or production readiness. Nothing pushed/deployed. Future authorized PRs target `dev`.

Next bounded feature: learning delivery `/enrolments/[id]/delivery`.

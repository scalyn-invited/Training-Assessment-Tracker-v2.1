# Training-record details — 18 November 2026

## Scope and design

`/enrolments/[id]` uses the shared application shell and visual system. Existing action navigation, title/status, foundation/evidence pair and background receipts retain their order and information. Summary-only access retains its explanation and Back link. Shared controls preserve native attributes, handlers and upload/check payloads. No backend, migrations, permission, approval, scan-state, immutable-record, budget or N+2 rules changed. Onboarding, delivery, curriculum and document-review destinations remain on their own migration schedule.

UX Engine design-system, visual-character, responsive, state-completeness, restyle and form-ux guidance applies through DESIGN.md. Before: legacy page-heading, badge, detail-grid, panel, file-list and form-action presentation. After: shared sans-serif hierarchy and semantic colors, 14px panels, 24/16px panel padding, wrapping evidence metadata/actions and file controls with shared focus/border treatment. The existing two-column panel layout becomes one column at 800px. Long labels wrap; coarse-pointer file chooser and evidence links reach 44px. This is a restyle of the existing structure.

Both BackgroundReceipts consumers now use shared presentation, so its temporary legacy branch and Overview opt-in prop are removed. Five-second polling, request serialization, receipt messages and recovery remain unchanged. Two obsolete `.detail-grid` CSS selectors are removed after consumer searches, retaining other selectors in mixed rules. Generic `.file-list` and `.receipts` still serve delivery/review/curriculum and remain. Historical evidence is retained.

Corrected the route inventory: this page has no foundation confirmation dialog or evidence deletion control. Existing check and upload actions remain direct. No offline support is introduced; network errors retain existing recovery actions. Failed uploads preserve the selected file and purpose; successful uploads reset the form. Downloads remain blocked for unclean files, and extraction links remain governed by purpose and management authority. A visible link does not bypass the document route's scan restrictions.

## Verification

Sixteen existing enrolment, evidence-file and foundation-check domain tests pass (50.10s). The focused isolated browser suite passes (1.2m / 1.8m overall). It covers:

- Guest and no-client redirects, real Global Admin and unallocated Client Admin denial, Coordinator summary-only rendering, Member detail/upload access and cross-client denial. A real separate Client Admin sensitive-access grant enables the allocated Coordinator's management/upload controls and assessment extraction link.
- Held record/evidence loading, empty evidence, independent evidence failure/retry, record error/retry, and injected stale-check recovery followed by a successful real requeue. Keyboard activation creates a real local worker receipt displayed as Delivered; no outbound delivery is enabled.
- Required-file validation, injected upload failure with file/purpose retention, successful synthetic TXT uploads with form reset, quarantined status and actual download denial before scanning. No scanner is configured in browser QA; clean/rejected rendering and read-only detail are explicitly injected display fixtures, while scan/access rules are exercised by the domain tests.
- Existing delivery/onboarding/curriculum/extraction URL contracts; long title/member/file names; Light/Dark, generated client branding and personal preference reset; axe A/AA and overflow at 320, 390, 800 and 1440px. The existing layout and information order remain.

Early browser runs corrected test assumptions rather than changing permissions or status labels: inaccessible records are concealed with 404, an unallocated Client Admin does not automatically receive a training summary, and a completed local check is labeled Delivered. The final suite retains these assertions. Desktop, mobile and summary-only screenshots were visually inspected. They contain synthetic data only and are saved under `screenshots/global-training-record/`.

Overview regression, final TypeScript/build and preservation checks are recorded in FEATURE_CHECKLIST.md. Browser QA uses fresh `.runtime/overview-browser` database/storage and `.next-overview`; the build uses `.next-clients-build`. Generated Next configuration changes are restored. The earlier Overview test's legacy receipt selector is replaced with semantic shared-shell/region assertions because both consumers are now migrated; historical QA documentation remains intact.

## Reproduction and limits

`npx playwright test --config playwright.training-record-ui.config.ts`; Overview regression uses `playwright.learning-overview-ui.config.ts`. Domain command: `npx vitest run tests/enrolments.test.ts tests/evidence-files.test.ts tests/foundation-checks.test.ts`.

Eleven additional route rows are checked. Remaining nested training/learning routes, assessments, guest/setup/recovery, reference-route final qualification and complete legacy retirement remain open. No human acceptance, full parity, global completion, production readiness, live scanning or fresh PostgreSQL/RLS qualification is claimed. V2 is untouched; nothing pushed or deployed. Next bounded feature: onboarding `/enrolments/[id]/onboarding`.

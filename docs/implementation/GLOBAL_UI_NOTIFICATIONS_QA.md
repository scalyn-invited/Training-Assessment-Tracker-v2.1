# Notifications and preferences UI - local QA, 19 November 2026

## Scope and design

The bounded feature is /notifications, including its Preference form. ApplicationShell and shared PageHeader, Panel, Input radio fields, Button, Feedback and Pagination replace legacy presentation. The client heading, Workspace link, email preference and notice list remain in their existing order. Links, timestamp/status information, native radio behavior, twenty-item pagination and synthetic sink/relay-acceptance explanation remain. Email preference is account-wide; notices remain selected-client and recipient scoped. No read/acknowledgment action or save-confirmation dialog existed; the inventory now reflects that accurately.

UX Engine form, state-completeness, responsive and visual-character guidance is applied through DESIGN.md. Shared semantic themes, 24px sections, 16px record spacing, 8px metadata spacing, wrapping labels and unbroken tabular timestamps retain the reference character. Coarse-pointer radio labels, notice links and buttons have 44px minimum targets. Personal theme precedence and client branding are unchanged.

Signed-out visits reach login. Dirty preferences and pending saves register with shared work protection for navigation, client switching and sign-out. Existing saves keep their original payload and immediate submit behavior. Changing the preference clears old success feedback. Refreshes and errors retain unsaved choices and loaded notices; pagination follows the fetched page and can retry a failed next page. No domain, migration, permission, approval, scan-state, immutable-record, budget or N+2 rule changed. Other legacy consumers/compatibility helpers remain for their bounded retirement.

## Verification

- Notification domain suite: seven tests passed (4.13s). Command: npx vitest run tests/learning-notices.test.ts.
- Isolated notifications browser journey passed (30.3s / 39.5s overall). Command: npx playwright test --config playwright.notifications-ui.config.ts.
- Isolated shell regression passed (13.9s / 23.1s overall). Set OVERVIEW_QA_SUITE=shell and run npx playwright test --config playwright.overview.config.ts.
- Production build passed using separate .next-clients-build output. Standalone TypeScript, formatting and whitespace checks passed.

The isolated browser journey creates actual synthetic training activation, submitted work and human-approved feedback through the existing local mock curriculum flow. Actual member programme-ready and feedback-ready notices reach the non-delivering sink. The notice link opens the existing delivery URL. A failed preference save retains the choice and leaves the stored value unchanged; a held request disables the form and blocks shell exits. A successful save persists across reload and leaves notices available. Unsaved choices survive refresh and cancelled navigation/client-switch/sign-out. Native keyboard radio selection and submission are exercised; editing clears the previous success message.

Explicit network fixtures cover a 21-item total, next-page failure with retained first-page records/controls, retry/previous behavior, long labels, assessment destinations, initial loading/retry, retained-content errors and published status labels. They do not claim 21 actual notices, real SMTP delivery or real ambiguous/failed transport transitions. Domain tests separately exercise deduplication, sink/in-app delivery, authority rechecks, recovery, secure-link construction, bounded rejection retries and ambiguous outcomes using isolated transports.

Member cross-client reads are denied; actual coordinator, Client Admin and Global Admin projections are checked. Admin/global accounts without recipient events see the empty state. A saved Global Admin email preference is checked after switching to a different client and reopening Updates, preserving the existing switch-to-Overview navigation. The first test assumed switching stayed on Updates; correcting that test expectation required no app workflow change.

Light, Dark and client-default branding, keyboard controls, axe A/AA and overflow at 320/390/800/1440px are checked. Touch checks measure radio-label, save-button and notice-link targets and run axe. Desktop/mobile updates, plain-dark desktop and empty mobile screenshots are inspected and stored under screenshots/global-notifications/.

## Preservation and limits

Browser tests use fresh .runtime/overview-browser database/private storage and separate Next output; domain fixtures use isolated databases and fake transports. No live email, paid AI, operator demo data or private V2 files were used. Generated Next configuration was restored after checks. All 67 originally inventoried file hashes and stashes are unchanged; historical evidence is preserved.

Twenty-one additional route rows are checked; seven reference rows retain final qualification. Remaining routes and full legacy retirement remain open. Automated checks and agent inspection do not prove human acceptance, full parity, global completion, production readiness or fresh PostgreSQL/RLS qualification. Nothing pushed/deployed; future authorized PRs target dev.

Next bounded feature: assessment directory /assessments and its independent assessment appeal routing.

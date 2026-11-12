# V2.1 migration checklist

Source: V2 working tree at commit 3f3e4a86e8c4a4ce829a983b0406abac4b43a5b1, including the captured uncommitted assessment work. See source-baseline.json (366 files). V2 historical evidence does not prove V2.1 parity.

## Foundation — Completed (local implementation and QA)
Acceptance: independent workspaces, separate web/API/worker, persistent shared PGlite fallback, PostgreSQL adapter, checksummed SQL migrations, transaction-scoped tenant access, durable outbox, startup and browser checks.
- [x] Implementation
- [x] Tests / QA
- [x] Fixes and retesting
- [x] Evidence recorded
- [x] Local feature verification
Evidence: TypeScript check passed; eight foundation tests passed; isolated real PostgreSQL RLS and concurrent-claim test passed; production build passed; initial mobile browser/axe test passed and screenshot inspected. Source verification confirmed all 366 captured hashes unchanged.
Fixes: explicit legacy-decorator compiler config; PGlite socket maxConnections=16 so API and worker can share the owner; browser tests use isolated storage/ports.
Technical self-review: migration transactions/checksums, scoped SET LOCAL ROLE/context reset, rollback, idempotency conflicts, claim leases and ambiguous-effect handling reviewed. Runtime database provisioning/privilege qualification remains part of final hosting/security acceptance.
Human technical/UX review, owner acceptance and remote CI are not recorded.

## Local setup, password sessions and optional TOTP — In Progress
Acceptance: fresh administrator plus 30 synthetic accounts; installation cannot repeat or overwrite existing accounts; password-only sign-in by default; optional encrypted TOTP with one-use recovery codes; CSRF/origin checks, session rotation, revocation, accessible setup/login/security UI.
- [x] Implementation
- [x] Tests / QA completed
- [x] Issues fixed and retested
- [x] Final evidence recorded
- [ ] Human technical/UX review and owner acceptance recorded
Current evidence: 19 domain/foundation tests passed; real PostgreSQL RLS/concurrent-claim test passed separately; TypeScript and production build passed. The complete browser scenario passed, including setup, password-only login, optional MFA enrollment, recovery-code login, forged-Origin and invalid-CSRF rejection, mobile overflow and axe WCAG A/AA checks. Mobile security screenshot inspected: output/playwright/security-mobile.png.
Fixes: explicit UUID/text casts for identity parameters; environment checks on authenticated accounts; explicit public user projection; credentials never logged.
Local account links and scoped roles are now recorded in the checkpoints below. Remaining identity parity includes email delivery, hosted installer, full demo training scenarios and original platform redirect.


## Client authority and client directory — In Progress
Acceptance criteria: effective tenant-scoped roles; active identities and fresh imported permissions; member ownership and historical team boundaries; separate reviewer and sensitive authority; revocation without revival; last-active-admin protection; optimistic client versions; accessible client selection and directory controls.

Locally verified checkpoint:
- [x] SQL migrations for teams, effective role grants, allocations, sensitive grants and platform states; composite tenant constraints and scoped RLS reads.
- [x] Authentication derives Global Admin authority from effective grants, not the legacy user flag.
- [x] Domain/API operations for groups, team periods, role grants/revocations, allocations, membership removal and explicit sensitive access.
- [x] Client selection and validated selected-client context.
- [x] Platform client directory with search/status/sort/pagination and effective member/admin counts; create, rename, confirmed suspension/reactivation.
- [x] Global Admin appointment/revocation API with last-active-admin protection.
- [x] Automated checks and technical self-review for this checkpoint.
- [ ] Full administration parity: people/team forms, administrator and audit screens, branding and app shell. Local account-link progress is recorded below.
- [ ] Human acceptance, deferred until full parity by the user's instruction.

Evidence (2026-11-12): 34 domain/foundation tests pass; separate real PostgreSQL test passes RLS, concurrent outbox claims, concurrent administrator revocation and conflicting client updates. TypeScript and production build pass. Browser scenario passes setup, login, MFA recovery, CSRF/Origin rejection, client selection, client creation, suspension confirmation/cancel, filtering, mobile overflow and axe A/AA checks. Screenshots inspected: clients-mobile.png, directory-mobile.png and directory-desktop.png under output/playwright. All 366 captured source hashes remain unchanged.

Technical self-review: tenant IDs validated server-side, cross-tenant foreign keys, effective identity/role checks, session invalidation, historical team entry dates, no implicit admin access to training, explicit sensitive grants, mutation locks, exact versions and safe public projections. Pending work is stopped on suspension and never revived automatically; additional training/file/provider cancellation hooks must be added with their respective modules. Runtime privilege qualification remains deferred with hosting.


## Local account invitations and recovery — In Progress
Acceptance criteria: no membership on link issuance; only Member access after recipient acceptance; hashed one-use tokens; one-hour setup/reset and seven-day invitations; current-password reauthentication; active issuer authority and exact permission version at redemption; scoped metadata lists; cancellation and expiry; password confirmation and all-session sign-out.

- [x] Local new-account setup, existing-account invitations, setup reissue, password recovery and cancellation services/API.
- [x] Account forms, review step, private one-time link display, scoped link management and recipient screens.
- [x] Tokens stored hashed; URL fragments avoid sending link credentials in server URLs; listing/audit projections omit credentials.
- [x] Session and pending-reset invalidation; retained optional MFA configuration; denied-action audits.
- [x] Local domain, browser, accessibility and PostgreSQL concurrency verification.
- [ ] Email delivery, production bootstrap/hosted installer and full surrounding administration parity.
- [ ] Human acceptance, explicitly deferred until full parity.

Evidence (2026-11-12): 42 domain/foundation tests pass. Separate real PostgreSQL qualification includes two simultaneous setup redemptions with exactly one success, plus prior tenant RLS and mutation concurrency checks. Browser verification covers administrator creation, recipient password setup, existing-account invitation acceptance and administrator-issued password recovery, alongside earlier authentication and directory flows. Mobile account page passes overflow and axe A/AA checks; output/playwright/accounts-mobile.png inspected after the private link was hidden. TypeScript and production build pass.
Fixes and retest: restored source password confirmation and all-session sign-out; corrected the browser combobox selector; opening another private link in the same tab now resets completed state, refreshes the session and ignores stale inspection responses. The full setup/invitation/recovery browser sequence passed after the fix.
Technical self-review: issuer and recipient rechecks occur in the locked redemption transaction; completed links cannot replay; client admins cannot recover themselves or Global Admins; initial membership never restores old team/reviewer roles; password actions require confirmation, revoke sessions and cancel pending setup/reset links. SMTP remains unconfigured and no messages were sent.

## Remaining parity features
1. Finish client/team/member administration UI, platform administration and branding (core authority and client directory verified above).
2. Assessment builder, sections, matrices, assignments, publication and response/review.
3. Private files, scan quarantine, images and confirmed document extraction.
4. Onboarding, calendars, capacity, versioned plans and generation.
5. Learning delivery, submissions, reviews, appeals, KPIs and N+2 adaptations.
6. Notifications, provider/integration contracts and operations.
7. Full functional, PostgreSQL RLS/concurrency, browser/accessibility and visual parity verification.

Current application is NOT a feature-complete V2 copy. No backlog additions, source-data migration, remote publication or deployment. No human review or owner acceptance inferred.

Human technical/UX and owner acceptance is deferred until full V2.1 parity, explicitly authorized by the user on 2026-11-12. Continue implementation autonomously with one-feature automated QA, fixes and evidence. Do not ask again for between-feature human approval, and do not represent deferred reviews as completed.

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
Remaining identity parity: administrator-issued setup/reset links, invitations, scoped role allocation, hosted installer, full demo training scenarios and original platform redirect. These are not claimed by the current local setup.

## Remaining parity features — Not Started
1. Client/team/member authorization, role assignments, platform administration and branding.
2. Assessment builder, sections, matrices, assignments, publication and response/review.
3. Private files, scan quarantine, images and confirmed document extraction.
4. Onboarding, calendars, capacity, versioned plans and generation.
5. Learning delivery, submissions, reviews, appeals, KPIs and N+2 adaptations.
6. Notifications, provider/integration contracts and operations.
7. Full functional, PostgreSQL RLS/concurrency, browser/accessibility and visual parity verification.

Current application is NOT a feature-complete V2 copy. No backlog additions, source-data migration, remote publication or deployment. No human review or owner acceptance inferred.

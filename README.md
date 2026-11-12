# Training Assessment Tracker V2.1

Independent TypeScript port of the captured V2 working tree. **The full migration is not complete.** Current implementation: separate Next.js/NestJS/worker runtime, SQL/PGlite/PostgreSQL foundation, fresh local setup, password sessions, optional TOTP and one-use recovery codes. Effective client/team authority, client selection and the platform client directory are now implemented and locally tested. Remaining administration screens, identity links, branding, assessments, learning and integration workflows are not yet fully ported. See [feature checklist](docs/implementation/FEATURE_CHECKLIST.md).

## Local startup
Requirements: Node 24 (pinned in .node-version), npm and an available local port.

```powershell
npm ci
npm run dev
```

Open http://localhost:3100. First use opens setup. Enter your own administrator details and choose a separate password for fictional demo accounts. Three demo clients and 30 accounts are created; demo client roles, teams and reviewer allocations are seeded; full training workflows are still pending. No default password is supplied, logged or committed.

With DATABASE_URL absent, startup owns one persistent PGlite socket instance under .runtime/private, applies numbered migrations and launches separate web, API and worker processes. No V2 database, secret or private storage is used. Stop with Ctrl+C. A forced process termination can leave a lock; confirm the recorded process is no longer running before removing that exact .lock file. Never delete the database directory to resolve a lock.

## Configuration and boundaries
Copy .env.example to .env only when overriding defaults. DATABASE_URL selects PostgreSQL; MIGRATION_DATABASE_URL optionally supplies separate schema-owner credentials. Do not mix an external migration connection with local PGlite. The schema owner needs permission to create the restricted tracker_tenant role. Runtime privilege provisioning and hosted installation remain unqualified; do not deploy this partial application.

Local operation binds loopback. APP_ORIGIN controls origin checks. WEB_PORT, API_PORT, PGLITE_PORT and PRIVATE_STORAGE_PATH are configurable. Local encryption keys are generated under private storage; preserve them with the database. Production would require APP_ENCRYPTION_KEY, HTTPS, PostgreSQL and qualified private storage, but hosting and deployment are deferred.

Authenticators are optional for every account. Enabling one requires the current password and a valid code. Recovery codes are shown once, stored hashed and consumed once. Disabling requires password plus a code. Password changes revoke other sessions. Administrator-issued password reset/setup links and client invitations are not implemented yet.

## Verification
```powershell
npm run typecheck
npm test
npm run build
npm run test:postgres:local
npm run test:browser
npm run verify:baseline
```

The PostgreSQL helper creates a new isolated cluster under .runtime/postgres-tests and uses port 55440. It never resets an existing database, creates no system users/services and keeps the test directory for inspection. Windows test binaries are project-local.

npm test skips real PostgreSQL qualification unless TEST_POSTGRES_URL names a new empty database ending in _test. The separate PostgreSQL command exercises actual RLS/concurrent claims. PGlite passes do not substitute.

Install browser binaries locally before the first browser run:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.runtime/browsers'
npx playwright install chromium
npm run test:browser
```

Browser tests use isolated in-memory PGlite, separate storage and ports 3110/3111/55432. Normal local development remains persistent. Screenshots are in output/playwright; reports in playwright-report. CI configuration includes database, type, build and browser checks; no remote CI run is claimed.

## Interfaces and process commands
Implemented endpoints are documented in [OpenAPI](docs/openapi.json). Browser API requests use /api on the web origin; cookies are HttpOnly and mutations require origin plus CSRF checks.

After building, npm run start:api, npm run start:worker and npm run start:web are separate process commands. API health: /health/live and /health/ready (through web: /api/health/ready). Worker heartbeat is recorded in worker_heartbeats. Unknown job kinds fail closed; expired in-flight effects become uncertain and are never automatically repeated.

## Delivery status
Independent local Git repository; no remote configured, push or deployment. Existing V2 remains the working application. Human technical/UX review, owner acceptance and live-provider qualification are not recorded.

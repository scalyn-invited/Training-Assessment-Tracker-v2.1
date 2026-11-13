# Training Assessment Tracker V2.1

The captured implemented V2 application is ported to the stack in `tech-stack.md` and locally verified as of 13 November 2026. This independent copy includes the captured assessment work and preserves V2 unchanged. See the [feature checklist](docs/implementation/FEATURE_CHECKLIST.md) and [source parity audit](docs/implementation/PARITY_AUDIT.md) for feature coverage, test evidence and retained limitations.

Local verification covers the application workflows, isolated installation/upgrade/restart, PostgreSQL concurrency/RLS, native document processing and browser/accessibility checks. Human technical/UX and owner acceptance remain deferred; live adapters, paid provider calls, remote publication and deployment are not claimed. Backlog features and private V2 database migration are outside this port.

## Local startup
Requirements: Node 24 (pinned in .node-version), npm and an available local port.

```powershell
npm ci
npm run dev
```

Open http://localhost:3100. A fresh workspace opens the resumable local setup wizard. Choose local PGlite or an existing empty PostgreSQL database, enter your personal Global Admin details and choose a separate password for fictional accounts. Review before installation. Setup creates three demo clients, 30 synthetic accounts, team-scoped reviewer allocations, 21 training scenarios and 42 private synthetic evidence files, plus your separate personal administrator. Live services remain disabled. No default password is supplied, logged or committed.

Local PGlite persists under the installation's private directory. Setup saves each of 25 demo preparation steps; an interrupted step can be retried without replacing accounts or completed records. The API and worker start automatically after configuration is saved, and the wizard enables sign-in once the runtime is ready. Subsequent `npm run dev` starts the saved workspace and checks migrations without reseeding. Stop with Ctrl+C. A forced termination can leave a lock; confirm its recorded process is no longer running before removing that exact `.lock` file. Never delete the database directory to resolve a lock.

Existing legacy local workspaces retain their startup path. To explicitly prepare a legacy PGlite workspace for a **new, separate PostgreSQL workspace**, stop its runtime and run:

```powershell
npm run setup:upgrade:local -- --origin http://localhost:3100
npm run dev
```

Keep the console-issued one-hour token private and enter it in the local upgrade wizard. Preparation backs up the original environment configuration and retains the original encryption key, PGlite directory and private files. It does not transfer old training records. The upgrade wizard requires a separate empty PostgreSQL database, creates the fictional workspace and a new personal administrator there, and preserves unrelated environment settings. If a prepared local upgrade or hosted token expires, run `npm run setup:token` from that workspace to issue a replacement and revoke the previous setup owner. Completed installations cannot reopen setup. No V2 database, secret or private storage is used.

## Configuration and boundaries
Copy .env.example to .env only when overriding defaults. DATABASE_URL selects PostgreSQL; MIGRATION_DATABASE_URL optionally supplies separate schema-owner credentials. Do not mix an external migration connection with local PGlite. The schema owner needs permission to create the restricted tracker_tenant role. Installation-specific restricted roles are pinned in migration receipts. Hosting and production acceptance remain unqualified; deployment is outside this local parity verification.

Local operation binds loopback. APP_ORIGIN controls origin checks. WEB_PORT, API_PORT, PGLITE_PORT and PRIVATE_STORAGE_PATH are configurable. Local encryption keys are generated under private storage; preserve them with the database. Production would require APP_ENCRYPTION_KEY, HTTPS, PostgreSQL and qualified private storage, but hosting and deployment are deferred.

Authenticators are optional for every account. Enabling one requires the current password and a valid code. Recovery codes are shown once, stored hashed and consumed once. Disabling requires password plus a code. Password changes require confirmation and end all sessions. Administrators can issue one-use setup/reset links and invitations after current-password reauthentication; membership starts only after recipient acceptance. Setup/reset links expire after one hour and invitations after seven days. Links are shown once for manual private sharing; email delivery is not yet configured.

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

npm test skips real PostgreSQL qualification unless TEST_POSTGRES_URL names a new empty database ending in _test. The separate PostgreSQL command exercises actual RLS/concurrent claims. PGlite passes do not substitute. Local standalone database queries use explicit transactions to keep parameter bindings isolated across API and worker connections in the PGlite socket multiplexer. Configured PostgreSQL retains its ordinary connection pool; the local transport regression is covered in tests/pglite-multiplex.test.ts.

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

## Document parser qualification
`npm run test:documents:local` exercises actual PDF text extraction, image OCR, mixed-page rasterization/OCR and the page limit using original synthetic fixtures. The Windows helper expects isolated tools below `.runtime/document-tools`; it fails if they are missing. It does not configure the application scanner or bypass quarantine.

The local qualification used [Poppler Windows 26.09.0-0](https://github.com/oschwartz10612/poppler-windows/releases/tag/v26.09.0-0), extracted under `poppler-26.09.0`, and [Tesseract 5.5.3](https://github.com/tesseract-ocr/tesseract/releases/tag/5.5.3), extracted without running its installer under `tesseract-5.5.3`. Release SHA-256 values: Poppler `7a6f256a0ddf7536182246a5733331bf4677cbcc34f4663774947ad34556c8d0`; Tesseract installer `bee9e3434bd94fd65387d9be28cd467a41f61b1275383b55b0f59a1331270ae4`. The [official fast English model](https://github.com/tesseract-ocr/tessdata_fast/blob/main/eng.traineddata) goes in `tesseract-5.5.3/tessdata/eng.traineddata` (SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`). No system installation or PATH change is needed. See `scripts/document-tools-local.ts` for exact executable paths.

For another host, set `DOCUMENT_PDFINFO`, `DOCUMENT_PDFTOTEXT`, `DOCUMENT_PDFTOPPM`, `DOCUMENT_TESSERACT` and, when needed, `TESSDATA_PREFIX`; run `tests/document-native.test.ts` with `DOCUMENT_NATIVE_TESTS=1`. These checks do not qualify a production no-network sandbox, antivirus signatures or deployment. Production parsing requires `DOCUMENT_SANDBOX_WRAPPER`; original files, extracted drafts and human confirmations remain separate.

N+2 adaptation and provisional KPI support are locally verified, including source invalidation, human approval, private coordinator review and worker execution. See the primary feature checklist for evidence and remaining parity work. The full port and deferred human acceptance are not complete.

## Training notifications
Training updates and preferences are available at `/notifications`. Test/synthetic recipients use a non-delivering status sink; live email stays disabled by default. Production SMTP configuration uses `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, optional `SMTP_USER`/`SMTP_PASSWORD`, and an HTTPS `APP_ORIGIN`. These placeholders do not authorize live delivery. Transport follows [Nodemailer's SMTP options](https://nodemailer.com/smtp) with mandatory TLS and bounded timeouts. Explicit transient rejections retry at most four times; unknown or interrupted sends remain ambiguous. Relay acceptance does not establish inbox delivery. Account-link email delivery is tracked separately.

Account-link email additionally requires `ACCOUNT_MAIL_ENABLED=true` and an exact comma-separated `ACCOUNT_MAIL_RECIPIENTS` allowlist. The optional control requests synchronous delivery at issuance; raw links never enter the outbox or audit. Synthetic recipients remain blocked from SMTP. Disabled, unapproved or uncertain delivery preserves private manual sharing and does not consume the link. Tests use fake transports and do not verify inbox delivery.

The delegated integration contract endpoints are `/v1/me/training`, `/v1/members/:memberId/summary` and `/v1/training/changes` (under `/api` through the web proxy). They require a signed bearer credential, the matching operation scope and `X-Client-Id`. The captured V2 adapter is a synthetic local/test harness, disabled by default through `MOCK_IDENTITY_ENABLED=false`; it is not a live identity provider. Enabling the harness also requires `TRAINING_AUTH_MODE=mock`, `TRAINING_ENVIRONMENT=test` and a non-production development/test process. Immutable mapped identities, exact audience/client, expiry, permission version and freshness are verified. Synthetic and local-only records never enter external results. History before linking is excluded unless explicitly approved for export. No production identity or Cerebru adapter is inferred.

Local integration rehearsal commands:

- `npm run integration:local -- directory-import <event.json> <client-id>` applies one synthetic directory event. The same harness gates apply. Imported people receive no sign-in identity, client membership or role automatically.
- `npm run integration:local -- mock-token <fixture-email>` emits a five-minute local credential for an explicitly mapped fixture. Treat its output as a credential; the default scopes deliberately exclude the approved-change feed.

Directory person mappings are client-scoped in `directory_people`. `directory_memberships` records explicit imported group mappings separately from application-owned `client_team_memberships`; importing a re-entry cannot reopen ended application permission periods. Pages advance their cursor only after every event commits. Semantic duplicate events are harmless, conflicting duplicates are rejected and stale entity versions cannot reactivate people. Source-aligned directory deactivation invalidates sessions and ends roles/allocations; it does not erase training history. No live directory connector is configured.

Client administration includes promotion preparation, a scoped promotion ledger, explicit dispatch/reconciliation and separate historical-export authorization. Requests pin and encrypt the identity payload, retain the original idempotency key and use durable worker dispatch. Unknown results remain ambiguous; a duplicate primary mapping requires review. A verified acknowledgement links the member with historical export disabled. `PrimaryPlatform` deliberately remains unconfigured until the actual Cerebru contract is supplied, so sending through the default adapter returns to Prepared locally without a network call. Synthetic people are ineligible; isolated real-classified example.invalid fixtures qualify the contract only.

Mock browser sign-in uses the same explicit harness flags. `/auth/sign-in-options` exposes only available synthetic identity names/IDs; `/auth/mock-login` requires session CSRF and pins the chosen identity. Real accounts cannot use mock sign-in. Mode changes, identity revocation, permission changes and session expiry invalidate access. Local password/MFA and account-link actions are unavailable in mock mode. Run the isolated real-API selector journey with `npx playwright test --config playwright.mock.config.ts`; run it separately from the ordinary browser journey because both use the isolated browser ports.

Operational commands use the configured database and private storage: `npm run operations -- health` reports counts, heartbeat age and launch gates without assessment bodies; it exits nonzero for stale components or failed jobs. The worker records its own heartbeat. Configure the chosen host scheduler to run `npm run operations -- heartbeat` every minute and `npm run operations -- ai-prune` daily; no host scheduler has been installed by this port. Pruning removes temporary terminal AI input/output/feedback older than 30 days, excluding active legal holds and queued/running/ambiguous runs. Billing and approved training records remain.

`npm run operations -- retention` is a dry-run of the source 24-month evidence policy. Applying requires both `RETENTION_APPROVED=true` and `retention --apply`; leave it disabled until policy approval. Scoped administrators can create legal holds through the domain service, as in V2. Holds serialize with retention and exclude their enrolments. Durable immutable deletion receipts precede physical removal; derived extraction and confirmation text is redacted while attribution remains. `npm run operations -- reapply-deletions` safely retries interrupted removal. After restoring a backup, restore the durable deletion ledger and run replay successfully before exposing the application. A mismatched storage-key hash is preserved for investigation, never used to delete another object. Health metadata and local tests do not establish live provider or host readiness.


## Hosted installation
Use a fresh application directory and a separate empty PostgreSQL database. Do not run the ordinary API or migrations first. Keep `.runtime/installation` private and persistent; its encrypted setup sessions, ownership state and configuration backup are required for interrupted setup. An existing application key, private workspace or unowned database fails closed.

From the application root run `npm run setup:prepare -- --origin https://your-application-host`. Enter the console token only at `/setup/hosted`; it expires after one hour. Running preparation again replaces the token and revokes the previous setup owner. Start `npm run setup:serve` (or `npm run start:setup` after building), plus the web process with `API_INTERNAL_ORIGIN` pointing at the setup API. Preserve the exact external host and HTTPS protocol through the reverse proxy. Forwarded headers are rejected unless `SETUP_TRUSTED_PROXY` is the exact immediate proxy IP; that proxy must overwrite client-supplied forwarding headers. Direct setup API TLS accepts paired `SETUP_TLS_KEY` and `SETUP_TLS_CERT` paths. Hosting and proxy provisioning remain operator choices.

The wizard checks requirements and database ownership, creates a personal production Global Admin and saves configuration without fictional records. The PostgreSQL connection needs permission to create the schema and an installation-specific restricted tenant role. `DATABASE_TENANT_ROLE` is pinned in migration receipts; retain its generated value. Different installations can share a PostgreSQL cluster with separate databases and roles. Existing default-role installations remain supported.

Review before installing. A failed stage resumes with the original database and administrator details; it never replaces an existing administrator password. Protected conflicting process environment values must be resolved before installation. The original `.env` is backed up privately and unrelated entries preserved. Completion closes setup; stop the setup API, then start the ordinary API and worker using the generated configuration. AI, SMTP, account email, mock identity and retention application remain disabled. No hosting, live delivery or production acceptance is implied.

`npx playwright test --config playwright.installer.config.ts` qualifies the isolated HTTPS wizard against real PostgreSQL, interruption recovery and subsequent administrator sign-in. It uses ports 3120/3121/3122 and PostgreSQL port 25441 (override the latter with `TRACKER_INSTALLER_POSTGRES_PORT` if occupied), a temporary self-signed certificate and synthetic private credentials. Run separately from other browser suites.

Local bootstrap browser qualification uses `npx playwright test --config playwright.local-installer.config.ts` (ports 3130/3131/55442). Explicit legacy upgrade qualification uses `npx playwright test --config playwright.local-upgrade.config.ts` (ports 3140/3141/55443). Both create isolated runtime directories; run browser suites separately because they share the Next development build directory.


## Separate fictional mock demo

The optional mock demo is a separate disposable workspace, not the personal-password local installer. From the project root, create a new directory below `.runtime/realistic-demo-<name>` with a `private` child. Save an isolated environment file there with the following values, replacing `<absolute-demo-root>` with that directory (use forward slashes in Windows paths):

```dotenv
NODE_ENV=development
TRAINING_ENVIRONMENT=test
TRAINING_AUTH_MODE=mock
MOCK_IDENTITY_ENABLED=true
TRAINING_DEMO_ENABLED=true
TRAINING_DEMO_ROOT=<absolute-demo-root>
TRAINING_DEMO_DATABASE=<absolute-demo-root>/private/pglite
PRIVATE_STORAGE_PATH=<absolute-demo-root>/private
SETUP_APP_ROOT=<absolute-demo-root>
DATABASE_URL=
MIGRATION_DATABASE_URL=
AI_LIVE_ENABLED=false
AI_ANTHROPIC_ENABLED=false
AI_GEMINI_ENABLED=false
SMTP_ENABLED=false
ACCOUNT_MAIL_ENABLED=false
RETENTION_APPROVED=false
WEB_PORT=3150
API_PORT=3151
PGLITE_PORT=55445
APP_ORIGIN=http://127.0.0.1:3150
```

In PowerShell, set `$env:DOTENV_CONFIG_PATH` to that environment file, then run `npm run demo:seed -- --database <absolute-demo-root>/private/pglite`. The explicit database argument must match the configuration. This creates three fictional clients, 30 mock identities, 21 training scenarios and 42 private synthetic evidence objects. It creates no personal or platform administrator. The console reports non-sensitive progress. An identical replay adds no records; changed source, records, evidence or partial generation is refused. Preserve the existing workspace for inspection and use a fresh disposable directory instead of deleting its manifest or overriding its locks.

Optionally run `npm run demo:global-admin -- --database <absolute-demo-root>/private/pglite --check`, then the same command without `--check`, to create the explicitly fictional Alex Rowan platform identity. Repeating the extension is harmless only while its account and authority remain valid; it never repairs revoked privileges automatically. The extension preserves the original base manifest, so subsequent base seeding intentionally refuses its changed database snapshot. Start `npm run dev` with the same environment-file selection and choose a synthetic identity at sign-in. Stop the app before running either command because they exclusively own the local database. Keep the original private encryption key.

PostgreSQL fixture generation is restricted to an explicitly configured database whose name ends in `_test`, with `NODE_ENV=test`, the same isolated private-root guards and no separate migration connection. On a cluster with other installations, configure a new `DATABASE_TENANT_ROLE=tracker_tenant_<12 hex characters>` for this database; retain it for subsequent runs rather than reusing another installation's restricted role. It is a qualification path, not hosted demo provisioning. Live AI, SMTP, account email and retention application must remain disabled in either mode.

`npx playwright test --config playwright.realistic-demo.config.ts` creates a fresh isolated persistent PGlite demo, exercises CLI replay and the explicit extension, then starts the ordinary application and checks both client and Global Admin mock sign-in. Run it separately from other browser suites.


Training records open at `/enrolments/<id>`. Team summary access remains separate from detailed training, supporting evidence and sensitive assessment authority. Evidence uploads stay quarantined until the configured scanner approves them; the record page does not bypass scanning.

The record page can queue a local foundation check. Its exact request key prevents duplicate jobs after a lost response; the worker rechecks actor/client access and the requested record version before atomically recording a non-delivering receipt. Recent receipts are private to their requesting actor. The worker retries this local transaction at most three times and safely recovers expired leases; this recovery rule does not apply to external provider effects. Run `npx playwright test --config playwright.workspace.config.ts` separately from other browser suites to qualify record access, error recovery, duplicate request handling, evidence quarantine/download and mobile accessibility. The browser's clean-file state is an explicit isolated fixture, not qualification of a production antivirus scanner.

## Operator bootstrap commands

These commands port the source operator entry points. They do not reset existing accounts or bypass lost-administrator recovery. Apply numbered migrations to the intended database first (`npm run db:migrate`); use the configured workspace encryption key and private storage. The ordinary local PGlite runtime must already be running when a command targets that workspace.

For an existing active identity, appoint only the first Global Admin:

```powershell
npm run training:global-admin -- USER_UUID --environment test --operator "Operator reference" --reason "Reason for first administrator appointment"
```

Use `--environment production` only for an explicitly configured production workspace. Repeating the same effective administrator is a no-op; once another Global Admin exists, further appointments must use platform administration. For an existing synthetic Global Admin whose local password has never been enabled:

```powershell
npm run training:local-setup -- USER_UUID --operator "Operator reference" --reason "Initial synthetic administrator password setup"
```

The setup command grants no privileges. It prints a private one-use link, valid for one hour. Reissue revokes the earlier link. Keep that output out of shared logs and reports.

### Empty production database initialization

Both production commands require `NODE_ENV=production`, `TRAINING_ENVIRONMENT=production`, `TRAINING_AUTH_MODE=local_password`, an explicit PostgreSQL `DATABASE_URL`, `APP_ENCRYPTION_KEY` and private storage configuration. Mock identity must remain disabled. There must be no existing users, role assignments or clients. The initializer creates one real, local-only administrator with no enabled password and no client membership.

For hosted password login, configure `TRAINING_INSTALL_MODE=hosted` and an HTTPS `APP_ORIGIN`, then run:

```powershell
npm run training:initialize-production -- --name "Administrator name" --email "administrator@example.org" --operator "Operator reference" --reason "Initialize the reviewed empty production database" --json
```

For the explicit localhost-production profile, the new stack uses PostgreSQL in place of the source SQLite database. Configure a loopback database host, set `TRAINING_LOCAL_PRODUCTION=true`, and set `TRAINING_LOCAL_PRODUCTION_DATABASE` to the exact designated database name. Connection-string query overrides are refused for this profile. Use a loopback `APP_ORIGIN`, such as `http://127.0.0.1:3100`, and a distinct `API_PORT` (3101 by default):

```powershell
npm run training:initialize-local-production -- --name "Administrator name" --email "administrator@example.org" --operator "Operator reference" --reason "Initialize the designated empty local production database" --json
npm run build
npm run start:local-production
```

Build with `API_INTERNAL_ORIGIN` matching the configured loopback API port. The launcher verifies that compiled route, binds web/API to loopback and starts the separate worker. It does not migrate, reseed or create accounts. Its built-in listener serves local HTTP; HTTPS requires a separately qualified local TLS proxy. Ordinary production continues to require HTTPS. The local API rejects non-loopback transport, host names and forwarded addresses.

JSON output contains only the private setup URL. The same name/email can reissue setup while the recorded first administrator remains the sole current Global Admin and has no enabled password. A changed identity, revoked grant, completed password setup or an unrelated populated database closes this path. Complete the private link in the browser, then sign in and create the first client through platform administration. These commands are implementation tooling; local qualification does not authorize deployment or real production execution.

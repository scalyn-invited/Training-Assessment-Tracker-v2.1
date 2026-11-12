# Technology Stack

A reusable technology stack reference for web applications with a separate frontend, API and background worker. Adapt versions, integrations and security requirements to the intended deployment.

## Core stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Runtime | Node.js | Application runtime. Pin the selected version in the runtime configuration. |
| Package management | npm workspaces | Manage workspace packages and dependencies. Versions are governed by `package.json` and `package-lock.json`. |
| Web application | Next.js | Web application running as a separate process. |
| API | NestJS | API running as a separate process. |
| Background processing | Separate worker process | Process background work using a transactional outbox for durable job records. |
| Configured database | PostgreSQL | Used when `DATABASE_URL` is set. |
| Local database | PGlite | Used locally when `DATABASE_URL` is absent. |
| Database migrations | Numbered SQL migrations | Apply database changes without editing previously applied migrations. |

## Architecture and security

- Separate Next.js web, NestJS API and worker processes.
- Framework-independent domain logic and shared contracts.
- PostgreSQL row-level security (RLS) for applicable database access boundaries. PGlite alone does not establish RLS correctness.
- Password authentication with time-based one-time passwords (TOTP) for multifactor authentication.
- Transactional outbox for durable background effects and safe retries.
- Permission and scan-state checks for file access, using a selected file-scanning provider.

## Optional integrations

| Integration or capability | Purpose |
| --- | --- |
| Cloudflare | DNS, content delivery and edge security. |
| SMTP | Outbound email; use a local mail sink during development. |
| Google Drive | Cloud document and file integration. |
| Nextcloud | File storage and collaboration integration. |
| Identity provider | External authentication or single sign-on. |
| AI provider | Permission-scoped assistance using a selected model and provider. |

## Local verification

Define the corresponding scripts in `package.json`, then run from the repository root:

```bash
npm ci
npm run typecheck
npm test
```

Passing these checks does not establish browser acceptance, provider readiness or deployment.

## Configuration choices

Select the programming language, CSS framework, UI component library, ORM, test framework, worker framework, file scanner, AI provider and hosting platform as needed. Pin framework and dependency versions in `package.json` and `package-lock.json`.

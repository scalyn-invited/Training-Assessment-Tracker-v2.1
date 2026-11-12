# V2.1 implementation guide

This project ports the captured V2 working tree to tech-stack.md. Read docs/implementation/FEATURE_CHECKLIST.md before work. Work on one bounded feature at a time: implement, test, fix/retest, record evidence, then continue. The source baseline records uncommitted changes intentionally included in scope.

Read DESIGN.md before UI changes. Preserve V2 appearance and workflows; use UX Engine. Do not implement backlog features or relax approval, permission, scan-state, immutable-record, budget or N+2 rules.

Keep V2 untouched. Never copy credentials, databases or private files from V2. Isolate test databases and storage. No remote push, deployment, live emails or paid AI calls without authorization. Do not infer human reviews or owner acceptance. Current automated tests do not prove unported functionality.

Hosting is undecided. Use configurable separate Node processes, PostgreSQL, private persistent storage and health checks. PGlite is local only; PostgreSQL is required for RLS/concurrency qualification.

Human technical/UX and owner acceptance is deferred until full V2.1 parity, explicitly authorized by the user on 2026-11-12. Continue implementation autonomously with one-feature automated QA, fixes and evidence. Do not ask again for between-feature human approval, and do not represent deferred reviews as completed.

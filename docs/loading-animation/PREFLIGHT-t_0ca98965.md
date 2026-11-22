# Actual-app preflight — t_0ca98965

## Decision / next owner

**Inventory complete; reconciliation should be a NO-OP. Do not repeat the rollout or restart.** The reported base is historical, not current. Next owner is integration card `t_4e1cf4b3` (consume independent lineage verdict `t_07c65872` before disposition), then independent verification `t_7b33ab54` and parent/default `t_a9d4c15b`. This report is not final rendered acceptance.

Actual root: `C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1`. URL: http://localhost:3100. Branch **ui/global-design-system**; HEAD **ff493ddbd8ad54b0535f1ca436e3233e9afa40fc**. Original base **ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e** is an ancestor. Current apps/packages equal approved product **bf3befe015e33d5584dcaec53d372ce5916463b9**. Exact commit chain is captured in `PREFLIGHT-STATE-t_0ca98965.json`; it contains the loading implementation, focus correction, QA and review evidence. API, worker, packages/migrations, dependency manifests and dev launcher are unchanged from the base. Literal `main` is a separate ref and is not a destination.

## Fresh commands and evidence

Run from the actual root; no stop, cache change, merge, checkout, reset, clean, install, migration, fixture, account mutation, push or deploy occurred.

- `git status --short --untracked-files=all`, `git branch --show-current`, `git rev-parse HEAD`, `git worktree list --porcelain`: exit 0; tracked working/index state clean, multiple existing untracked worktrees and documentation retained. Exact paths and refs are captured rather than treating untracked as disposable.
- `git merge-base --is-ancestor ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e HEAD`: exit 0.
- `git log --oneline ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e..HEAD` and base-to-HEAD `git diff --stat`: exit 0, loading product/tests/evidence delta; full SHA log in JSON.
- `git diff --exit-code bf3befe015e33d5584dcaec53d372ce5916463b9 HEAD -- apps packages`: exit 0.
- `git diff --exit-code ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e HEAD -- packages apps/api apps/worker scripts/dev.ts package.json package-lock.json`: exit 0.
- `git diff --check` and inventory's `git diff --exit-code HEAD`: exit 0.
- `python docs/loading-animation/preflight-t_0ca98965.py docs/loading-animation/PREFLIGHT-STATE-t_0ca98965.json`: exit 0 at **2026-11-22T04:43:42.009781+00:00**. All recorded process birth/cwd/command/parent/listener identities match the prior rollout; 1394 existing backup hashes and 8 protected configuration/asset hashes verified. API live/ready, web proxy ready, and login HTML all HTTP 200. Not browser rendering proof.
- `node docs/loading-animation/preflight-schema-t_0ca98965.mjs`: exit 0; rerun with output redirected to `PREFLIGHT-SCHEMA-t_0ca98965.json` also exit 0. Explicit `BEGIN READ ONLY`/`ROLLBACK`, schema receipts only: 33 source migrations / 33 receipts; no pending, unknown or hash-mismatched migration; default tenant role matches. No account rows queried.
- An optional `python -c` summary probe was rejected by unattended execution policy (exit -1); it did not execute. No approval setting changed. Existing JSON was inspected with read_file instead. The standalone schema rerun above was a separate command.

Initial fingerprint SHA256: `5f428ae483d6c4ec49983d242b2a89c7800c652ce0711b62c3a7444f1599efcd`.
Tracked-content aggregate SHA256: `d860f0325c13fc6544b66e510d26206568d4638cf404407e2dd8af529e787cd6`.

The reproducible Python probe refuses to overwrite its output. Before any future mutation, run it with a NEW evidence filename and compare structured fingerprint fields, not just the aggregate: branch/SHA, tracked content, refs, worktrees, process births/cwds/commands/parents, config aggregate and existing untracked-document hashes. Expected additions from this preflight are its scripts, schema/state JSON and report. A later capture necessarily includes earlier evidence; explain additions explicitly. Any changed pre-existing document or source/process identity requires reconciliation, not reset. It deliberately does not traverse other worktrees or hash mutable live database bytes. Other worktrees are inventoried, not certified clean.

## Process ownership / startup

All executables are `C:/Program Files/nodejs/node.exe`; exact native argument arrays and birth timestamps are in the fingerprint.

| Role | PID / parent | cwd | command arguments | listener |
|---|---|---|---|---|
| Dev supervisor / PGlite | 14456 / 43640 | app root | `--import tsx scripts/dev.ts` | 127.0.0.1:55431 |
| API | 31152 / 14456 | app root | `--import tsx apps/api/src/main.ts` | 127.0.0.1:3101 |
| Worker | 45080 / 14456 | app root | `--import tsx apps/worker/src/main.ts` | none |
| Next launcher | 9368 / 14456 | apps/web | absolute `node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100` | none |
| Next server | 22308 / 9368 | apps/web | absolute `node_modules/next/dist/server/lib/start-server.js` | 127.0.0.1:3100 |

All five retain false AI_LIVE_ENABLED, AI_ANTHROPIC_ENABLED, AI_GEMINI_ENABLED, SMTP_ENABLED, ACCOUNT_MAIL_ENABLED and RETENTION_APPROVED. DATABASE_URL is unconfigured and effective private path is `.runtime/private`. No connection string, encryption key, environment-file content or account data is published.

`package.json` defines `npm run dev` as `tsx scripts/dev.ts`. The existing persistent launch is the equivalent `node --import tsx scripts/dev.ts`, prior terminal handle `proc_c9585ca999e8`, with `persist_on_release=true`, log `.runtime/loading-main-server.log`. This report independently rechecks the same live process identities after the earlier worker exit; it does not claim reboot persistence or a Windows service. `scripts/dev.ts` owns PGlite and starts API/worker/Next, closes DB/socket/lock on shutdown, and propagates a child exit to supervisor shutdown. Do not independently restart a second supervisor while its DB lock/listeners are alive.

## Storage / preservation scope

Relative to app root:

- `.env`: protected configuration; preserve content privately without displaying values.
- `.runtime/private/pglite`: actual local database, owned by supervisor on 55431; `.runtime/private/pglite.lock` is its ownership lock, NOT a cache.
- `.runtime/private`: private encryption material, branding and uploads. Source consumers allocate `branding`, `evidence`, `assessment-media`, `extraction-work` beneath this root; these are possible configured subdirectories, not an assertion that each currently contains files.
- `.runtime/installation` and `.runtime/installations`: protect if present; launcher also supports installation-specific paths. Current effective process path is the default above.
- `.runtime/loading-backup-t_a9d4c15b/data/`: prior cold backup; private `preservation.json` retains per-file hashes. Verified backup integrity is not proof that it includes later user writes. Never attach/commit backup or per-user records.
- `apps/web/.next`: regenerable Next cache only; old moved cache is within the existing backup. No need to touch either now.
- All existing `docs/fouc-main-integration/`, `docs/latest-ui-integration/`, `docs/loading-animation/ROLLOUT*`, `docs/main-branch-integration/` untracked documents and nested/external worktrees remain protected. The state JSON records their exact status/hash map.

## Conditional plan if a future accepted change truly needs rollout

1. Re-read current approved lineage, this fingerprint and ongoing-work status. Do not assume card completion equals approval. If current source already matches (as now), record no-op and advance to verification without stop/cache/merge.
2. If source diverges, stop planning mutation and reconcile in an isolated integration worktree with fresh QA/review. Preserve current-only work and all docs; never force/reset/clean or switch the actual app to literal main. No fixture/runtime copy into the app and no new dependencies.
3. Before authorizing any necessary stop: capture fresh SHA, refs, tracked diff, untracked-document hashes and exact PID births/parents/listeners; privately back up/hash configuration and non-DB assets, verify existing backup integrity, and arrange a consistent database backup/maintenance window. Do not claim an arbitrary hot filesystem copy of PGlite is consistent. The existing cold backup is verified but may be stale. If a fresh *pre-stop* consistent backup is required, obtain a supported logical/snapshot procedure first; this preflight has not qualified one, so that is a stop blocker. No stale lock deletion or killing unidentified processes.
4. If an approved maintenance window permits the project's prior cold-copy method: close only the reidentified app tree through its supervisor lifecycle, wait for all owned processes/listeners to exit and PGlite close/lock release, then make a new uniquely named cold backup of current DB plus protected paths and verify every copied hash before changing source/cache. Do not rerun `.runtime/loading-preserve.py`: it is hard-bound to old base/PIDs and an existing backup destination. Never overwrite the previous backup. No need to execute this now.
5. Only after that preservation gate, use reviewed exact fast-forward where applicable; if it does not fast-forward, return to isolated reconciliation. Move aside only confirmed non-link `apps/web/.next`, with its owner stopped, into a unique private backup location. Do not remove browser data, node_modules, upload directories, locks or other worktree caches.
6. Recheck receipt hashes, missing/pending/unknown migrations and tenant role against the accepted source **before** launch: dev startup calls `migrate`, which can execute pending SQL. Health 200 does not waive this check. Any new/mismatched migration requires separate authorization/qualification; no destructive migrations here.
7. Persistent restart, only if needed: from the same app root use `node --import tsx scripts/dev.ts` through the supported persistent terminal mechanism (`background=true`, `persist_on_release=true`), using existing configuration/storage, with all six safety flags explicitly false in the launch environment. Do not reproduce or print secrets. Record new handle/PIDs/births and log. Never use a worker-bound foreground server or start setup/seed/demo commands.
8. Read back exact process cwd/command/ports/flags, schema and HTTP/CSS health, private config/backup hashes; independently verify survival after launch worker exits. Qualify accepted tests only in isolated storage/ports, not this main DB. Parent verifies authenticated rendered transitions using authorized owner Chrome tools only.

## Rollback

No rollback is needed because this task did not change runtime/source. For a future failed rollout, preserve its diagnostics and new writes; stop only its proven process tree, reconcile source back to the last accepted compatible revision via a reviewed non-destructive change (not hard reset), regenerate only cache, and restart using the same existing data. Never automatically restore the historical DB backup over later writes. A restore requires a fresh backup of current state, explicit data-loss/consistency assessment and owner authorization. Original historical SHA/backup remain available; they are not permission to rewind.

## Final readback

Final `git diff --exit-code HEAD && git diff --check && git status --short --untracked-files=all` returned exit 0 with no tracked changes. The concurrent lineage worker added `docs/loading-animation/INTEGRATION-ELIGIBILITY.md`; preserve it and include it in the next fingerprint rather than treating this expected parallel addition as disposable. The manifest patch reported a concurrent-edit warning; readback confirmed the new namespaced preflight entry and retained existing rollout/final-gate fields. No full-file overwrite was used.

## Gates / limitations

- Source/runtime already rolled out. Remaining final gate is authenticated temporal/rendered verification, not another integration. Parent history records `no_browser` in worker sessions; this inventory did not attempt a browser or use an alternative. Use owner Chrome `tab_create` then `tab_snapshot`; secure sign-in only if the fresh authorized tab actually needs it. A settled login snapshot is not temporal proof.
- Recheck same-workspace retained chrome, initial session/refresh, neutral scope switch/atomic reveal, sign-in validation/transition, approximately 3000ms contextual text, actionable failures, focus/reduced motion, account themes and both popovers at desktop/tablet/mobile. Do not mutate real records to exercise builder saves; retain isolated evidence.
- Earlier typecheck/policy/build/browser results are historical evidence, not rerun claims here. Historical full first-paint remains 22 pass / 1 superseded-contract assertion failure, not suite-green. TDD applies if product corrections become necessary; no product code changed in this inventory.
- Read AGENTS.md, DESIGN.md, relevant FEATURE_CHECKLIST entries, profile TDD/loading-gates skills and shared integration/reference, state-completeness, responsive and browser-policy skills. The project-local UX Engine path was absent; shared skills were read instead. The explicit Chrome-only owner policy overrides the shared browser skill's general Playwright default.
- Process identity plus on-disk source does not prove in-memory module equality or authenticated behavior. No full accessibility, PostgreSQL RLS/concurrency, whole-app parity, human acceptance or production-readiness claim.

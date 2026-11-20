# Frontend correction handoff — t_7f911447

## Status / exact scope

**Frontend correction stage complete; candidate NOT accepted.** Implementation/tests/evidence commit: **35f760d44667e06e3ede9d1dd94cd61ea2ed7c61**, based on QA evidence `066195288b0b437e825c8e84607b4611f2bbb727`. A subsequent documentation-only commit carries this handoff and original-trace readback. Branch `feature/assessment-workflow-improvements`; isolated worktree only.

Production change: `apps/web/app/components/assessment-builder/builder.js` (six added lines, one replaced line). Other additions are under this directory. No API/domain/schema/authority changes. Original independent-QA negative, source harness and evidence remain byte-for-byte unchanged according to Git diff. Existing untracked upstream artifacts were neither staged nor removed. Build-generated `apps/web/next-env.d.ts` changes restored to original imports and web typecheck rerun successfully.

Read root/web AGENTS, DESIGN, checklist opening/final-status and assessment ledger, authoritative approved workflow-proposal and root final-review read-only, original QA handoff and exact commit stats. Loaded TDD, systematic-debugging, dogfood; **ux-engine and playwright skills unavailable**, not claimed loaded. Actual installed Playwright executed. Reviewer was parked with no active execution; backend and QA remain dependency-gated.

## D03 correction and safety

Root cause: changed-version draft readback fell through to the unknown-outcome branch, retaining `publication` and never exposing comparison. The user could neither use the promised comparison nor normal guarded recovery.

Now an authorized exact-ID readback with `status=draft` and a newer optimistic version clears only the publication uncertainty, sets conflict and exposes the existing structured comparison. It does **not** adopt server version/content into the local draft. Save/Publish remain stopped. Comparison performs a fresh authorized GET; denied/unavailable responses show no saved snapshot or discard control. Existing explicit confirm/discard/reload is reused. Conflict is also registered as retained work, so ordinary navigation requires discard confirmation rather than silently losing the local version or remaining permanently blocked as unknown.

No force save, automatic retry, republish, new revision, export, storage persistence or permission weakening. Lower/unrecognized readbacks stay unknown. The existing published, same-version-draft, denied and unavailable behaviors and exact-operation save replay are unchanged. Integrated tests confirm one publish POST at exact ID/version1, complete local snapshot retained, and authorized version2 loaded only after explicitly accepted document reload.

## Actual RED → GREEN and regressions

Command prefix below: `node docs/assessment-workflow-implementation/correction-frontend/run.cjs` from the isolated worktree. Output logs are in this directory.

| Command suffix | Actual outcome |
|---|---|
| `browser d03-red --grep QA-D03` | RED: 1 failed, missing Compare button (exit1), before production change |
| `browser recovery-red --grep 'D03 recovery'` | RED: both409/lost-response cases failed on incorrect unknown status (exit1) |
| `browser d03-green --grep D03` | 9 passed,47.0s (exit0), including original negative and all D03 positives |
| `browser guard-red --grep 'D03 recovery'` | RED: both cases navigated without discard confirmation after uncertainty cleared (exit1) |
| `browser browser-green` | **25 passed**,1.8m (exit0): inherited22 unchanged cases, original negative, two expanded recovery cases |
| `build-web build-web` | optimized Next16.4.6 build passed,25 static pages (exit0) |
| `web-typecheck web-typecheck` / `typecheck typecheck` | both exit0 |
| `web-typecheck web-typecheck-final` | exit0 after restoring generated imports |

New component recovery cases exercise409 and dropped response, stopped writes, ordinary-link cancel, denied/unavailable comparison, complete local structured data (ID/version/title/sections/questions/criteria/keys), authorized comparison, canceled discard retention and accepted reload without a second mutation. Separate real Next recovery cases prove actual document reload remounts the authorized newer draft, rather than only asserting a reload event. Learner initial autosave test passed unchanged; no data-loss finding or assertion weakening.

## Real Next navigation diagnosis and verdict

**Integrated built-runtime navigation requalified, not replaced with component testing.** No navigation assertion or60s deadline increased. `next-tests/navigation.spec.ts` preserves original assertions (only screenshot destination differs).

1. Original preserved `next-first` and `next-serialized` trace ZIPs were read directly using `inspect-original-traces.py`: exact builder RSC remains status-1/time-1 in both; see `original-trace-readback.json`. They do not include sufficient server timing to prove the exact cause of every historical timeout.
2. Unchanged dev-server baseline: `next next-baseline` passed once,2.4m total. This was not treated as proof of a fix.
3. `next next-repeat --trace on --repeat-each 2`: cold test failed at the same60s initial-builder assertion; second warm test passed26.0s; overall exit1. Preserved in `navigation-evidence/cold-red-warm-green/`. Server trace shows **47,041.854ms** builder compile span. Compiling a dynamic builder was not covered by readiness for `/assessments`.
4. Added server stdout/stderr capture only. `next next-diagnostic --trace on --repeat-each 2`:2 passed,2.3m. Log exposes cold builder GET30.0s, of which27.9s Next compilation, versus warm builder843ms. This establishes a material lazy-compilation cost in this harness; it does not retrospectively explain every millisecond of the old pending request.
5. Corrected qualification harness to **explicit optimized build, then real `next start`**, separating compiler readiness from route assertions rather than raising test timeouts or pre-serving fake RSC. Launcher probes free3275, refuses env files, allowlists process environment, disables adapters and uses no API/DB/worker. No application router fix was justified.
6. `next next-built --trace on --repeat-each 3`: **3 passed**,19.2s total; individual navigation4.4/2.8/2.3s. Original clean same-document navigation and dirty sidebar/history cancellation all exercised.
7. Fresh process `next next-integrated --trace on`: navigation plus409/lost-response real reload recovery **3 passed**,32.8s.
8. Another fresh process `next next-final --trace on`: same3 passed,27.1s; lost-response recovery at375px and comparison no-horizontal-overflow checks included. Final traces/results: `navigation-evidence/final-green/`.

**Evidence interpretation:** cold dev compiler behavior remains timing-sensitive and is not claimed fixed in Next itself. The qualification-harness cause addressed is starting timed route checks before that route is compiled. Built-runtime tests directly exercise real RSC, real router, production builder, guard and document reload. Earlier failures remain preserved, not waived; independent QA must rerun the corrected built harness. `server-trace.jsonl` in built/integrated/final directories is the last **dev** trace copied by the generic preservation helper, NOT a production timing trace; use their Playwright traces and result.json for built-runtime evidence.

## Screenshots / UI

Fresh screenshots under `screenshots/`. Inspected actual desktop409 canceled-comparison image (including original-resolution crop): explicit stopped conflict, version1 retained, visible Compare and private structured snapshot notice. Inspected desktop recovered screenshot: newer title, edit version2, draft-not-published and enabled Save. Inspected375px lost-response recovered image: provenance wraps, title/control visible. No page-level horizontal overflow in desktop/mobile comparison assertions. Full-page comparison screenshot includes scroll/sticky-layout whitespace; not a claim of comprehensive visual certification. Native confirm dialogs use existing keyboard/focus behavior; no screen-reader/full WCAG qualification performed.

## Reproduction and handoff

Do **not** rerun original independent-QA `prepare.cjs`: it overwrites its appended negative. This directory's preparation script refuses overwriting existing files; delivered tests are already prepared.

```sh
node docs/assessment-workflow-implementation/correction-frontend/run.cjs browser independent-rerun
node docs/assessment-workflow-implementation/correction-frontend/run.cjs build-web independent-build
node docs/assessment-workflow-implementation/correction-frontend/run.cjs next independent-next --trace on
```

Each runner tag writes its own log, but current browser.json/next.json and runtime trace directories are replaced by a run; copy configurations/output destinations for independent immutable evidence. Build before `next start`; never reuse an unknown build. No concurrent install/test/build owner. All service activity was isolated3275 only; final `node .../independent-qa/final-ports.cjs` printed3275 free and55439 free, exit0. No main3100/preview3150 interaction, real database, secrets, live provider/email, install, merge, push or deployment.

`git diff --check` passed on production/test source. Full staged evidence check reports trailing spaces in preserved raw logs/error snapshots; these are deliberately not rewritten execution output. Git emitted long-path `.gitattributes` warnings for deeply nested trace paths but committed the files successfully. A Python `-c` diagnostic invocation was blocked by unattended policy; no policy/config was changed. Later ordinary file-based read-only trace tools ran successfully.

**Hotspot:** builder.js was prior backend/reviewer D03 focus; downstream backend should avoid it without coordination. Only the scoped reconciliation/guard changed.

### Remaining gates and disposition

- D01: inherited component cases and real built Next navigation pass; other engines/bfcache/physical devices unqualified.
- D02: **policy-deferred**, unchanged.
- D03: correction tests pass; requires independent QA/current-authority backend qualification.
- D04/D05/D07/D08: inherited frontend positives pass; no expanded domain claim.
- D06: existing exact-ID handoff positive retained; **queue-deferred**, unchanged.
- Sixteen broad-domain failures remain owned by backend t_1fb2b181; not executed or waived here. No whole-suite result claimed.
- No authenticated real API→DB concurrent publication journey, PostgreSQL RLS/concurrency, live adapters or full accessibility qualification.
- Release backend t_1fb2b181 then independent QA t_98f7918e, followed by existing reviewer t_5bf8231e. This completion releases the serialized chain, **not candidate acceptance or owner approval**.

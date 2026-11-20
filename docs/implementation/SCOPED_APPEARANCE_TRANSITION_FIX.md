# FOUC-QA-04 authority-gated transitions

Worktree: `fouc-scope-fix`; baseline `227d903e9b3b455709613b8e7d0a79a198a55c53`. Owner explicitly approved the pending/settled contract on 21 November 2026. Local implementation handoff only; no push, deployment or overall acceptance. Exact local commit is recorded on the implementation Kanban handoff.

Status: implemented and locally verified. Final expanded real-API test passes (26.9s); guest/dirty-guard regression passes (37.1s); shell regression passes (22.3s). Final first-paint suite: 22 passes / one preserved historical strict-policy failure. Builds, final typecheck, six branding tests and 14 policy-isolation tests pass. Independent/human acceptance remains deferred.

## Contract and implementation

SPA destinations without current appearance authority render the existing RecoveryFrame and controls, labeled “Opening workspace” / “Waiting for this destination’s appearance.” They expose neither destination children nor a guessed brand. Failure keeps this nonblank surface and offers Retry appearance; session failures offer Try loading again. The pending surface inherits the document canvas, without representing it as destination authority.

`useBrand` binds state to pathname, account/environment and selected client. Effect cleanup invalidates departed requests before paint; a sequence counter rejects older requests within the same effect lifetime. Responses publish state only. A layout effect commits palette properties and selected theme in the same pre-paint commit that exposes the corresponding brand and children. Browser requests have a ten-second deadline and visible retry. Same-authority refresh keeps mounted content and its inputs. The root snapshot remains a one-document bootstrap; navigation invalidation now runs in a layout effect. No new server fetch contract, persistent palette/identity cache, backend or permission change.

A scope change clears obsolete authority during render. This prevents an A -> B -> A key from reviving the old A state while both new responses are unresolved. The extra real-API test updates selected-client context in the same mounted shell: `red-generation/run.log` reproduces the missing pending state before this correction; `green/run-generation.log` passes afterward, including strict pending-frame samples and late B response rejection. Same-browser owner/member sign-in checks separately verify identity preference isolation.

Fresh-document recovery remains the existing policy. In particular, the guest 503 fallback keeps its scoped saved platform-dark preference and restores generated appearance on recovery without remounting the login form. The `b1ec076` exception and resolver are unchanged; a failed SPA destination does not gain this exception.

## TDD and preservation

The original QA source is copied byte-for-byte to `evidence/scope-fix/original/scope.spec.ts`. Original `evidence/scope-fix/red`, investigation, historical first-paint/outage evidence and unrelated legacy failure logs remain untouched. Only the contradictory pre-release destination-heading requirement was replaced: inspect explicit pending, release authority, then assert destination appearance. Captured destination frames must have the correct theme and brand; unresolved destination frames must have the pending surface.

Before product edits, the revised contract ran against the existing baseline build: RED, with absent pending state and destination frames under the previous authority. See `evidence/scope-fix/red-approved/run.log`, screenshots, raw frame JSON and error context. The test continued through independent client/identity controls.

Expanded coverage uses the existing real isolated API/PGlite harness: both transition directions, browser back/forward, failed authority/retry, out-of-order responses, departed-scope responses, real Alpha/Beta clients, responsive/reload first-paint samples, and different owner/member identities in the same browser with distinct persistent preferences. Synthetic response interception controls timing; API setup, identity and client selection remain real. This is not PostgreSQL concurrency/RLS qualification.

## Commands and observed results

All commands run from this worktree. Native PowerShell environment setup:

```powershell
$env:TEMP = Join-Path (Get-Location) '.runtime/tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:NEXT_DIST_DIR = '.next-expanded'
$env:API_INTERNAL_ORIGIN = 'http://127.0.0.1:3111'
npm.cmd run build
$env:QA_BUILT = '1'
$env:QA_TEST_DIR = 'tests/expanded-appearance-browser'
$env:QA_EVIDENCE_DIR = 'evidence/scope-fix/green'
npx.cmd playwright test -c playwright.qa-expanded.config.ts --output=evidence/scope-fix/green/results-final
npm.cmd run typecheck
npx.cmd vitest run tests/branding.test.ts tests/web-policy.test.ts
npx.cmd vitest run --config=vitest.appearance.config.ts
```

`web-policy.test.ts` does not exist: that invocation actually selected six branding tests, all passing; it is not claimed as web-policy coverage. The separate appearance config selected all 14 policy tests, passing. Typecheck and production build pass. Logs: `build-02.log`, `build-final.log`, `typecheck-final.log`, `unit-01.log`, `policy-unit.log` under `evidence/scope-fix/`.

Final generation-corrected build: `build-generation.log`. Final expanded command uses `--output=evidence/scope-fix/green/results-generation`; log `green/run-generation.log`. Earlier successful runs and the occupied-port failure are retained. Generated Next `next-env.d.ts` / tsconfig additions were restored to baseline after builds; final typecheck with restored configuration passes (`typecheck-restored-config.log`).

First-paint regression uses its existing synthetic transport harness:

```powershell
$env:NEXT_DIST_DIR = '.next-first-paint'
$env:API_INTERNAL_ORIGIN = 'http://127.0.0.1:3281'
npm.cmd run build
$env:FIRST_PAINT_BUILT = '1'
npx.cmd playwright test -c playwright.first-paint.config.ts --output=evidence/scope-fix/first-paint/results
```

Result: 22 passed, one preserved historical strict-contract failure (`qa-independent.spec.ts:41`, expects platform-dark during outage, receives approved dark fallback). The policy-specific 503 repeat-failure/recovery test passes. Geometry, saved-theme/identity precedence, blocked storage, return navigation, retained inputs, keyboard/readability and temporal frame checks pass. Logs: `build-first-paint.log`, `first-paint-run.log`; artifacts and failing trace: `first-paint/results/`.

Repeated on the final source after the generation correction: same 22 passes / one preserved failure. Final logs: `build-first-paint-final.log`, `first-paint-final.log`; output override `--output=evidence/scope-fix/first-paint/results-final`.

Shared-shell regression: set `QA_TEST_DIR=tests/shell-browser` and run the same built expanded config, with `--output=evidence/scope-fix/shell/results`. One test passes, covering role redirects, scoped overviews, client switches, permissions, mobile navigation and axe. See `shell-run.log`.

Final guest regression: set `QA_TEST_DIR=tests/guest-ui-browser` and run the built expanded config with `--output=evidence/scope-fix/guest/results`. One test passes, including password/MFA/private-link flows, one-time authority, failed-check input retention, canceled dirty navigation, pending-mutation guard and axe. See `guest-run.log`. Existing unrelated assessment/builder failures were not changed or relabeled.

## Changed files and evidence

- `apps/web/app/components/brand-header.tsx`: tagged authority, generation cleanup, render invalidation and pre-paint DOM commit.
- `apps/web/app/components/app-shell.tsx`: client binding and explicit pending/retry surface.
- `apps/web/app/components/appearance-provider.tsx`: pre-paint bootstrap invalidation.
- `tests/expanded-appearance-browser/scope.spec.ts`: approved release ordering plus strengthened transition/race coverage.
- `DESIGN.md`, `docs/implementation/FEATURE_CHECKLIST.md`, this report: bounded contract and evidence.
- `evidence/scope-fix/`: original source copy, revised RED, generation RED, GREEN frame JSON/screenshots, regression outputs and command logs.

Inspected `green/scope-client-pending.png` and `green/scope-client-settled.png`: explicit unbranded pending surface, then QA Alpha / Client Dark with the destination heading. `preservation.json` verifies the original test copy and all 30 tracked evidence/investigation files against baseline Git blobs. One old log has checkout line-ending normalization; its Git blob is unchanged. No original log was written. Initial untracked `.next-expanded/` and `evidence/expanded/` remain; the requested build refreshes only its designated build output.

## Parent verification

The owning frontend agent reviewed the product diff and inspected pending/settled screenshots: pending is explicit and unbranded; settled displays QA Alpha, Client Dark and the destination heading. Independently reran `npm run typecheck`, 14 policy tests and `git diff --check`: passed. Independently reran the final built real-API scope test with `QA_EVIDENCE_DIR=evidence/scope-fix/parent-verification`: one passed, 25.8s test / 48.1s total; log `parent-verification.log`. Transient readiness connection refusals precede successful startup. No root QA acceptance inferred.

## Environment and review limits

Read AGENTS.md, apps/web/AGENTS.md, DESIGN.md, implementation checklist, investigation, and installed Next 16.4.6 server/client component and layout/page documentation before edits. UX Engine was absent from the expected project directory but found read-only at `C:/Users/cabas/.codex/plugins/cache/created-by-me-remote/ux-engine/2.4.0/skills/`; loaded ux-auditor and state-completeness. No Skill tool was exposed, so the installed SKILL.md files were read directly. Existing RecoveryFrame, feedback, buttons and tokens are reused; no redesign.

PowerShell blocks npm/npx `.ps1` launchers; `.cmd` works. The Python launcher was access-denied and made no edits; apply_patch performed the changes. Baseline readiness logged transient connection refusals before the isolated API became ready. Windows harness shutdown stalled after completed tests; only harness PIDs identified by each run's own logs were stopped using Node process.kill. taskkill was denied. A green attempt correctly refused an occupied 3110 rather than reusing it (`green/run-01.log`). Logs of these attempts are retained. No unrelated server was killed.

Evidence establishes local Chrome automation and the inspected pending screenshot, not all routes, other engines, physical devices, full manual accessibility, live integrations or human acceptance. Deferred human review remains deferred. No credentials, databases or private V2 files were copied. Mail/paid AI stayed disabled; storage and databases were isolated by the harness.

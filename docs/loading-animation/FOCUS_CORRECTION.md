# LA-QA-01 — safe keyboard focus correction

## Handoff

Task `t_7f7c0256`, isolated `ui/loading-animation`. Baseline QA evidence SHA `bee243936407e0322b107c82572b54ce761bcc93`; corrected product/test SHA **`bf3befe015e33d5584dcaec53d372ce5916463b9`**. The subsequent evidence-only commit is recorded in the external manifest and Kanban handoff. Implementation correction complete; **independent QA t_d69674e1 must resume**, followed by existing reviewer/integration. No independent acceptance is inferred.

QA explicitly yielded sole worktree/test ownership before modifications. Main remains `ui/global-design-system@ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`; no main modification/restart, remote push/deployment, owner-browser access, live mail or paid AI. Existing untracked artifacts remain. No new graph cards.

## Root cause and bounded change

The neutral authority gate correctly removes decorated role/navigation controls. Removing the keyboard-focused link makes the browser focus BODY; the previous implementation had no focus recovery. Ranked investigation: (1) removal of the focused decorated link (confirmed by source and held-context samples), (2) page-main replacement without a handoff (also covered), (3) later router focus overriding recovery (not observed in either corrected built run).

`ShellFocusFrame` renders the same outer div/attributes/children at a fixed tree position. Its React pre-mutation snapshot records only a focused descendant of that shell. After commit, it focuses the current `main#main[tabindex="-1"]` **only if** that recorded element was disconnected and active focus fell to BODY. It does not retain old controls, store identities, restore previous branding, or override existing meaningful focus. Main remains focused as pending content becomes the verified destination or recovery; keyboard Tab reaches the retry action. `preventScroll` avoids an incidental scroll jump. No mount-time focus, timer focus, polling, state update or new dependency.

Product changes: `apps/web/app/components/shell-focus-frame.tsx` (32 lines) and the outer wrapper/import in `application-shell.tsx`. Authority/epoch/sequence/503 logic, page placement, builder implementation and CSS are unchanged. Tests add an unsaved input fixture and four cases in `tests/loading-animation-browser/shell.spec.ts`; all original assertions remain. The independent `qa-temporal.spec.ts` is byte-for-byte unchanged (`git diff --exit-code bee2439 -- tests/loading-next-browser/qa-temporal.spec.ts`).

## RED → GREEN

Raw evidence: `focus-fix/`.

- `01-red.txt`: unchanged built QA regression, **1 failed**, six focus failures at 1440/820/390. Existing candidate build from QA used for this baseline. `01-red-frames.json`: every neutral sampled frame focused BODY.
- `02-build.txt`: corrected isolated production build, exit 0.
- `03-green.txt`: exact unchanged built regression **1 passed**. `03-green-frames.json`: main focused during pending and settled at all widths; zero neutral BODY frames (188/196/192 neutral frames).
- `04-focused.txt`: first added error/retry and refresh cases, **2 passed**.
- `05-focused-baseline-red.txt`: temporarily restored original div wrapper with the new tests retained, **3 failed / 1 passed**. Error/retry fails at all three widths; background refresh preservation already passes. The corrected wrapper was restored before subsequent checks.
- `06-loading.txt`: **22 passed** = original 18 + error/retry at three widths + background context/appearance refresh preserving focus, unsaved value and exact input DOM node.
- `17-qa-temporal.spec.ts.txt`: second fresh-server corrected run **1 passed** at committed product SHA; `17-final-frames.json` retains samples. `summarize.mjs` verifies widths, MAIN pending/settled and zero neutral BODY frames in both green runs. Original QA frame JSON and original implementation screenshots were restored after preserving new results here.

## Commands and outcomes

Run from this worktree. Shell TEMP/TMP/TMPDIR point at `.runtime/qa-temp`. Each real-API test command starts its own isolated synthetic setup, memory PGlite and timestamped `.runtime/expanded-real-api` private storage with email/AI disabled and database overrides cleared. Before each harness lifetime, use `npx tsx tests/loading-animation-browser/check-ports.ts 3110 3111 55432` (other harness ports below). Do not combine setup-owning suites into a shared database lifetime.

| Command | Result / log in focus-fix |
|---|---|
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | exit 0; `02-build.txt` |
| `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts qa-temporal.spec.ts` | RED then GREEN twice; `01`, `03`, `17-qa-temporal.spec.ts.txt` |
| Same command with `navigation.spec.ts` | 1 passed; `17-navigation.spec.ts.txt` |
| `npx playwright test -c playwright.loading-animation.config.ts` | 22 passed; `06-loading.txt` |
| Same command with `--grep 'removed-control\|background context'` | focused baseline 3 fail/1 pass; `05-focused-baseline-red.txt` |
| `npx playwright test -c playwright.theme-picker.config.ts` | 36 passed; `07-selectors.txt` |
| `npx playwright test -c playwright.builder-workflow.config.ts` | 10 passed; `08-builder-component.txt` |
| `npx vitest run -c vitest.appearance.config.ts` | 20 passed; `09-policy.txt` |
| `npm run typecheck` | exit 0; `10-types.txt` |
| `QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_EVIDENCE_DIR=docs/loading-animation/focus-fix/scope BUILDER_GATE_EVIDENCE=docs/loading-animation/focus-fix/builder-gate npx playwright test -c playwright.qa-expanded.config.ts <spec>` | Separately: `scope.spec.ts`, `builder-gate.spec.ts`, `builder-loading.spec.ts`, `editor-temporal.spec.ts`, each 1 passed; `11-*.txt` |
| `QA_BUILT=1 QA_TEST_DIR=tests/<suite> npx playwright test -c playwright.qa-expanded.config.ts` | Separately: `guest-ui-browser`, `recovery-ui-browser`, `assessment-builder-ui-browser`, `shell-browser`, `overview-browser`, each 1 passed; `12-*.txt` |
| `QA_BUILT=1 npx playwright test -c playwright.account-theme.config.ts` | 1 passed; `13-account-theme.txt` |
| `npx playwright test -c playwright.workspace-popover.config.ts` | 1 passed; `14-workspace.txt`; ports 3490/3491/55449 verified free |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web` | exit 0; `15-first-paint-build.txt` |
| `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts outage-policy.spec.ts` | 1 passed; `16-outage-policy.txt`; ports 3280/3281 verified free |
| `node docs/loading-animation/focus-fix/summarize.mjs` | exit 0; `summary.log` |
| `npx prettier --check apps/web/app/components/application-shell.tsx apps/web/app/components/shell-focus-frame.tsx tests/loading-animation-browser/shell.spec.ts` | all matched files pass |
| `git diff --check -- apps tests` and staged source check | exit 0 |
| `npx tsx tests/loading-animation-browser/check-ports.ts 3110 3111 55432 3280 3281 3490 3491 55449` | all free after tests; `18-ports.txt` |

## Limits and review notes

- Historical full first-paint remains **22 passed / 1 unchanged superseded-contract failure** (`qa/14-first-paint-full.txt`). This correction reran the approved outage-policy test against a fresh build, not the entire historical suite. **Do not claim the entire suite green.** No historical assertions were changed or disabled.
- Built navigation and focused failure/retry cover desktop/tablet/mobile. Same-authority refresh retains input focus/value/DOM identity. Existing selector36 and real popover journey cover keyboard dismissal/focus; full scope/history and imperative builder gate/save/lazy/history journeys pass. These are bounded automated Chrome checks, not all possible focus interactions or manual screen-reader/WCAG certification.
- No new visual design/CSS. New screenshots are retained but not claimed as a manual visual review. PostgreSQL RLS/concurrency and full V2.1 parity are not qualified by synthetic PGlite journeys.
- Startup proxy ECONNREFUSED before readiness and existing component CSS warnings remain in raw logs. An execute_code read batching attempt was denied in unattended mode; ordinary tools were used, no policy changes/bypass. Next-generated next-env/tsconfig changes were inspected and restored; build artifacts retained.
- Source self-review found no new input parsing, HTML injection, network request, storage, credential handling or permission change. Independent review is the existing downstream task, not performed by a subagent here.
- Sole test/worktree ownership returns to QA after this correction completion. Owner acceptance and main running-app verification remain parent-owned.

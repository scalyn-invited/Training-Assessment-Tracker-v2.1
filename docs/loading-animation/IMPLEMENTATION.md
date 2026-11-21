# Lightweight loading animation — frontend implementation handoff

## Status and ownership

Implementation candidate for independent QA **t_d69674e1**, then existing review/integration graph. This is not independent QA approval, owner acceptance, or permission to restart main. Exact committed SHA is recorded in the task handoff and `C:/Users/cabas/AppData/Local/hermes/cache/scratch/loading-animation/manifest.json` after commit.

Base/main inspected SHA: `ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e`, branch `ui/global-design-system`. Candidate: `.worktrees/loading-animation`, branch `ui/loading-animation`. Main tracked tree remained clean with its existing untracked rollout documents preserved. No main checkout mutation/restart, remote push, deployment, owner browser use, live emails or paid AI calls.

## Implementation

- Shared `LoadingState`: initially visually textless 32px spinner, stable polite status and screen-reader text, contextual explanation after 3000ms, static reduced-motion equivalent. No artificial completion delay or fake progress. Save/submit UI untouched.
- Persistent `AppShellRoot` in the existing root layout owns chrome only. Fixed route outlet preserves page/editor lifetime. Page-local `AppShell` owns its main/content gate; explicit leases suppress chrome for error/not-found without requiring a successful context request.
- Same-workspace navigation retains the actual outer header/sidebar DOM. While context is unverified these are neutral and carry no user/client/role content. Only after current context confirms continuity can prior verified chrome decoration remain while exact destination appearance is pending. Destination content never uses retained chrome authority.
- Known identity mutations invalidate a document-local epoch before POST. Context direct deliveries and broadcasts are epoch/sequence fenced. First page/root context request is shared (including its confirmed failure); subsequent route/identity/retry verification cannot join an older page refresh. Ten-second context deadline and explicit safe recovery avoid indefinite waits or blind repeated mutations. Late mutation errors cannot invalidate a newer epoch.
- Appearance request generation includes verified identity, permissions and scope. Neutral canvas tokens cover unresolved client/guest boundaries without changing stored preferences. Guest validation and bounded initial-document 503 fallback remain intact.
- Single-client automatic selection finishes its own confirmed epoch after intentional context invalidation, without navigating for a superseding epoch/route. Recovery actions retain mobile 44px targets.

## Verification commands and actual outcomes

Run from the isolated worktree only. Real-API suites each require a separate harness/database lifetime. Before those runs: `npx tsx tests/loading-animation-browser/check-ports.ts 3110 3111 55432`. Do not batch independent setup suites into one server lifetime: the retained `67-scope-builder.txt` demonstrates setup conflict 409; scope then passes independently in `69-scope.txt`.

| Command / qualification | Actual result | Evidence under this directory |
| --- | --- | --- |
| `npx playwright test -c playwright.loading-animation.config.ts --output=output/loading-animation-handoff` | 18 passed | `86-component.txt` |
| `API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build` | exit 0 | `65-build.txt` |
| `QA_BUILT=1 QA_TEST_DIR=tests/loading-next-browser npx playwright test -c playwright.qa-expanded.config.ts` | 1 passed; built Next desktop/tablet/mobile navigation, retained nodes, held authority, history, 404 | `current-loading-next-browser.txt` |
| Same command, `QA_TEST_DIR=tests/guest-ui-browser` | 1 passed | `current-guest-ui-browser.txt` |
| Same command, `QA_TEST_DIR=tests/shell-browser` | 1 passed | `66-shell.txt` |
| Same command, `QA_TEST_DIR=tests/overview-browser` | 1 passed | `current-overview-browser.txt` |
| Same command, `QA_TEST_DIR=tests/recovery-ui-browser` | 1 passed | `current-recovery-ui-browser.txt` |
| Same command, `QA_TEST_DIR=tests/assessment-builder-ui-browser` | 1 passed; original full authoring workflow | `current-assessment-builder-ui-browser.txt` |
| Same command, `QA_TEST_DIR=tests/expanded-appearance-browser`, filter `builder-gate.spec.ts` | 1 passed, including saved URL/newer edit/history | `67-scope-builder.txt` (builder passes; separate scope setup conflict documented) |
| Same command, filter `scope.spec.ts` alone | 1 passed | `69-scope.txt` |
| Same command, filter `builder-loading.spec.ts` | 1 passed | `71-builder-lazy.txt` |
| Same command, filter `editor-temporal.spec.ts` | 1 passed | `80-editor-temporal.txt` |
| `npx playwright test -c playwright.builder-workflow.config.ts` | 10 passed | `79-builder-workflow.txt` |
| `QA_BUILT=1 npx playwright test -c playwright.account-theme.config.ts` | 1 passed; existing account-theme matrix | `74-account-theme.txt` |
| `npx playwright test -c playwright.workspace-popover.config.ts` | 1 passed; real themes/reload/reset and responsive overlay | `75-popovers.txt` |
| `npx playwright test -c playwright.theme-picker.config.ts` | 36 passed | `82-selectors.txt` |
| `npm run typecheck` | exit 0 | `76-types.txt` |
| `npx vitest run -c vitest.appearance.config.ts` | 20 passed | `77-policy.txt` |
| `npx vitest run tests/branding.test.ts` | 6 passed | `78-branding.txt` |
| Prettier check of changed product/new harness files | exit 0 | `85-format-check.txt` |
| Source/test `git diff --cached --check -- apps tests playwright.loading-animation.config.ts` | exit 0; raw evidence logs intentionally retain tool whitespace | terminal handoff checks |

First-paint build: `API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web`, exit 0 (`72-first-paint-build.txt`). Ports 3280/3281 checked free. Full final run: `FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts --output=output/loading-first-paint-full-final` gives **22 passed, 1 historical conflicting assertion failed** (`81-first-paint-full.txt`). This is explicitly **not a fully green suite**. The unchanged QA-generated outage test expects `platform-dark` during 503, whereas approved policy intentionally uses built-in `dark` until generated authority returns. This conflict predates the candidate: see base `docs/implementation/BUILDER_APPEARANCE_GATE_FIX.md` and advisory `ARCHITECTURE.md` sections 6/7. Approved `outage-policy.spec.ts` passes including repeat failure/recovery and preference preservation. Selected current-contract run excluding that historical assertion also passes 22 (`73-first-paint.txt`); it is not substituted for the full result. No assertion was disabled and the fallback product policy was not altered. Independent QA must report this distinction.

Built checks preceded only the final whitespace-only Prettier wrap of `app-shell-root.tsx`; the final component suite ran afterward. Next-generated `next-env.d.ts`/`tsconfig.json` isolated-build changes were restored, not committed. Existing startup ECONNREFUSED logs precede readiness; successful journeys run after readiness. Component harness reports pre-existing CSS composition warnings. PGlite-backed isolated journeys do not qualify PostgreSQL RLS/concurrency.

## TDD and correction evidence

Original RED and intermediate failures remain in this folder. Important pairs: stale context `06`→`07`; permission generation `10`→`11`; mutation/unauthenticated recovery `13`→`14`; old page refresh/deadline `15`→`16`; centering `21`→`22`; guest presentation `23`→`24`. Stable accessible label, nonempty live status, late mutation failure and guest neutral boundary REDs `45`–`48` all pass in final 18-test suite. Broader real regressions found/fixed: mobile recovery sizing (`53`/`55`→`57`), standalone recovery request independence and auto-selection (`final-recovery-ui-browser`/`59`→`62`), first-request failure incorrectly bypassed (`qualified-shell-browser`→`66`).

Retired assumptions changed narrowly: Opening workspace text → spinner; protected initial guest-shell marker → pending main; initial-session disabled theme controls → absent controls and loader; two obsolete builder `summary` locators → existing Theme button. Scope test now requires retained **neutral** structure plus absence of outgoing brand/content. Search found no remaining Opening workspace/Verifying workspace references in TS/TSX. Original failures retained; permission, scope, save/history, failure and responsive assertions preserved.

Harness mistakes retained transparently: combined setup conflict `67` corrected by standalone scope; wrong lazy suite directory `70` (no tests) corrected by exact `builder-loading.spec.ts` in `71`. A read-only inline Node log aggregation command was denied by the terminal approval policy; no policy bypass or config change was used, and evidence was read through file/search tools.

## Visual and accessibility evidence

`loading-1440.png`, `loading-820.png`, `loading-390.png` show centered initially textless content loaders with verified same-scope chrome. Desktop/mobile screenshots were visually inspected: spinner centered in available main area, no loading heading/card or visible overflow. These are **verified-context** frames, not neutral-context examples. `scope/scope-client-pending.png` records a scoped pending boundary. Component geometry assertions cover 1440x900, 820x1180, 390x844; reduced motion asserts no animation. Built navigation loops cover the same width classes. Existing guest/overview/recovery/builder journeys retain axe, keyboard and responsive checks. This is bounded automated accessibility evidence, not a manual screen-reader or whole-application WCAG certification.

## Handoff limitations

Next owner: QA `t_d69674e1`, then existing reviewer/integration chain. No new task graph nodes created in this resumed implementation. Independent QA/review, main integration/restart and owner running-app browser verification remain outstanding. Preserve main records/uploads and all sibling worktrees. Do not treat screenshots, component mocks, or current tests as proof of untested application parity.

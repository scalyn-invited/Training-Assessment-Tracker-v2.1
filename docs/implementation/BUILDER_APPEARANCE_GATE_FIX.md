# FOUC-QA-05 — imperative builder lifetime behind appearance authority

Task: `t_ec45899d`. Baseline: QA commit `29388787c7837538bb04f357f4702b0b95d8a2f5`, fast-forwarded into this isolated worktree; its product tree contains `7e4ec7c`. Status: implementation and bounded automated verification complete; root `t_d56e101f` owns independent retest and remaining all-family QA. No overall/human acceptance, push or deployment.

## Reproduction and cause

The original QA evidence in `evidence/final-scope/` is unchanged (`git diff --exit-code 29388787 -- evidence/final-scope`). Own production RED is `evidence/builder-gate-fix/red.log` and `red/`: after held branding authority releases, the shell exists but the builder heading is absent and host empty. No guessed-theme destination is introduced to make this pass.

The parent builder fetch/effect can run before the independently resolved shell renders its host. Assigning a ref later does not change the effect's data/client/CSRF dependencies. A simple host-triggered remount fixed that blank state but exposed two separately recorded lifecycle failures in the unchanged full builder workflow:

1. `builder-workflow.log`, line124 assertion: markup was exposed before the lazy editor module installed handlers and its work guard. A user/test could type and sign out against inert controls. The initial passing heading-only screenshot (`green.log` stage, superseded by final evidence) was insufficient readiness evidence.
2. `builder-workflow-retest.log`, line231 assertion: save replaces `/new` with the saved ID using native history replacement. Next updates pathname; the shell gates the route again. Recreating the editor on host reattachment from React's original initial state produced “Unsaved changes” and lost the current saved/editor state.

## Bounded correction

Only product file changed: `apps/web/app/components/assessment-builder.tsx`.

- Own one imperative editor root for the existing **data lifetime**, independent of the shell host's mount lifetime.
- Observe host attachment with a stable state callback; attach/detach that owned root only when the authority-gated shell supplies/removes its host.
- Keep detached DOM/editor state in page memory during temporary appearance gating. It is not in the document and is not visible/interactable as a guessed-theme destination. No browser storage, identity/palette cache or alternate authority is added.
- Publish markup and synchronously mount the editor only after its real lazy module resolves. Until then, show the existing loading copy, not unbound form controls.
- Preserve existing cancellation and cleanup: actual data lifetime changes/unmount cancel late imports and release the editor, ResizeObserver, request lifetime and work guard. Temporary host detachment retains the active guard and current editor state instead of rebuilding from stale initial props.
- No changes to shell gates, theme precedence, authority assertions, backend, editor save/publication logic, work-guard implementation or published immutability.

Other imperative consumers source audit: the builder is the sole outer ref-dependent HTML/editor initializer. Tiptap preview/editor instances are owned by `mountAssessmentBuilder`; other refs are event-driven dialogs, focus targets or the recovery frame, rather than data effects initializing a gated host. Existing shell/guest interaction suites and builder preview/recovery checks passed. This audit is not an all-route runtime claim.

## Regression tests and evidence

All paths below are under `evidence/builder-gate-fix/` unless otherwise specified. Production renderer plus fresh isolated in-memory PGlite, API and worker; synthetic accounts only. Each real-API suite ran separately so setup fixtures did not collide.

| Check | Result / evidence |
| --- | --- |
| Original held-authority repro | RED missing heading after release, `red.log`; original QA RED preserved |
| Enhanced held-authority / save lifetime / history | 1 pass, `gate-final.log` (24.8s); also `gate-history-final.log` and `gate-preservation.log` |
| Real lazy-bundle delivery held | 1 pass, `lazy-loading.log`; controls absent until module release, immediate dirty sign-out cancellation afterward |
| Unchanged full builder UI journey | 1 pass, `builder-final.log` (52.1s), earlier successful `builder-workflow-preservation.log` |
| Scoped appearance matrix unchanged | 1 pass, `scope.log`: both directions, history, failure/retry, client/user isolation, A→B→A and response races |
| Existing builder component/transport suite | 10 pass, `builder-component.log`: preview, exact publication reconciliation, conflicts/comparison, retry with newer typing, published-copy provenance and link/history guards |
| Existing real-API shell suite | 1 pass, `shell.log` |
| Existing real-API guest/account-link suite | 1 pass, `guest.log` |
| Prior built first-paint contracts | 22 pass / 1 preserved superseded strict outage assertion failure, `first-paint.log` |
| Appearance policy | 14 pass, `policy.log` |
| Branding domain | 6 pass, `branding.log` |
| Final server/web production build and typechecks | pass, `build-verified.log`, `typecheck-final.log` |
| Diff whitespace and original evidence integrity | pass |

Enhanced `builder-gate.spec.ts` keeps the original heading-after-authority assertion and adds no host/form before authority, real save with newer unsaved typing, a second held authority during save URL replacement, **same input DOM identity** after reattachment, dirty cancellation, subsequent save, actual-unmount guard removal, saved reload, real directory Edit draft navigation and cancelled browser Back with input retained. `builder-loading.spec.ts` delays the actual built JS response identified by its editor code, rather than fabricating module/API success.

The unchanged full builder journey now passes the formerly failing initial dirty guard assertions, pending-save sign-out protection, normal new/existing/published/copy flows, exact save/reload, upload handling, publication and recovery. This is execution evidence for those assertions, not a blanket claim that every historical legacy failure is fixed. The root's separate legacy integrated hidden-section failure and generation ERR_ABORTED were not investigated or declared resolved here.

Desktop/light settled and saved-reload screenshots were inspected under `browser/`; initialized styled header, provenance, four steps and saved status are visible (title value verified by assertions, below the screenshot fold). Dark desktop and mobile full authoring screenshots under `workflow/` were inspected; mobile question controls were additionally inspected at original-scale crop. No clipped controls observed in that crop. Unchanged full builder suite passes its desktop/mobile overflow and axe assertions. Physical devices, other browser engines and full manual WCAG remain unqualified in this run.

## Commands

From this task's workspace with dependencies installed:

```sh
API_INTERNAL_ORIGIN=http://127.0.0.1:3111 NEXT_DIST_DIR=.next-expanded npm run build
npm run typecheck
QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test builder-gate.spec.ts -c playwright.qa-expanded.config.ts
QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser npx playwright test builder-loading.spec.ts -c playwright.qa-expanded.config.ts
QA_BUILT=1 QA_TEST_DIR=tests/expanded-appearance-browser QA_EVIDENCE_DIR=evidence/builder-gate-fix/scope npx playwright test scope.spec.ts -c playwright.qa-expanded.config.ts
QA_BUILT=1 QA_TEST_DIR=tests/assessment-builder-ui-browser npx playwright test -c playwright.qa-expanded.config.ts
QA_BUILT=1 QA_TEST_DIR=tests/shell-browser npx playwright test -c playwright.qa-expanded.config.ts
QA_BUILT=1 QA_TEST_DIR=tests/guest-ui-browser npx playwright test -c playwright.qa-expanded.config.ts
npx playwright test -c playwright.builder-workflow.config.ts
npx vitest run -c vitest.appearance.config.ts
npx vitest run tests/branding.test.ts
API_INTERNAL_ORIGIN=http://127.0.0.1:3281 NEXT_DIST_DIR=.next-first-paint npm run build --workspace=@tracker/web
FIRST_PAINT_BUILT=1 npx playwright test -c playwright.first-paint.config.ts
```

Do not run the separate real-API setup specs together against one database. `BUILDER_GATE_EVIDENCE` optionally selects a fresh output directory; the default is now this task's evidence instead of overwriting original QA evidence.

## Warnings and boundaries

Real-API startup logs include transient proxy ECONNREFUSED before API readiness; actual tests start after the readiness probe succeeds. Component bundling reports existing CSS `composes` ordering warnings in unchanged shared styles. The first-paint failure still expects `platform-dark` but receives owner-approved built-in `dark` during the explicitly bounded branding-503 fallback; successful recovery and the approved policy test pass. No assertion was disabled or relaxed.

Next-generated `next-env.d.ts` and added isolated-build include paths in `tsconfig.json` were restored after checks; these are not product edits. No UI redesign/dependency addition. UX Engine directory referenced by DESIGN.md was absent in this worktree; this is a lifecycle correction using unchanged approved markup/styles, not a design-system reinterpretation.

Root QA should integrate the exact local implementation commit, independently repeat the focused gate/lazy/full builder/scope checks, then resume its remaining coverage. Existing human review deferral and narrow outage exception remain unchanged.

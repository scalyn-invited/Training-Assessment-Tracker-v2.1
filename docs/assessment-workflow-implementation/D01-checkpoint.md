# D01 safeguard checkpoint (implementation in progress)

Base consumed: QA 79f8cee43fea1c5c160a0c94bc202931e8ae031b. Worktree-only; no domain/storage/credential copying. UX Engine and Playwright skills unavailable; TDD, systematic-debugging and dogfood loaded. Actual Playwright package used.

## Implemented/tested boundary
- Author and reviewer page-memory work sources protect reload; reviewer score, feedback, evidence selections, private rationale and file verification fields stay in memory on cancellation.
- Client selection/logout consult sources before POST; cancellation sends zero mutations and leaves controls usable. Accepted context change navigates without a second post-mutation cancel prompt.
- Literal/Next links use capture-phase confirmation; Chromium Navigation API cancels same-document history traversal before Next unmount. No browser persistence added.
- Pending/uncertain registered work prevents context/route actions. Unknown or stale review mutations stop subsequent writes; readback displays server status without replacing the retained local review or silently rebasing it to a newer attempt.

## Actual execution
Commands: `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts` (focused `-g` filters in logs); `node node_modules/playwright/cli.js test -c playwright.workflow-next.config.ts`; `npm run typecheck`; `git diff --check`.
- D01-review-red.log: expected missing beforeunload; green passes.
- D01-context-red.log: observed POST-before-cancel; green passes.
- D01-context-leave-red.log: second beforeunload after confirmed POST; green passes.
- D01-navigation-red.log: missing link preflight/history prompt; green passes.
- D01-review-uncertain-red.log: second write enabled; readback-red additionally reproduces loss on newer-attempt refresh; final browser run passes.
- D01-next-final.log: real Next renderer/router, clean SPA and canceled sidebar/history pass. First launch correctly refused `.env.example` due overbroad harness match (corrected to Next-loaded filenames); first route compile exceeded 5s (60s first-compilation wait, no assertion removed).
- Final browser aggregate and server/web typechecks: exit 0, logs D01-all-browser.log and D01-typecheck-final.log.

## Isolation and limits
Component harness blocks all unexpected network. Next renderer runs only loopback3275, verifies free port and absence of Next-loaded env files, sanitized child environment, API rewrite points to closed discard port9; every browser API request is synthetic fixture transport. This is real Next navigation, not authenticated HTTP/domain lifecycle. No DB/API/worker, live AI/email, main3100 or preview3150. Existing worktree dependencies only. Next-managed generated files are inspected separately before staging.

Same-document history protection depends on browser Navigation API; engines lacking it retain unload/link protection but are not qualified for history. Real devices/BFCache/other engines and PostgreSQL remain unqualified. Existing non-assessment guards and learner's older page-local guard are not yet unified. Successful review/file confirmation baseline cleanup and broader failure/authority matrices need follow-up verification. This checkpoint is not final D01 acceptance, task completion, merge or owner approval.

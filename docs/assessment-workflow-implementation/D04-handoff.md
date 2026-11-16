# D04 content preview and references

Implemented truthful non-recording preview scope, current unsaved versus saved revision/version context and a shared reference formatter. Preview, learner section subset and history now derive numbers from the full pinned questions and include the section title. Response history uses attempt.sections (not a newer definition); IDs, order, save/submit/scoring/permission policy remain unchanged.

Actual RED: `node node_modules/playwright/cli.js test -c playwright.workflow-qa.config.ts -g D04` failed on missing saved-revision label (`D04-red.log`). Same command GREEN; server/web `npm run typecheck` exit0. Browser checks use two sections/four questions, local title edit, preview reset/reopen, consistent B1 numbering and explicit omitted behavior. Component transport only; no database or live service. Shared function requires full definition context for section subsets; caller updated accordingly.

Remaining QA: reorder/historical pinned integration and narrow visual/keyboard inspection; publication-copy metadata is addressed separately in D08. No executable code feature, new question type or section simulation added.

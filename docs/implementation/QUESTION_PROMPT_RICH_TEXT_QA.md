# Question prompt rich-text editor update

## Scope and handoff

### Approved image-upload/processing busy overlay

Acceptance: display an in-editor loading animation while uploading/scanning; disable prompt editing and toolbar interaction temporarily; preserve content, cursor, scan authority and retry. Implemented with the shared loading spinner CSS (including reduced-motion), a semantic status overlay, Tiptap `setEditable(..., false)` (no dirty update), inert editing surface/popovers and native disabled toolbar buttons. Busy phase belongs to the existing question upload state, not the disposable editor DOM. Re-render retains the lock; other questions remain editable. The existing finally block clears it on success or failure. No backend/dependency/scan-policy changes.

Evidence:
- Component RED: `npx playwright test --config playwright.prompt-rendering.config.ts --grep 'image busy' --output output/prompt-image-busy-red` failed because contenteditable remained true. An initial harness run lacked a secure origin for crypto.randomUUID; routed localhost HTML corrected the harness before the valid RED.
- Component GREEN: `npx playwright test --config playwright.prompt-rendering.config.ts --output output/prompt-image-busy-components`: 3 passed (5.8s final). Covers disabled buttons, dismissed popover, blocked keyboard edits, retained text, phase label, restoration, 1440/390/320px overflow and reduced-motion; existing static/preview table tests pass.
- Integration RED: `npx playwright test --config playwright.assessment-builder-ui.config.ts --output output/prompt-image-busy-integration-red`: failed on missing upload-phase label before builder wiring.
- Integration GREEN: same config with `--output output/prompt-image-busy-integration`: 1 passed (1.5m overall). Holds the real upload request and synthetic unavailable status independently; checks both busy phases, same-question re-render lock, error unlock and retained explicit retry. This unavailable response is an isolated fixture, not a scanner result.
- Real scanner: the native command below with output `output/prompt-image-busy-native`: 1 passed (1.3m overall). Verifies pending lock, editing a different question, original cursor insertion, unlock, actual private image download/save/reload/preview and existing axe/responsive assertions. The earlier expectation that authors could type in the uploading question is intentionally replaced by this approved lock.
- `npm run typecheck` passed; `NEXT_DIST_DIR=.next-image-busy-build npm run build` passed (20.4s compilation; all routes emitted); `git diff --check` passed. Removed only the generated isolated-build type paths afterward.

Visually inspected component mobile screenshot `output/prompt-image-busy-components/rendering-image-busy-state-b6ae1-ntent-and-restores-controls/busy-390.png` and actual builder `output/playwright/assessment-builder-ui/image-processing-disabled.png`: centred spinner/label, dim preserved content, wrapped disabled toolbar, no editor clipping. Existing esbuild composed-style warnings in form-layout.module.css and transient isolated-server startup ECONNREFUSED remain; no new runtime failure. Full repository test suite, Firefox/WebKit and human review are not claimed.

Changed for this follow-up: `apps/web/app/components/rich-text-editor/editor.js`, `editor.module.css`, `apps/web/app/components/assessment-builder/builder.js`, `tests/prompt-rendering-browser/rendering.spec.ts`, `tests/assessment-builder-ui-browser/builder.spec.ts`, `tests/prompt-editor-browser/prompt.spec.ts`, DESIGN/checklist and this record. Ready for review; no external Kanban identifier supplied. No commit/push/deployment or owner development-runtime restart.

### Approved direct image picker follow-up

Implemented the owner's three explicit workflow decisions: the toolbar opens the native file picker; selecting a file automatically uploads, waits for the existing scanner and inserts at the captured/mapped cursor; alt defaults to the filename without its last extension. The old full disclosure, visible file/alt fields and separate upload button are removed. An optional selected-image toolbar popover edits alt text later (500-character bound, Escape discards, Enter applies). Upload progress/status/errors and explicit Retry remain immediately below the prompt.

Upload controls and media/retry state now belong to the exact question object for the builder lifetime, surviving question/type/choice re-renders. Cursor positions map through document transactions. When scanning finishes while another question is selected, a detached editor with the same schema inserts into the original question at that position without taking focus or modifying the selected question. Removed/replaced question objects and disposed builder lifetimes do not receive late insertion. No server, scanner, download or publication gate changed.

TDD evidence (all isolated ports 3110/3111):
- `npx playwright test --config playwright.prompt-editor.config.ts --output output/direct-image-picker-red`: expected RED, no native `filechooser` event (5-second timeout).
- `npx playwright test --config playwright.assessment-builder-ui.config.ts --output output/direct-image-retry-red`: expected RED, Retry disappears after question type re-render.
- Native prompt command below with `--output output/direct-image-cursor-red`: expected RED, image appended outside the original heading when the author switches questions during scanning.
- Each correction was exercised GREEN before the next slice. Final commands/results:

```sh
PROMPT_NATIVE_SCAN=1 QA_CLAMSCAN_PATH='C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1/.runtime/clamav/clamav-1.5.5.win.x64/clamscan.exe' QA_CLAMSCAN_DATABASE='C:/Users/cabas/Documents/Codex/Projects/Training Assessment Tracker V2.1/.runtime/clamav/database' npx playwright test --config playwright.prompt-editor.config.ts --output output/direct-image-picker
npx playwright test --config playwright.assessment-builder-ui.config.ts --output output/direct-image-retry
npm run typecheck
NEXT_DIST_DIR=.next-direct-image-build npm run build
git diff --check
```

Final native prompt journey: 1 passed, 1.9 minutes overall. Real upload, real worker/scanner and private decoded image download; empty/cancelled selection, filename with multiple dots, no insertion while scanning, disabled duplicate picker, typing while scanning with mapped cursor, switching questions without cross-question insertion, optional alt Escape/Enter, actual save/readback/reload/preview, responsive overflow and axe checks. The separate builder journey: 1 passed, 1.9 minutes overall, including unavailable-scan feedback, no image insertion, retained media retry after re-render, existing immutable publication/recovery/role/theme/touch flows. Only that unavailable status boundary is synthetic; it is not scanner qualification. Typecheck passed for server/web. Isolated production build passed, all routes emitted (23.4-second optimized compilation); generated isolated-build tsconfig additions were removed afterward, preserving existing dev configuration. Diff check passed, existing CRLF notices only.

Focused changed paths: `assessment-builder/builder.js:30,218-285`; `rich-text-editor/editor.js:122,406-461`; `tests/prompt-editor-browser/prompt.spec.ts`; `tests/assessment-builder-ui-browser/builder.spec.ts`; legacy shared journey selector update in `tests/browser/assessment-flow.ts`; this QA record, DESIGN and FEATURE_CHECKLIST. Existing uncommitted rich-text baseline remains intact. No commit/push, owner 3100/3101 restart, private `.env`/storage modification, new dependency or scanner bypass. UX Engine guidance read from its installed Downloads package because the DESIGN-relative path is absent here.

Inspected `output/direct-image-picker/.../prompt-390.png`: wrapped compact toolbar and prompt remain within the mobile canvas; full image disclosure is absent. Existing full-page sticky-header screenshot geometry is unchanged. Startup readiness probes still briefly report ECONNREFUSED before the isolated API starts. One approximate patch match duplicated a test line; corrected before execution. The whole legacy end-to-end suite was not rerun (its obsolete image selectors were updated); no new PostgreSQL, Firefox/WebKit or human acceptance claim. Native signature maintenance remains as documented below.

User-approved branch: `ui/rich-text-editor-update`, created from `ui/global-design-system`.
Reference: user-supplied `proposed.jpg` and `support-flow.html#req-1047` (local Downloads files, not copied into Git).

Implemented and locally verified; ready for reviewer/owner handoff. No commit, push, deployment or human acceptance. No external Kanban task ID was supplied/updated; this record and the feature checklist retain local acceptance/evidence/status.

Acceptance:
- Compact grouped icon toolbar follows the supplied reference, using existing semantic themes and responsive wrapping.
- Only the assessment builder's question prompt editor is replaced (the same question field includes matrix headings). Other editable rich-text fields are unchanged.
- Reusable imperative mount/extension/preview functions, compatible with the existing builder lifecycle.
- Image entry point preserves the existing private upload, alt text, scan/status/retry and publication gates.
- Code blocks, tables and formatting survive actual API save/reload and preview.
- Server sanitizer allows only bounded safe formatting, preserves private-image and URL restrictions, and retains the canonical 4,000-character prompt limit.
- Read-only learner/history prompt styling handles the newly authored content; this is not a new learner editor.

## Changed paths

- `apps/web/app/components/rich-text-editor/editor.js` (new)
- `apps/web/app/components/rich-text-editor/editor.module.css` (new)
- `apps/web/app/components/assessment-builder/builder.js`
- `apps/web/app/components/response-questions.tsx`
- `packages/domain/src/assessment-content.ts`
- `package.json`, `package-lock.json`
- `tests/assessment-rich-text.test.ts` (new)
- `tests/prompt-editor-browser/prompt.spec.ts` (new)
- `tests/prompt-rendering-browser/rendering.spec.ts` (new)
- `playwright.prompt-editor.config.ts`, `playwright.prompt-rendering.config.ts` (new)
- `DESIGN.md`, `docs/implementation/FEATURE_CHECKLIST.md`, this record.

Four necessary extensions are pinned to the existing Tiptap `3.33.1`: table, text-align, text-style, highlight. StarterKit supplies history, headings, inline marks, lists, blockquotes, code and dividers. No additional UI framework, remote fonts or runtime Figma URLs.

## Component contract

`mountPromptEditor(host, { content, labelledBy, onUpdate, onImage, canImage })` returns the live Tiptap Editor. The caller owns HTML/state persistence and uploads. `onUpdate` receives the instance. `onImage` opens the native file picker; optional `canImage` supplies availability and the builder emits `imageAvailability` when pending state changes. Call `editor.destroy()` on actual field disposal; it aborts window listeners and removes popovers. The builder retains its existing data-lifetime ownership and save/appearance gate behavior.

`promptExtensions()` shares the editable and preview schema. `renderPromptPreview(host, content)` renders read-only content with the same CSS Module `content` class used by `ResponseQuestions`. No second React mount or application shell is introduced.

Controls: undo/redo; paragraph/headings 1–3; bold/italic/underline/strike/inline code; bullet/number lists and quote; safe links; code block/divider; table insertion/rows/columns/header/deletion; alignment; clear formatting; bounded text colors/highlights; image insertion entry point. AI drafting, saved replies, task lists and generic support attachments are excluded.

## Safe persistence

The server permits the existing tags plus headings 1–3, underline/strike, code/pre, quote/hr, table sections/rows/cells, span and mark. It filters styles to four block alignments and exact hex/browser-RGB palette values. Cell spans are integers 1–100; executable attributes, arbitrary classes/styles, widths and non-private images are removed. HTML input remains bounded to 50,000 characters; plain-only prompts retain their 4,000 limit. With HTML supplied, a bounded companion text field is accepted and the authoritative prompt limit is applied to the sanitized HTML-derived text, avoiding Tiptap separator-count disagreement. No database schema or media-authority changes.

## RED → GREEN and review corrections

1. Initial real-browser RED: `Prompt formatting` toolbar absent. GREEN after reusable toolbar integration.
2. Domain slices reproduced stripped structural formatting, table attributes, approved styles and lost text boundaries before allowing each group.
3. Read-only renderer RED: long code overflowed the document. GREEN after sharing the content styles with learner/history rendering.
4. Select All list RED: button disabled; merely enabling it still failed to lift the list. Installed Tiptap handles a sole whole-document list but not StarterKit's appended empty paragraph. The scoped correction recognizes that whole-list selection, moves selection inside the list and runs the ordinary command; bullet/number lists now toggle off without losing text.
5. Inline code RED after actual save/reload: `literal  spaces\tand tab` became `literal spaces and tab`. Both author initialization and preview now preserve whitespace; inline-code CSS also preserves visible spaces/tabs. The browser asserts exact textContent, not normalized text.
6. Read-only code review reported two medium findings, no high security regression. Both were reproduced and fixed:
   - A table's valid canonical 3,999-character prompt was rejected because the editor companion text had 4,008 characters. Domain regression now accepts canonical content while rejecting excessive plain/HTML-derived prompts.
   - Serialized wide-table preview lost its scroll wrapper. A 20-column/320px test reproduced page overflow; Tiptap `renderWrapper: true` preserves the table's scrolling region in serialized preview.

Intermediate harness issues were corrected without weakening product assertions: the component bundle needed `process.env` defined, and the heading assertion was narrowed to its accessible name/level because a selected trailing paragraph also became an empty heading. No test is skipped/disabled to obtain a pass.

## Actual verification

Final affected domain command:

```sh
npx vitest run tests/assessment-rich-text.test.ts tests/assessment-content.test.ts tests/assessment-definitions.test.ts tests/assessment-media.test.ts tests/assessment-assignments.test.ts tests/assessment-responses.test.ts tests/assessment-reviews.test.ts tests/assessment-scoring.test.ts
```

Result: **8 files, 53 tests passed**, 51.83 seconds.

```sh
npx playwright test --config playwright.prompt-editor.config.ts --output output/prompt-editor-results
```

Result: **1 passed**, 35.0 seconds overall. Real isolated API: toolbar actions, selection-aware formatting, code undo/redo, heading, table insert/add-row/delete, whole-document bullet/number toggles, rejected JavaScript link, image-form entry and empty-file validation, paste, actual save/readback/reload, exact inline-code whitespace, colors/highlight, preview, 1440/800/390/320px overflow, popover viewport placement and Escape/focus return, axe WCAG 2.2 tags.

```sh
npx playwright test --config playwright.prompt-rendering.config.ts --output output/prompt-rendering-results
```

Result: **2 passed**, 3.0 seconds overall. Actual bundled components in Chrome: serialized 20-column preview containment, static learner/history rich content, long-code scrolling and table borders at 1440/390/320px. These component tests are synthetic and do not claim real learner assignment/API qualification.

```sh
npx playwright test --config playwright.assessment-builder-ui.config.ts --output output/prompt-builder-regression
```

Result: unchanged existing journey **1 passed**, 1.6 minutes overall. Includes authoring/reorder/matrix flows, immutable publication, save/receipt/conflict recovery, role denial, image scanning unavailable/retry preservation, themes, mobile/touch and accessibility checks.

`npm run typecheck`: passed (server and web).
`npm run build`: passed, all existing routes emitted; latest optimized compilation 7.7 seconds.
Prettier checks apply to new/changed normally formatted files; the existing compact imperative builder is not globally reformatted. `git diff --check` passed.

Screenshots inspected directly: focused prompt desktop/mobile, existing builder dark desktop, static learner dark/mobile. No toolbar/content clipping observed at the tested widths; long code intentionally scrolls internally. Full-page builder screenshots capture the pre-existing sticky-header position after interaction and are not evidence that its global mobile layout was redesigned.

Evidence directories (local/ignored):
- `output/prompt-editor-results/` — focused viewport images.
- `output/prompt-rendering-results/` — learner viewport images.
- `output/prompt-builder-regression/` — existing suite output.
- `output/playwright/assessment-builder-ui/` — existing builder theme/touch images.

## Limits and remaining acceptance

### Reported image save/preview issue — local scanner configured and verified

The owner reported missing images in draft and preview. Added coverage to the existing prompt journey for real multipart upload and actual definition save/readback/reload, asserting the image in the editor and learner preview. Scan-ready and image-download responses are explicitly synthetic browser fixtures; this does not establish that the owner's scanner/worker is available. Command: `npx playwright test --config playwright.prompt-editor.config.ts --output output/prompt-image-investigation` — 1 passed, 57.1 seconds overall. The successful insertion path did not reproduce image loss. Prettier and `git diff --check` passed (existing CRLF warnings only).

The follow-up screenshot confirmed unavailable/pending processing. The local API and worker were running, but the worker had neither scanner setting and no project-root `.env` existed. The owner explicitly approved a project-local scanner installation, signature download, scanner-only environment configuration and development restart. Installed official ClamAV 1.5.5 x64 under ignored `.runtime/clamav/`; archive SHA-256 matched the official release digest `90169f5e551010bfbd0208b50d9b2fa8988ef396cccbd46b0cc8cae03e22a4a4`. FreshClam downloaded and tested daily/main/bytecode databases. Configured only `CLAMSCAN_PATH` and `CLAMSCAN_DATABASE` in ignored `.env`. No application scan, download, publication or authorization rule changed.

Restarted the local development runtime; API readiness returned `ok` and the new worker inherited both scanner paths. The real application `scanFile` returned `clean` for an original synthetic PNG. No customer upload was inspected or manually marked clean.

Added explicit opt-in native qualification to `scripts/overview-browser-start.ts` and the prompt journey: `PROMPT_NATIVE_SCAN=1`, `QA_CLAMSCAN_PATH=<absolute clamscan.exe>`, `QA_CLAMSCAN_DATABASE=<absolute database directory>`, then `npx playwright test --config playwright.prompt-editor.config.ts --output output/prompt-image-native-retest`. This still creates an isolated ephemeral database/private root, disables live mail/AI, and uses synthetic accounts/content. Native mode removes both scan-status and image-download fixtures. Result: **1 passed, 1.4 minutes overall**; real multipart upload, worker scan, private download (decoded width asserted), actual draft save/readback/reload and preview all passed. The first native run reached image insertion but a broad test locator also matched ProseMirror's separator image; narrowed the locator to the test image and reran without weakening assertions. `npm run typecheck` passed. No full-suite/build rerun is claimed for this configuration/test-only correction.

Operational maintenance: keep the local signature databases updated with `.runtime/clamav/clamav-1.5.5.win.x64/freshclam.exe --config-file=.runtime/clamav/freshclam.conf` from the project root. No scheduled updater or Windows service was installed. Previously unavailable uploads require the existing explicit Retry action; they were not bulk retried or published. Status: local configuration fix and automated end-to-end verification complete; owner confirmation of the original upload remains pending.

- Explicit author-selected text colors are document content, not automatically contrast-adapted UI tokens. Some palette/theme combinations can be low contrast; default controls/theme behavior and the tested light-content sample pass axe, not every possible authored color/highlight combination. No universal content-contrast claim.
- Chromium/Chrome exercised; no fresh Firefox/WebKit qualification. Production build verified, but focused integrated browser runs use the isolated dev renderer.
- Browser servers emitted transient readiness-proxy ECONNREFUSED messages before API startup; final checks passed. The component bundler reports existing cross-file `composes` property-order warnings in shared form-layout/controls CSS; no unrelated styles were changed to suppress them.
- Existing media tests and unavailable-scan UI coverage do not qualify a production antivirus service. No live emails/AI calls, private source data, saved operator database or production storage used.
- No full application suite or new PostgreSQL concurrency run; affected assessment coverage is recorded above. Human visual/owner acceptance remains outstanding.

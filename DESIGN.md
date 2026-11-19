# Design system — Training Assessment Tracker V2.1

## Global design-system directive — 18 November 2026

The user supplied Bernie's instruction to use the Overview, Clients, People & access, Audit Log and Settings implementation on `ui/settings-figma` as the global visual system across every existing route. This directive supersedes the older restriction to a few platform routes and the requirement to preserve the old visual presentation. Preserve existing information order, actions, workflows, permissions, approval/scan/immutable-record/budget/N+2 rules, URLs, theme precedence and client branding. Ask before changing a workflow or inventing a different layout.

Use the current reference components and semantic tokens to establish reusable controls and a single authenticated shell, plus an appropriate guest layout. Migrate page contents, child dialogs and loading/empty/error states, not just navigation. Keep editor/assessment utilities until their consumers are replaced. Remove old presentation only after route coverage and consumer checks pass. UX Engine is available locally at `ux-engine-v2.4.0/agent-skills/`; use its design-system, visual-character, responsive and state-completeness instructions throughout. The earlier missing-package finding is resolved.

Implementation status: shared foundations and the first generalized-shell/account migration are locally verified. Bernie's complete `codex/assessment-workflow-fixes` branch at `e44b295` is integrated through local merge `dffeacd`; the source question is resolved. Remaining-route migration and old-shell retirement are open. `docs/implementation/GLOBAL_UI_ROUTE_INVENTORY.md` is the route checklist and `GLOBAL_UI_INTEGRATION.md` records reconciliation/evidence. No push or deployment. The earlier design sections below are retained as historical reference; their route-limited scope is superseded, not evidence of global completion.

## Global character and world

People, evidence, accountable review. Preserve the existing Figma implementation's deliberately compact sans-serif hierarchy, cool navy surfaces, blue actions, tight control groups and bordered panels. Existing screen structure and copy remain authoritative; this is an extraction, not a new visual direction.

## Global typography

`--ui-font`: Inter, 'Segoe UI', sans-serif, using the existing locally installed/system fallback stack deliberately; no new network font dependency. `--ui-text-small` 12px, `--ui-text-label` 13px, `--ui-text-body` 14px, `--ui-text-control-mobile` 16px, `--ui-text-section` 20px, `--ui-text-title-mobile` 24px, `--ui-text-title` 32px. Preserve the reference's 24px mobile heading rather than changing it to a skill default. Weights 400/500/600; page titles use 40px line height (32px mobile), body 22px, labels 18px. Existing timestamp/code font treatments remain until their bounded migration.

## Global color tokens

The opt-in `components/ui/tokens.module.css` theme scope supplies reusable semantics. It inherits the existing theme resolver for light, neon, platform and client palettes; only the plain Dark theme applies the Figma navy override. Personal theme precedence and branding generation are unchanged. Legacy `--ov-*` names temporarily alias these semantics for reference screens.

- `--ui-background`, `--ui-surface`, `--ui-raised`, `--ui-text`, `--ui-muted`, `--ui-border`, `--ui-focus` alias the active `--bg`, `--surface`, `--raised`, `--ink`, `--muted`, `--line`, `--focus`. Light defaults remain #f4f8fb / #ffffff / text #203f59; dark values come directly from Overview: #070b16 / #0d1426 / #111a30 / #e9edf7 / #98a2bc / #1a2440 / #7baaff.
- `--ui-accent`: light #1d4668 via `--primary`, dark #2f6beb; primary actions only. `--ui-on-accent` inherits the theme's `--on-primary`, with #ffffff for plain Dark. `--ui-link` inherits `--primary`, dark #7baaff, to keep text links legible.
- `--ui-danger` / `--ui-danger-bg` inherit `--error` / `--error-bg`: light #991b1b / #fff1f1, dark #fca5a5 / #341b1b. Blue accent and red danger remain distinct.
- `--ui-warning` / `--ui-warning-bg`: light #855000 / #fff1cd, dark #fbbf4a / #2b2010, extracted from Overview notices.
- `--ui-success` / `--ui-success-bg`: light #146c45 / #e5f7ed, dark #4ade9a / #0f2a22, extracted from Clients badges.
- `--ui-sidebar`, `--ui-active`, `--ui-tertiary`, `--ui-glow` preserve the existing shell's sidebar, hover surface, supporting text and top gradient. `--ui-backdrop` #000a preserves native-dialog separation.

## Global radii and spacing

`--ui-radius-control` 8px; `--ui-radius-icon` 10px; `--ui-radius-panel` 14px; `--ui-radius-pill` 999px. These are the current reference values: compact controls, softer panel grouping, labeled status pills. One-pixel borders are the primary separator; shadows are reserved for existing floating menus.

`--ui-space-1` through `--ui-space-8`: 4px / 8px / 12px / 16px / 20px / 24px / 32px / 40px. This extracts the four-pixel rhythm: 8px within fields, 16px within sections, 24px between groups. Preserve existing 248px navigation and 800px shell breakpoint; table/form breakpoints remain feature-specific.

## Global states and status badges

Hover derives from `--hover`; primary hover uses the existing brightness treatment. Focus is 2px `--ui-focus` with a 3px offset, controls 2px. Disabled opacity remains 0.65 with a not-allowed cursor. Buttons retain explicit action-specific busy labels and native disabled behavior. Feedback uses alert for errors, status for completion; it does not discard values or invent automatic retries.

Status text always accompanies color. Measured reference contrast pairs: warning light #855000 on #fff1cd is 5.95:1; warning dark #fbbf4a on #2b2010 is 9.61:1; success light #146c45 on #e5f7ed is 5.78:1; success dark #4ade9a on #0f2a22 is 8.88:1. Dark primary #ffffff on #2f6beb is 4.75:1. Existing error ratios remain 7.56:1 light and 8.39:1 dark. Generated palettes require browser contrast checks; hardcoded dark overrides never apply to platform/client theme names.

## Global components and responsive rules

Shared controls live in `components/ui/`: Button (primary, secondary, ghost, danger), PageHeader, Panel, Badge, Input/Select/Textarea, Feedback, RouteTabs, native Dialog, DirectoryTable and Pagination. Preserve form attributes, refs, events, ARIA and existing workflows. RouteTabs uses navigation links and `aria-current`, not tab-panel keyboard semantics. Dialog retains native Escape/focus return and includes form fields in focus containment. DirectoryTable extracts the Clients base table and optional stacked rows at the existing 1270px breakpoint; all cells and their labels remain present. Feature CSS owns column widths, mobile sort controls and row actions. Pagination supplies wrapping navigation; callers retain page conditions, numbers, disabled state and URL behavior. This extraction is not evidence that every route uses these components yet.

At 800px and below, use 16px form controls and the reference 24px headings. On coarse pointers controls have a 44px minimum hit target. Headers, tabs and actions wrap; flex/grid children use min-width: 0; long labels wrap. Existing mobile navigation clearance and safe-area padding remain. Components are opt-in during migration so unverified routes do not receive accidental restyling.

## Shared application shell and account pages

`ApplicationShell` generalizes the reference shell for platform and learning workspaces. Preserve the existing navigation destinations, role predicates, client selection and account controls. Platform navigation keeps its five-item mobile bar; the longer existing learning navigation uses a labeled native menu dialog. The active page comes from the existing URL. The legacy authenticated branch stays only for routes awaiting bounded migration.

For `/platform/admins`, `/accounts` and `/account/security`, retain the current information order, form stages and confirmation actions. Use the shared PageHeader, Panel, native fields, buttons, password show/hide controls, feedback, dialog and stacked directory table. Panels use 24px padding (16px mobile), 24px between sections, 16px within forms and 8px inside password controls. No new account or assessment workflow is introduced. Account routes retain their existing shared/platform branding scope, even when a client is selected; client-scoped theme precedence remains owned by `useBrand`.

The visual change is deliberate: legacy generic panels and the second navigation treatment give way to the reference navy surfaces, blue primary actions, 14px body/32px desktop titles, 14px panels and compact labeled fields. Existing light/neon/generated palettes remain inherited. Private setup links, MFA keys and recovery codes must not enter screenshot evidence. Source: local UX Engine design-system, visual-character, responsive, state-completeness, restyle and form-ux instructions; evidence in `GLOBAL_UI_ACCOUNT_QA.md`.

Client selection at `/clients` reuses the same shared shell and panel/header/feedback/buttons while retaining the existing single-column list of client actions, loading/empty/retry copy and Back to workspace link. No new chooser layout, automatic selection rule or permission behavior is introduced. Long client names wrap within the existing shared button; coarse-pointer controls retain the shared 44px minimum. Selection remains a shared/platform branding surface.

## Client directory and administration

`/people` and `/administration` use the shared learning shell with the existing client-required loading/selection boundary. Client-scoped branding and personal theme precedence remain owned by the existing resolver. The People API remains restricted to client administration authority; the directory does not grant broader member access.

Keep administration's existing section order: team creation, people/assignments, coordinator allocations, training-record creation and promotion ledger. Replace presentation with shared panels, native fields/buttons, labeled stacked tables, pagination and dialogs while preserving all reason/version inputs, review stages, membership/sensitive-access confirmations and promotion request keys. Existing mock-only local-person choices stay mock-only. No new management workflow is introduced.

The shared form layout leaves hidden forms hidden, including enrolment review. Its low-specificity form rules let desktop search rows remain horizontal. Dialog sections use 16px gaps; actions/radio groups wrap with 8px gaps. Before: these surfaces used legacy global panels/tables/dialogs. After: the reference type scale, semantic palettes, 14px panels, 8px controls and compact responsive spacing apply to their contents and states. Evidence: `GLOBAL_UI_CLIENT_ADMIN_QA.md`.

## Client AI settings and Appearance

`/settings/ai` and `/settings/appearance` retain their existing section order and workflows inside the shared learning shell. AI settings use shared panels and native fields for the registry, task routes and uncertain-charge reconciliation. Keep exact routing versions, budget units, reload/charge confirmations, pending and disabled actions. No new provider or billing flow is introduced.

Client Appearance uses the same shared form layout and a scoped theme gallery and generated-preview component stylesheet. Before: legacy 16px workspace typography, generic panel/control radii and global gallery/preview selectors. After: the reference 14px body/32px desktop title, semantic navy/light/generated surfaces, 14px panels, 8px controls and 24/16/8px section/form/control spacing. Preserve the existing gallery's 135px minimum tracks and 72px swatches; at 800px use two gallery columns and one preview column. Preview colours still come from the existing palette generator, never the surrounding theme. Personal themes, inherited platform branding, client modes, native logo selection/removal and versioned saves are unchanged. Shared feedback and reload controls also apply to the existing platform Appearance consumer and require its regression suite. Evidence: `GLOBAL_UI_CLIENT_SETTINGS_QA.md`.

## Learning workspace Overview

`/dashboard` keeps the welcome, baseline message, account/journey pair, scoped plan cards and background receipts in their existing order. Replace the legacy hero/type treatment with shared navy/light/generated panels and the reference sans-serif hierarchy. Retain the two-column account/journey and plan grids on desktop; collapse them at the existing 800px breakpoint. Use shared PageHeader, Panel, Badge, Button and Pagination, 24px panel gaps/padding (16px mobile), 14px panels and 8px controls. Plan cards retain every status, team, member, duration and destination. Counts are still server-scoped; Global Admin does not gain learning access.

Background receipts uses shared presentation on Overview and training-record details. Its five-second polling, local-only receipt copy, error details and recovery remain unchanged. The previously hidden Overview hero illustration is removed. Retain legacy journey utilities while setup consumers remain; unused receipt selectors are now retired.

## Training-record directory

`/enrolments` retains its existing single-column search and record list, twenty-record pagination and permission-dependent destinations. Shared header, native search/buttons, panel, feedback and pagination use the global theme tokens. Record sections keep their title/member, raw status and current record/onboarding/learning links; unavailable private inputs retain the existing explanation. Use 16px record spacing, 8px within each record and 44px link targets for coarse pointers. Do not add a status filter or redesign the list into a new table. Correct repeated search loading with an explicit refresh trigger and use the existing sign-in destination for signed-out visitors; backend search and access decisions remain authoritative.

## Training-record details

`/enrolments/[id]` retains the existing action navigation, heading/status, two-column foundation/evidence panels and full-width background receipts. Panels stack at 800px. Use the shared title hierarchy, semantic palettes, 14px panels, 24/16px panel padding and 20px grid gap. File metadata/actions wrap within their panel; file controls use the shared borders, focus and 16px mobile type, with 44px coarse-pointer chooser/link targets. Summary-only access keeps its existing explanatory panel; detail/upload/manage flags remain server-owned. Preserve upload quarantine, error retention, refresh, local checks and receipt polling. No new confirmation, file deletion, offline flow or changed workflow is introduced. Both BackgroundReceipts consumers now use shared presentation; the temporary legacy branch is removed. Generic file-list styles still serve other routes; unused receipt and detail-grid selectors are retired.

## Onboarding

`/enrolments/[id]/onboarding` retains six input steps and the seventh review/create step, existing field order, schedule/KPI groups, review disclosures and native assessment/calendar confirmations. Use shared fields, buttons, panels, badges and feedback. Step buttons wrap with an explicit current-step state; schedule/KPI grids stack at 800px. Preserve the existing three KPI groups rather than introducing a new layout. Assessment uploads reuse the record file-control styling. Drafts remain page-memory only, with the same 800ms autosave and version checks. Register pending saves, changed inputs and calendar/curriculum reasons with the existing shared work guard so navigation, client switching and sign-out preserve work; the parent owns the curriculum reason guard. Signed-out visits use the existing login destination. Native field constraints, permissions, assessment confirmation, calendar versions, curriculum budget and approved history remain authoritative.

## Curriculum editor

`/enrolments/[id]/plan` retains block navigation, reference disclosures, lesson/rubric fields, version history, comparisons, full-baseline review and approval receipt in their existing order. Its generation request disclosure shares the same controls; generation progress remains a separate migration. Use shared headers, badges, panels, fields and buttons, wrapping block controls, 16px group spacing and two-column rubric/time/comparison groups that stack at 800px. Preserve all field constraints, version requests, permissions, confirmation text and immutable approved history. Register block edits, rationale, revision notes and pending saves/queues with the shared work guard. Signed-out visits reach login. Retire unused global step-nav, lesson, receipts and comparison selectors after checking consumers; retain review-section, file-list, preserve-lines and unrelated assessment/editor utilities.

## Generation progress

`/enrolments/[id]/generation/[runId]` retains its progress/budget panel followed by configuration/provenance, provider attempts and manual refresh. Use the shared header, panels, feedback and button with 24px section spacing and 16px panel spacing; keep ordered block entries and all provenance details. Wrap long provider/request identifiers without hiding data. Keep currency amounts together with tabular figures. The existing three-second queued/running polling, terminal-state notices, retained details on refresh failure and exact generated-version link remain. Signed-out visitors use the existing login destination. No new generation, retry, reconciliation or approval action is introduced.

## Document review

`/enrolments/[id]/documents/[fileId]` retains file/scan information, the untrusted-text notice, download/request actions, extraction status and read-only text, five review fields, save/confirm actions and attempt history in their existing order. Apply shared headers, panels, feedback and native controls with 24px section spacing, 16px field spacing, wrapping actions and 16px mobile inputs. Extracted text preserves whitespace and wraps long lines within the panel. Keep the original confirmation and reload prompts, scan/editability gates, polling, exact run/onboarding versions and source-bound receipt. Register dirty and pending work with the shared navigation guard; downloads in a new tab remain available. Signed-out direct visits reach login. Do not add automatic confirmation or AI actions.

## Learning delivery

`/enrolments/[id]/delivery` retains the member/title/status header, curriculum/progress links, activation/lifecycle controls, ordered block/lesson lists and submissions. Use shared headers, badges, panels, reason fields, buttons and feedback with 24px section gaps and 16px internal spacing. Lesson metadata stays below its link and wraps on mobile. Resume previews retain their existing nested articles and exact dates. ReasonAction opts into shared styling here while other consumers retain legacy presentation. Register reasons, changed preview weeks and pending decisions with the shared work guard; retain native activation, early-start, pause, completion and resume confirmations. Existing version, approval, capacity and completion rules remain server-owned. Signed-out visits reach login; session/data loading has scoped recovery.

## Learning lesson

`/enrolments/[id]/delivery/[blockId]/[index]` retains the lesson context, objective/content/rubric/resource panel, member response and quiz, supporting evidence, attempt history and coordinator quiz disclosure in their existing order. Use the shared shell, header, panels, fields, buttons and feedback with 24px sections, 16px internal spacing, 14px panels and wrapping prose/file names. Labels and controls retain native keyboard semantics and 44px coarse-pointer targets. Evidence presentation opts in here; the assessment response consumer remains unchanged until its own migration.

Preserve the 800ms autosave, newer edits during a save, exact draft versions, idempotent immutable submission, scan gates, five-file limit, answer indexes, final quiz publication and all API permissions. Register changed response/quiz inputs, a chosen upload and pending mutations with the shared work guard. Successful submission uses the existing confirmed-mutation receipt handoff. Signed-out visitors reach login. Do not introduce a new lesson layout or alter scheduling, attempt, approval or assessment rules.

## Submission receipt and review

`/enrolments/[id]/submissions/[submissionId]` preserves the submitted snapshot, evidence and quiz answers, integrity/rubric disclosure, feedback, grading history, human assessment, appeals and withdrawal in their current order. Use shared headers, panels, fields, buttons and feedback; 24px sections, 16px form spacing, wrapping integrity hashes and filenames, preserved response whitespace and native grouped radio/checkbox controls. Retain the existing rubric fieldsets and review disclosure rather than introducing a new layout. Mobile uses 16px controls and 44px coarse-pointer targets.

Keep every exact-version decision, pinned rubric, insufficient-evidence gate, provisional versus official result, native confirmation, immutable history, appeal authority and case-closure handoff. Shared work protection covers human assessment inputs and every reason/pending action. Polling continues only while a grade is queued and retains the current receipt on refresh failure. Signed-out visits reach login. Guest and other learning pages remain separate migrations.

## Progress and evidence

`/enrolments/[id]/progress` retains KPI cards followed by learning support, with evidence lineage, workplace observations, future definitions, adaptation review and support suggestions in their existing order. Use shared headers, panels, feedback, fields and buttons, 24px sections and 16px internal/form spacing. Preserve the existing three definition fieldsets and disclosures, including their full field set; do not invent a wizard or dashboard. Wrap lineage identifiers and long teaching content. Mobile fields use 16px type; coarse-pointer disclosures/controls retain 44px targets.

Missing samples remain nonnumeric; snapshots and observations retain their original definition and history. Future effective dates, comparability, human approval, exact proposal/base versions, N+2/freeze/started-block rules and member projections stay server-owned. Shared work protection covers observation/definition inputs, changed adaptation block selection, reasons and pending mutations. Queued background work remains safe to leave after the request completes. Preserve polling/retry and retained content on refresh failure; use separate support loading feedback. Signed-out visits reach login.


## Learning review queue

`/learning-reviews` retains oldest-first review links, attempts/statuses, twenty-item pagination and the separate case-routing panel. Use shared headers, panels, controls, feedback and pagination with 24px sections, 16px record spacing and 8px status spacing. Keep the list and native case disclosures; no new table or review workflow. Case identifiers wrap, controls use 16px mobile type and coarse-pointer targets are 44px. Preserve independent reviewer eligibility, case-only authority, reasons and confirmations. Shared work protection covers changed reviewer selections and pending/reason actions; routing reload failures retain forms. The displayed page remains tied to the fetched records during refresh or failure.

## Notifications and preferences

`/notifications` retains the client heading, Workspace link, account-wide email preference and scoped event list with twenty-item pagination. Use shared panels, header, radio fields, buttons, feedback and pagination. Preserve the existing notice link/date/status information, 24px sections, 16px records and 8px metadata spacing. Timestamp values remain together with tabular figures; long event text wraps. Coarse-pointer radio labels and notice links have 44px targets. Keep the synthetic sink and relay-acceptance explanation, exact preference payload and no new read/acknowledgment action. Shared work protection covers changed preferences and pending saves. Refresh errors retain current events and unsaved preference state; page controls operate on the displayed page.

## Assessment directory and appeal routing

`/assessments` retains the definition library, assigned-assessment list and independent appeal routing in that order. Shared directory tables retain every column and row action in labeled stacked rows below 1270px, matching the global directory rules. Keep separate twenty-item pagination and permission-dependent build/edit/revise/assign/open destinations. Use shared panels, header, buttons, select/textarea, feedback and pagination with 24px sections, 16px form gaps and wrapping titles/identifiers. Coarse-pointer links/disclosures have 44px targets; mobile fields use 16px type. Keep the native reviewer confirmation, required reason and case-only authority. Shared dirty/pending guards cover selections and reasons; paging and routing-refresh errors retain mounted forms. Keep entered reasons after successful assignment while marking that submitted value saved. Definition/assignment editors and response/review pages remain separate bounded migrations.

## Assessment response and review

`/assessments/assignments/[id]` uses the shared shell and visual system for sectioned answers, evidence, immutable submission history, results, file verification, human decisions and appeals. Preserve the existing information order, question references from the full pinned definition, section progression, autosave/retry semantics and native submission/decision confirmations. Shared panels use 24px padding (16px mobile), wrapping actions, 16px mobile fields and 44px touch targets. Keep the matrix container rules and native radio semantics; specific matrix-label rules retain alignment inside shared form styles. ResponseEvidence opts into its existing shared implementation. Review reason inputs join the existing dirty/pending guards; a confirmed appeal decision uses the shared committed-navigation helper. No scoring, release, scan, approval, N+2 or reviewer-independence rule changes.

## Assessment assignment form

`/assessments/definitions/[id]/assign` uses the shared application shell, PageHeader, fields, buttons, status badges and feedback. Preserve published-revision context, recipient mode/search/selection/confirmation, eligibility explanation and team rules in their existing order. Reuse 24px panel padding (16px mobile), 16px field spacing, wrapping rule actions and the native required confirmation checkbox. Status remains readable without color. Selections and pending mutations participate in the shared work guard; successful assignment acknowledges the submitted selection without removing it. Refresh failures keep the form and rules visible, with a separate retry. Stop/resume/retry preserve current API versions, eligibility and pinned assignments. No new assignment workflow or authority is introduced.

## Assessment definition builder

`/assessments/definitions/[id]`, including `new`, keeps the four authoring steps, sticky save/provenance header, section manager, question list/editor, rubric, readiness checklist, learner preview and private recovery comparison. The imperative editor applies the same native-control and panel classes as the shared React primitives through a small presentation adapter; generated matrix/preview fields use that adapter too. Feature CSS owns editor layout and rich-text/matrix behavior. Use shared 32px/24px titles, 20px section headings, 24px/16px panels, 16px internal groups, 8px controls and semantic palettes/focus/error states. Preserve the existing 1000px question-grid and 639px question-list/action breakpoints. Mobile editor/fields use 16px text, coarse-pointer controls use 44px targets and scroll clearance follows the measured sticky header. Do not flatten the editor into generic form layouts. Preserve existing saves, exact publication/recovery, answer-key privacy, scan gates, undo and shared work guards. Remove builder-only legacy styles after consumer checks; shared assessment matrix/response utilities remain until their consumers migrate.

## Guest sign-in and private account links

`/login` and `/account/link` opt into `GuestShell`, sharing semantic tokens, platform branding and the existing guest theme preference. Christian's Pre-login v2 frames supply the desktop split sign-in layout (560px brand panel, 380px form), centered 440px account card with 36px padding, 40px brand headline, 28px sign-in/mobile title, and 20px mobile page inset. These are explicit guest geometry extensions; the 800px breakpoint, shared navy/light/generated palettes, 14px panels and 8px controls remain. At mobile sizes the brand introduction and card border disappear; forms use 48px controls, 16px input text and bottom actions in normal flow, with safe-area padding. Long forms scroll without fixed controls covering fields.

Source frames: `6984:3988`, `7007:8148`, `7001:7171`, `7007:8206`, `7001:7574`, `7007:7854`, `7007:8356` in the supplied Figma file. Preserve the current combined MFA/recovery field, single-step password/confirmation form, recipient/client/expiry information, required invitation acceptance, show/hide controls and administrator-issued links. Forgot password expands the existing administrator guidance. Do not introduce email recovery, multi-step authentication or a fabricated strength/common-password result. Existing dynamic branding and accessible theme controls take precedence over static sample branding. The public context does not expose an environment value, so do not infer a sandbox badge from password authentication alone.

The account-link form registers dirty/pending work in page memory and retains inputs when rechecking the same credential. Fragment changes still clear the previous recipient and form; successful redemption removes the fragment. No passwords, tokens or MFA secrets are persisted in browser storage or screenshot evidence. Setup and shared error pages retain their separate migrations; login-specific legacy CSS still has setup consumers. Evidence: `GLOBAL_UI_GUEST_AUTH_QA.md`.

## Setup and installers

`/setup`, `/setup/local` and `/setup/hosted` use the shared GuestShell with SetupFrame, semantic panels, fields, passwords, buttons, badges and feedback. Christian's setup frames `7001:6540`, `7001:6636`, `7001:6749`, `7001:6860`, `7001:6962` and `6984:3323` supply the 810px stepper region, 640px card/32px padding, 24px title, 14px radius and 560px completion card/36px padding. Keep actual dynamic branding and guest theme precedence. Below 800px the stepper wraps into three columns, paired fields stack, card padding is 20px and fields/buttons retain 48px height and 16px input text. This is a responsive adaptation of desktop setup frames, not a claim of supplied mobile setup frames.

Preserve the legacy initializer's existing stages and the installers' token, requirements, database, administrator, review, progress and completion behavior. Requirements and progress are actual API values: four saved installation stages and, locally, 25 fixture steps. Do not invent the prototype's optional checks, percentage, separate connection-testing flow or edit shortcuts. Local PGlite remains local-only; hosted setup uses PostgreSQL. Preserve private review summaries, empty-database protection, retry, pause/resume, automatic local runtime handoff and hosted restart guidance. Dirty/pending forms use the existing work guard; same-step reload preserves mounted entries and the selected database engine. Retire obsolete login-grid, login-panel, intro-heading, steps and journey-steps rules only after their last consumers move; shared mobile-grid rules remain.

Bernie's response forwarded by the user confirms preserving the current authentication flow; Christian's additional authentication workflows are future work. This resolves the earlier guest-auth clarification, without implying human acceptance of the implemented UI. Setup evidence: `docs/implementation/GLOBAL_UI_SETUP_QA.md`.

## Shared recovery and root redirect

`error.tsx` and `not-found.tsx` use the standalone RecoveryFrame with shared semantic tokens, PageHeader and button/link styles. Retain the existing single-column title, explanation and one recovery action; do not add navigation, account information or inferred permissions. The frame has no session or branding fetch dependency. It inherits the document's resolved theme and palette without overwriting preferences; a fresh document before appearance resolves retains the existing root default. Keep 32px/24px headings, 14px text, 24px section gaps, existing 1260px content maximum and 20px mobile inset. Mobile/coarse-pointer actions have 48px targets. Focus the main landmark when the fallback mounts; keep the root skip link functional.

The error action uses the installed Next.js `retry` callback to refresh and reset the boundary; `reset` is still supported but does not itself refresh. Preserve the existing error copy and never render exception details. Not-found keeps its `/` return link, framework 404 and noindex behavior. `/` remains the unchanged redirect to `/dashboard`; session/client/role destinations are not redesigned. Evidence: `docs/implementation/GLOBAL_UI_RECOVERY_QA.md`.

## Historical design record

The sections below retain the earlier scoped design decisions. The global contract above governs new UI work.

## World
Employee learning, assessment evidence and accountable human review. Apply the supplied Figma visual character while preserving existing workflows and information architecture.

## Overview UI exception — 17 November 2026

The user authorized the supplied Figma desktop frame `6939:1670` and mobile frame `6939:4740` in file `eQejFiVgug5zmBTd9aVGHx` for the `/platform` Overview, following Bernie's approval to proceed with UI work. Its scoped layout uses a 248px desktop sidebar, a workspace menu and mobile bottom navigation. The dark palette follows the frames; existing light, branded and personal theme behavior remains available. Existing workflows and permissions remain authoritative, and other pages retain the V2 layout. Interim destination/count/activity decisions are recorded in `docs/implementation/OVERVIEW_UI_QA.md`; these are implementation assumptions, not completed team acceptance.

## Clients UI exception — 17 November 2026

The user authorized continuing with the Clients desktop frame `6939:1831` and mobile frame `6939:4866` in the same Figma file while userflow work continues. `/platform/clients` shares the Overview shell with Clients selected. The directory uses a desktop table and stacked mobile entries, original exported icons, real counts, native search/status controls and existing guarded dialogs. Sorting, pagination and account-access management remain available; the latter is expandable and opens through the People & access link. Interim choices and intentional accessibility differences are recorded in `docs/implementation/CLIENTS_UI_QA.md`. Other routes keep their current layouts. This does not imply acceptance of the pending userflow.

## People & access UI exception — 17 November 2026

The user authorized building Figma desktop frames `6939:2013`/`6939:2352` and mobile frames `6939:5012`/`6939:5326` in file `eQejFiVgug5zmBTd9aVGHx`. `/platform/people` shares the Overview/Clients shell and presents All accounts and Global admins directories. Existing account creation/invitation and guarded client/platform role mutations remain authoritative. The existing directory GET adds an optional admin view, current grant/eligibility fields and unfiltered tab totals; mutation rules are unchanged. Interim userflow choices and automated evidence are recorded in `docs/implementation/PEOPLE_ACCESS_UI_QA.md`. This does not imply team acceptance of pending userflows.

## Audit Log UI exception — 17 November 2026

The user authorized Figma desktop `6939:2491` and mobile `6939:5430` in file `eQejFiVgug5zmBTd9aVGHx`. `/platform/audit` shares the platform shell with Audit selected and presents UTC date groups, responsive event rows, filters and a read-only details dialog. Existing audit GET semantics, approved change-field projection, permissions and 25-event pagination remain authoritative. No audit records, API or mutation behavior changed. Details and evidence are in `docs/implementation/AUDIT_LOG_UI_QA.md`.

## Settings UI exception — 17 November 2026

The user authorized Figma desktop frames `6939:2692`/`6939:2861` and mobile frames `6939:5599`/`6939:5741` in file `eQejFiVgug5zmBTd9aVGHx`. `/platform/settings` and `/platform/settings/status` present Appearance and System status in the shared platform shell; `/platform/appearance` remains a working alias. Existing versioned branding saves, logo rules, audit reasons, personal theme precedence and status APIs remain authoritative. The profile button opens personal settings so mobile themes and account security remain reachable. Evidence and interim placements are recorded in `docs/implementation/SETTINGS_UI_QA.md`; this does not imply acceptance of the pending userflow.

## Typography
Use the existing Inter, "Segoe UI", sans-serif stack (Inter only where installed; no external font request), with Georgia for the existing learning hero. Current workspace override: body 16px, mobile inputs 16px, headings 32px (27px below 800px), hero 36px desktop and 30px mobile. Preserve source hierarchy rather than introducing a new brand.

## Color
Light: --bg #f4f8fb, --surface #ffffff, --ink #203f59, --muted #586e80, --primary #1d4668, --on-primary #ffffff, --error #991b1b, --error-bg #fff1f1.
Dark: --bg #0a0a0a, --surface #171717, --ink #fafafa, --muted #a3a3a3, --primary #e5e5e5, --on-primary #171717, --error #fca5a5, --error-bg #341b1b.
Neon cyan/emerald/amber and per-client branding retain the source stylesheet tokens. Blue action color is distinct from red destructive/error state.

## Radii
Source buttons 6px, navigation 8px, panels 12px, hero 15px. Retain existing shapes.

## Spacing
Base 4px. Scale 4/8/12/16/24/32/40/48/64px. Compact controls within groups, generous separation between task sections. Existing 240px sidebar and responsive collapse remain authoritative.

## States
Hover uses --hover; focus is 2px --focus with 4px offset; disabled controls use 0.65 opacity and not-allowed cursor. Pending buttons show operation-specific text and aria-busy. Errors preserve entered values and offer retry.

## Status and badges
Light error #991b1b on #fff1f1: 7.56:1. Dark error #fca5a5 on #341b1b: 8.39:1. Neutral status uses --ink on --surface (light 10.96:1; dark 17.18:1). Status always has a text label. Ratios must be recalculated for dynamic client palettes.

## Components and voice
Retain source panel, button, field, table and navigation classes. Action labels use sentence case and concrete verbs. Each screen retains its existing primary action. New optional MFA controls follow the same settings patterns.

## Responsive behavior
Under 640px: single-column forms, 16px inputs, controls at least 44px for coarse pointers, no page-level horizontal overflow. Wide matrices may scroll in a named region. Preserve readable labels and reachable recovery controls.

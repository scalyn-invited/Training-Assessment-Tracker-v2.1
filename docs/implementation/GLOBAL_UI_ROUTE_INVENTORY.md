# Global UI route inventory — 18 November 2026

This is the migration checklist, not a completion claim. Source: the local integration of `ui/settings-figma` at `440fcc8` and fetched `origin/main` at `7bcef2c`, merge `a5a9334`. There are **38 page routes and two shared recovery screens**. Every row below remains subject to global-system integration and fresh feature verification, including the already styled reference pages.

Paths below are relative to `apps/web/app`. `page.tsx` is the entry component unless another component is named. Server-side, environment-scoped permission checks remain authoritative; navigation visibility is not authorization. A Global Admin does not automatically receive client training, sensitive assessment or reviewer access.

## Existing shells and common states

- **F**: `components/app-shell.tsx` now selects `ApplicationShell` on the seven reference routes plus `/platform/admins`, `/accounts`, `/account/security`, `/clients`, `/people`, `/administration`, `/settings/ai`, `/settings/appearance`, `/dashboard`, `/enrolments`, `/enrolments/[id]`, `/enrolments/[id]/onboarding` and `/enrolments/[id]/plan`. Other nested training routes retain their own migration schedule. Platform users retain the reference sidebar/mobile bar; learning navigation uses existing role predicates, client selection and a native mobile menu. Client-required routes retain the loading/selection boundary. Denied platform visitors see authorized learning navigation plus the existing page denial. Before authentication resolves, guest presentation remains pending its bounded migration.
- **L**: legacy authenticated branch of `AppShell`: desktop sidebar and client selector, mobile navigation dialog, theme menu and sign-out controls. Preserve current role checks, automatic sole-client selection, explicit client switching, sandbox banner and navigation error/retry behavior during replacement.
- **G**: `Guest` is a wrapper around `AppShell`, not a guarantee that the page is a guest route. Actual guest routes use `BrandHeader` and a legacy container. Login, setup and account-link routes force guest layout even for a signed-in visitor.
- **R**: redirect only. **S**: standalone legacy container without `AppShell`.
- All F/L routes also require session-pending/error/retry, expired or revoked access, brand loading/error/retry, theme precedence and shell navigation checks. Shared F dialogs include Personal settings; shared L dialogs include the mobile menu. These are in addition to page-specific dialogs below.
- Each bounded migration must keep information order and existing action grouping. Applying existing components/tokens is authorized; changing workflows or inventing a different page layout requires confirmation first.

## 1. Remaining platform and account pages

| Done | Route | Roles / access boundary | Current shell and page components | Page dialogs / confirmations | Loading, empty and error states to preserve |
| --- | --- | --- | --- | --- | --- |
| [x] | `/platform/admins` | Global Admin; current/eligible grant rules and last-admin protection | F; `platform/admins/page.tsx`, shared panels/fields/table/pagination/dialog; evidence `GLOBAL_UI_ACCOUNT_QA.md` | Native grant/revoke review dialog; required reason and displayed version | Session/data loading; no administrators on page; no eligible accounts; data retry; action error/stale recovery; denial |
| [x] | `/accounts` | Global Admin or authorized Client Admin; API determines creatable/invitable/recoverable accounts and client scope | F learning mode; `accounts/page.tsx`, shared controls and `PasswordField`; evidence `GLOBAL_UI_ACCOUNT_QA.md` | Inline action review/confirmation; private one-time link result and hide/copy controls | Pending account administration; no issued links; auth-mode restrictions; invalid/stale action; failure retry; expiry/cancellation; private token must not leak into screenshots |
| [x] | `/account/security` | Signed-in account; local-password operations only where supported | F learning mode; `account/security/page.tsx`, shared controls and `PasswordField`; evidence `GLOBAL_UI_ACCOUNT_QA.md` | Inline TOTP enrollment/confirmation, one-time recovery codes, disable/current-password confirmation | Session pending; disabled/enabled MFA; generated secret/code display; validation/error/success; unavailable auth-mode state; password-change sign-out |
| [x] | `/clients` | Signed-in user; only API-listed active client access | F learning mode; `clients/page.tsx`, shared panel/header/buttons/feedback; evidence `GLOBAL_UI_CLIENT_CHOICE_QA.md` | No page dialog; client choice is the existing selection action | Clients loading; no active access; retry; selection busy/failure; global-administration link where allowed |
| [ ] | `/platform` | Global Admin | F reference; `platform/page.tsx`, `OverviewDialog` | System overview dialog | Independent metrics/account/history loading and retry; zero clients; no notices; no activity; role denial |
| [ ] | `/platform/clients` | Global Admin; client actions retain versions/reasons and suspension safeguards | F reference; `platform/clients/page.tsx`, `PlatformAccounts` | Create/edit/suspend/reactivate; account-access review controls | Directory loading/error/retry; empty search/status; paging; invalid/stale mutations; account-access subsection loading/error |
| [ ] | `/platform/people` | Global Admin; account/client/platform grants preserve eligibility and last-admin protection | F reference; `platform/people/page.tsx`, `AccountAccess` | Manage access and Global Admin appointment/revocation dialogs | All accounts / Global admins loading; no matches; pagination; stale grants; denied action; failure/retry |
| [ ] | `/platform/audit` | Global Admin; approved audit-field projection only | F reference; `platform/audit/page.tsx`, `OverviewDialog` | Read-only Change details dialog; advanced filter disclosure | Loading/error/retry; no matching events; invalid date range; empty payload; page/date groups; filters/history restoration |
| [ ] | `/platform/settings` | Global Admin for platform branding | F reference; `Appearance`, `SettingsLayout`, `PlatformAppearanceForm` | Native logo chooser; no new save-confirmation dialog | Branding pending/error/reload; permission denial; invalid names/colour/reason/logo; busy save; stale conflict retaining draft; discard; custom-logo removal |
| [ ] | `/platform/settings/status` | Global Admin | F reference; `PlatformSystemStatus`, `SettingsLayout` | Read-only; no configuration/credential dialog | Pending/retry; password/mock/unavailable identity; configured versus unverified email/AI; real assignment/client totals |
| [ ] | `/platform/appearance` | Global Admin; existing URL retained | F legacy URL rendering the same `Appearance` component | Same logo and branding behavior as Settings Appearance | Same pending/permission/validation/stale/discard cases; verify URL compatibility rather than silently removing |

## 2. Client administration and preferences

| Done | Route | Roles / access boundary | Current shell and page components | Page dialogs / confirmations | Loading, empty and error states to preserve |
| --- | --- | --- | --- | --- | --- |
| [x] | `/people` | Client administration authority for selected client; API delegates to the administration permission check | F learning mode; `people/page.tsx`, shared table/pagination/feedback; evidence `GLOBAL_UI_CLIENT_ADMIN_QA.md` | No page dialog; links retain role-based destinations | Session/client choice; member loading; no people; retry and pagination; Coordinator/Member denial |
| [x] | `/administration` | `canAdmin` for selected client; Global Admin required for Client Admin role mutations | F learning mode; `administration/page.tsx`, `Allocations`, `EnrolmentForm`, `PromotionPerson`, `PromotionLedger`, local-person form; shared controls/dialogs; evidence `GLOBAL_UI_CLIENT_ADMIN_QA.md` | Person management dialog; membership-end confirmation; promotion preparation/dispatch/reconciliation review; enrolment review step | Choose-client/denial; people/search empty; create-team/local-person validation; allocation/sensitive access failure; stale versions; promotion history empty; grant/revoke pending and last-admin limits |
| [x] | `/settings/ai` | Selected-client authorized administrator; API enforces routing/budget/reconciliation rights | F learning mode; shared controls in task policy and ambiguous-charge forms; evidence `GLOBAL_UI_CLIENT_SETTINGS_QA.md` | Existing reload and charge reconciliation confirmations; no credential entry | No client; initial/retry errors; no qualified provider; no supported task choices; no uncertain charges; per-policy validation/conflict/pending; bounded budget display |
| [x] | `/settings/appearance` | Selected-client member theme choice; authorized editor only for client branding | F learning mode; `Appearance`, shared controls, scoped theme gallery and generated palettes; evidence `GLOBAL_UI_CLIENT_SETTINGS_QA.md` | Native logo chooser; branding-mode/default theme/removal controls | Choose client; loading/retry; read-only versus editable; invalid logo/colour; version conflict; saved personal preference and reset; discard and inherited platform theme |

## 3. Learning and training records

| Done | Route | Roles / access boundary | Current shell and page components | Page dialogs / confirmations | Loading, empty and error states to preserve |
| --- | --- | --- | --- | --- | --- |
| [x] | `/dashboard` | Signed-in selected-client roles; `canAdmin`/`canCoordinate` drive relevant links; server-scoped records | F learning mode; shared header/panels/badges/pagination and `BackgroundReceipts`; evidence `GLOBAL_UI_LEARNING_OVERVIEW_QA.md` | No page dialog; shell mobile/personal settings dialogs | Context/data loading and retry; no active plans/records; role-specific admin/coordinator/member content; cancelled/failed background work |
| [x] | `/enrolments` | API-scoped training records; `canDetails` differentiates summary/detail access | F; `enrolments/page.tsx`, shared search/list controls and pagination; evidence `GLOBAL_UI_TRAINING_DIRECTORY_QA.md` | No page dialog | Signed-out/client redirects; loading/retry; no permitted records versus no search matches; search and pagination |
| [x] | `/enrolments/[id]` | Record participant/authorized coordinator or administrator; server `canDetails`, `canManage`, `canUpload` | F; `EnrolmentRecord`, shared foundation/evidence panels and receipt controls; evidence `GLOBAL_UI_TRAINING_RECORD_QA.md` | No page dialog; existing direct check/upload actions, native file chooser; no delete action exists | Pending/missing/denied; summary-only restricted record; no evidence; upload/scan states; action errors and receipt feedback |
| [x] | `/enrolments/[id]/onboarding` | API-scoped participant; `canManage` plus step/status-specific edit rights | F; `OnboardingScreen`, shared assessment/plan creation and schedule/KPI controls; evidence `GLOBAL_UI_ONBOARDING_QA.md` | Shared unsaved/pending work guard; native assessment/calendar confirmations; curriculum-reason step discard | Loading/retry; invalid/missing inputs; locked/read-only steps; stale confirmation; missing assessment/evidence; preserved drafts and review state |
| [x] | `/enrolments/[id]/plan` | Authorized curriculum reader/editor/approver; API decision and programme status | F; `Curriculum`, shared generation request, lesson/rubric and comparison controls; evidence `GLOBAL_UI_CURRICULUM_QA.md` | Shared unsaved/rationale/generation/pending work guard; version/block discard; complete-baseline approval review and confirmation | Loading/retry; no changes in block; read-only approved versions; validation/stale/conflict; generation busy/failure; immutable approval receipt |
| [ ] | `/enrolments/[id]/generation/[runId]` | Enrolment-scoped authorized viewer; request cancellation rights from API | L; `GenerationRun` | Existing cancellation/operation controls | Loading/retry; queued/running/cancelled/failed/ready stages; no provider attempts; validation/budget/provider failure and provenance |
| [ ] | `/enrolments/[id]/documents/[fileId]` | API-authorized document viewer; editable only when clean file, ready extraction, no run error and `editable` | L; `DocumentReview` | Unsaved finding leave/reload prompt; confirm findings/re-extraction controls | Loading/retry; queued/scanning/quarantined/unavailable file; extraction failure; disabled confirmation; stale input retained; success receipt |
| [ ] | `/enrolments/[id]/delivery` | Member or authorized programme coordinator/reviewer; API gates activation and actions | L; `LearningDelivery`, `LearningLifecycle`, shared reason actions | Programme activation/lifecycle reason confirmations | Pending/error/retry; not yet active/approved; no submissions; schedule/today states; paused/completed/withdrawn restrictions |
| [ ] | `/enrolments/[id]/delivery/[blockId]/[index]` | API-scoped lesson viewer; member owns response; separate coordinator quiz-configuration permission | L; `LearningLesson`, `ResponseEvidence`, quiz and editor controls | Unsaved work guard; immutable submission confirmation; quiz configuration confirmation | Pending/unavailable lesson; locked/future schedule; no submitted attempts; draft/save/validation/network recovery; scan restrictions; N+2 attempts |
| [ ] | `/enrolments/[id]/submissions/[submissionId]` | Submission owner / authorized primary reviewer / independently assigned appeal reviewer; API gates withdrawal/review | L; `SubmissionReceipt`, `LearningReview`, reason actions | Review/appeal/withdrawal confirmations; unsaved review guard | Pending/error/retry; no written body; missing evidence; provisional/manual grading; independent review recorded; stale/immutable receipt restrictions |
| [ ] | `/enrolments/[id]/progress` | API-scoped member/coordinator; `view.coordinator` controls KPI actions | L; `LearningProgress`, `MetricCard`, baseline/measurement controls, `LearningSupport` | Evidence/reason confirmations; unsaved baseline/measurement guards | Pending/retry; KPI definitions not yet available; insufficient samples; missing baseline; invalid evidence; readonly versus coordinator editing; support/notification errors |
| [ ] | `/learning-reviews` | Authorized reviewer queue; separately authorized Client Admin appeal routing | L; `LearningQueue`, `LearningAppealRouting` | Independent reviewer assignment confirmation and unsaved reason guard | No selected client; pending/retry; no permitted work; no appeals needing routing; no eligible independent coordinator; paging/conflict |
| [ ] | `/notifications` | Signed-in selected-client actor; scoped learning notices/preferences | L; `notifications/page.tsx`, `useLeaveGuard` | Existing preference/action confirmation and unsaved guard | Session/no client; list loading/error/retry; empty notices; read/acknowledgment and preference validation/recovery |

## 4. Assessments

| Done | Route | Roles / access boundary | Current shell and page components | Page dialogs / confirmations | Loading, empty and error states to preserve |
| --- | --- | --- | --- | --- | --- |
| [ ] | `/assessments` | Members see permitted assignments; API `assigned.author` enables coordinator definition library; separate appeal-routing rights | L; `assessments/page.tsx`, `AppealRouting` | Independent assessment appeal reviewer confirmation | Choose client; assignments/definitions loading and retry; no definitions/assignments; independent pagination; no eligible appeal reviewer |
| [ ] | `/assessments/definitions/[id]` | Authorized scoped coordinator author; `new` is an existing value of `[id]`, not an extra filesystem route | L; `AssessmentBuilder`, `assessment-builder/markup.ts`, `builder.ts`, rich-text/editor/section/matrix controls | Builder step review/publication and navigation/unsaved guards; rich-text/media controls; preserve actual embedded builder markup states | Loading/retry; new draft; published revision/copy; readiness errors; blank sections/questions; quarantine/media errors; version/idempotency recovery; editor undo |
| [ ] | `/assessments/definitions/[id]/assign` | Current authorized coordinator; assignment additionally requires relevant allocation/sensitive authority; API enforces eligibility | L; `AssignmentForm` | Existing member/team assignment review/action forms | No client; eligible recipients loading/retry; no eligible records; no team rules; assignment conflicts; partial eligibility feedback; revoke/deactivate rule results |
| [ ] | `/assessments/assignments/[id]` | Assignment owner, authorized primary reviewer or assigned independent appeal reviewer; sensitive access checked server-side | L; `AssessmentResponse`, `ResponseQuestions`, `ResponseEvidence`, `AssessmentReview` | Unsaved/unconfirmed leave prompt; submit confirmation; review/reopen/appeal/disposition confirmations | Loading/retry; no response/context; step validation; pending/ambiguous autosave; stale version; file scan/quarantine; immutable attempts; provisional/manual review; N+2 and reviewer-independence restrictions |

## 5. Guest, installation, legacy and shared recovery

| Done | Route | Roles / access boundary | Current shell and page components | Page dialogs / confirmations | Loading, empty and error states to preserve |
| --- | --- | --- | --- | --- | --- |
| [ ] | `/` | All visitors; destination enforces session/client/role | R; `page.tsx` redirects to `/dashboard` | None | Verify redirect and subsequent signed-out/global-admin/client behavior; do not replace with a new landing page |
| [ ] | `/login` | Guest; installed account; local-password/mock/unavailable modes | G; `login/page.tsx`, `Password` | Inline MFA/recovery stage | Context/options loading/retry; no mock identity; unavailable identity; password/MFA validation; changed-password notice; installation and role redirects |
| [ ] | `/account/link` | Holder of valid one-time setup/invitation/recovery token; issuer/recipient checks server-side | G; `account/link/page.tsx`, `Password` | Inline redemption/password confirmation, completed receipt | Missing/invalid/expired/cancelled/used link; pending inspection; setup versus reset versus invitation; credential changes reset stale view; validation, retry and success |
| [ ] | `/setup` | Uninstalled/legacy installation flow; redirects to local/hosted mode when provided | G; `setup/page.tsx`, `Password` | Existing four-stage administrator review/install | Context error/retry; installed redirect; input validation; installation busy/failure/success; no existing data overwrite |
| [ ] | `/setup/local` | Local installer authority and installation state; no normal user-role expansion | G; `InstallationWizard mode=local` | Requirements/database/admin/review/progress; native form controls | Loading/retry; PGlite/PostgreSQL selection; configuration validation; fixture progress; pause/resume; failed/restarted/already-installed states |
| [ ] | `/setup/hosted` | Authorized hosted installer with token; setup closes after installation | G; `InstallationWizard mode=hosted` | Token unlock, requirements/database/admin/review/progress | Token/requirements/database errors; validation; production profile with no fictional accounts; progress/restart recovery; completed installation |
| [ ] | Shared route error | Any route encountering a render error; no new permission assumptions | S; `error.tsx` | None | Saved-record reassurance and reset retry; usable guest/shared typography and keyboard focus |
| [ ] | Unknown path / not found | Any visitor | S; `not-found.tsx` | None | Unavailable page and return-to-application link; preserve framework 404 behavior |

### Non-page URLs and fragments

- `/platform/appearance` is an actual retained page (listed above), not deleted merely because Settings exists. `/platform/admins` retains its current grant workflow.
- `/dashboard#learning-plans` and `/platform/clients#client-account-access` are linked fragments; retain matching sections/expanded behavior.
- `/assessments/definitions/new` resolves the dynamic definition route. URL/filter state on directories and Settings paths must survive reload and Back/Forward.
- `/account/link` token fragments must stay private. Do not put them in new navigation, evidence files or server query strings.
- `/assessments/media/:id` and `/api/:path*` are Next rewrites to protected API resources, not pages to wrap with application HTML. Keep their existing authorization/content handling.
- No nested `layout.tsx`, `loading.tsx` or route-local `error.tsx` exists beneath the root at this inventory point. Most loading/retry states are inside page components; migrating the shell alone does not cover them.

## Shared component and retirement checklist

| Done | Foundation item | Consumers / constraints |
| --- | --- | --- |
| [ ] | Semantic tokens | Extract from Overview/Clients/People/Audit/Settings; preserve light, dark, neon, generated platform/client palettes, branding modes and personal precedence. Keep accessible contrast adjustments recorded in previous QA. |
| [ ] | Buttons, fields, panels, page headers, badges | Replace page contents and child forms, not just navigation. Preserve semantic labels, native validation, busy state, reasons and exact versions. |
| [ ] | Tables/mobile lists, tabs, pagination | Reuse established reference patterns while retaining each page's information order and actions. Check long IDs, large counts, keyboard focus, empty rows and paging history. |
| [ ] | Dialogs and feedback | Native focus trapping/return and Escape, form dialogs, explicit confirmations, alert/status semantics, retained drafts and retry. Do not conflate framework route announcer alerts with page errors in tests. |
| [ ] | One authenticated application shell | Generalize reference shell; role/workspace navigation, active routes, selected-client switch, account controls, guest-loading state and denied routes. Preserve co-brand/Cerebru links and context-sensitive theme persistence. |
| [ ] | Guest/shared recovery layout | Same visual system, appropriate guest content; no authenticated-navigation leak. Include login, links, installers, error and not found. |
| [ ] | Retire old authenticated shell | Only after all F/L rows pass; remove dead hooks/markup and old shell selectors after consumer search. |
| [ ] | Retire obsolete presentation | Audit `globals.css`, `workspace.css`, `directory.css`, component CSS and public assets; retain `assessments.css`, builder/editor styles and shared utilities until their actual consumers are replaced. |

## Evidence required per row

Record implementation paths/commit, applicable roles and denial cases, desktop/mobile screenshots, keyboard/dialog focus checks, axe/contrast results, light/dark/client-brand/personal-theme behavior, navigation and unsaved work, validation/stale/empty/error/retry checks, isolated test commands/results, and any pre-existing issue. Cross out no route until its contents, child dialogs and states have evidence. Human acceptance and production readiness are separate from automated verification.

The integration prep is verified separately in `GLOBAL_UI_INTEGRATION.md`. No row has been marked complete by that prep, and no global visual migration is claimed yet.

## Shared foundation checkpoint — 18 November 2026

The first extraction is implemented and locally verified: semantic tokens and reusable controls, native dialog, directory/stacked rows and pagination now have reference consumers. See `GLOBAL_UI_FOUNDATION_QA.md` for exact files, seven passing browser suites, build/typecheck evidence, screenshots, corrections and preservation checks. UX Engine is available and used; its earlier missing-package finding is resolved.

| Reference routes | Foundation adoption / regression evidence | Remaining migration work |
| --- | --- | --- |
| `/platform` | Shared token scope, PageHeader, Panel, Button, Feedback and Dialog; Overview browser checks and desktop/mobile inspection | Generalized shell, final consumer cleanup and route qualification |
| `/platform/clients` | Shared token scope, DirectoryTable with all stacked cells, Badge and Pagination; Clients and history checks, desktop/mobile inspection | Generalized shell, remaining account-access/dialog presentation and route qualification |
| `/platform/people` | Extracted token scope and shared Personal settings dialog; People safeguard/browser regression and desktop inspection | Shared page-control adoption, generalized shell and final route qualification |
| `/platform/audit` | Extracted token scope and shared Details dialog; Audit browser checks and desktop/dialog-mobile inspection | Remaining shared page-control adoption, generalized shell and final route qualification |
| `/platform/settings`, `/platform/settings/status`, `/platform/appearance` | Shared headers, route tabs, ordinary fields, actions, feedback and token scope; Settings browser checks including alias, desktop/mobile inspection | Generalized shell, remaining specialized controls and final route qualification |

At the foundation checkpoint, all route boxes remained open and the workflow source was pending. That historical state is superseded by the account/integration checkpoint below; its evidence is preserved.

## Shared shell/account checkpoint — 18 November 2026

Bernie's `codex/assessment-workflow-fixes` at `e44b295` is now fully merged locally in `dffeacd`; see `GLOBAL_UI_INTEGRATION.md`. The source question is resolved. No assessment presentation migration is claimed.

Three route rows above now record their bounded presentation migration and automated evidence in `GLOBAL_UI_ACCOUNT_QA.md`. The seven reference routes use `ApplicationShell` and retain their reference browser regressions, but their remaining specialized-control cleanup/final route qualification is still open. The shared shell checkbox remains open until all authenticated routes have moved.

Next: `/clients`, then client administration and the remaining recorded feature order. The legacy authenticated shell, guest/recovery layouts and assessment/editor styling remain necessary consumers. No global completion, human acceptance, push or deployment is claimed.

## Client selection checkpoint — 18 November 2026

`/clients` is now migrated using the existing shared components and selection workflow. Four additional route rows are checked in total; the seven reference rows still retain their recorded remaining cleanup work. `GLOBAL_UI_CLIENT_CHOICE_QA.md` records isolated browser/domain evidence, screenshots, role restrictions, empty/loading/error recovery, token rotation and responsive behavior. Next: client administration. Legacy/guest/assessment consumers and global retirement remain open. Nothing pushed or deployed.

## Client People and administration checkpoint — 18 November 2026

`/people` and `/administration`, including allocations, training-record review, promotions and mock-only local-person forms, are now migrated. Six additional route rows are checked in total; seven reference routes retain their recorded final cleanup work. The original People inventory incorrectly implied general member access and search; the implementation has always required administration authority and offered pagination without search. Its row now reflects the existing API/UI. Promotion review descriptions were likewise corrected to the actual preparation/dispatch/reconciliation actions.

`GLOBAL_UI_CLIENT_ADMIN_QA.md` records bounded verification and screenshots. Next: client AI settings and client Appearance, then learning. Global shell coverage, guest/recovery layouts, assessment/editor migration and obsolete-code retirement remain incomplete. No push/deployment or human acceptance is claimed.

## Client settings checkpoint — 18 November 2026

Client AI settings and Appearance are migrated, bringing the additional checked route rows to eight. The seven reference routes retain their remaining global qualification work. Evidence is in `GLOBAL_UI_CLIENT_SETTINGS_QA.md`; client settings keep the current configuration, billing, branding and personal-preference behavior. Removed 18 unused legacy gallery/preview CSS rules after searching application, package, script and test consumers, retaining shared palette variables and unrelated styling.

Next: learning workspace Overview (`/dashboard`), then the recorded learning/training-record sequence, assessments and guest/setup flows. Christian has supplied guest/setup design updates for that later phase; no design approval is inferred. The global migration and old-shell retirement remain incomplete. Nothing pushed/deployed.

## Learning Overview checkpoint — 18 November 2026

`/dashboard` is migrated with the existing scoped data, plan links/pagination and receipt polling. Nine additional rows are now checked; reference-route final qualification and global retirement remain open. `GLOBAL_UI_LEARNING_OVERVIEW_QA.md` records role, recovery, theme, keyboard, browser and domain evidence. Dashboard-only selectors are retired; setup journey and training-record receipt consumers remain. Next: `/enrolments`, then the recorded training-record feature sequence. No push/deployment or human acceptance is claimed.

## Training-record directory progress — 18 November 2026

`/enrolments` is migrated with shared search, list, feedback and pagination controls. Ten additional rows are now checked; seven reference routes retain final qualification work. Corrected the inventory: search is present, but a status filter never existed. Repeated searches now reload reliably, signed-out visits reach login, and Learning plans marks the record URL family active without changing its destination. `GLOBAL_UI_TRAINING_DIRECTORY_QA.md` records automated evidence and limits. Next: `/enrolments/[id]`. Nested routes, the remaining legacy consumers and global retirement remain open. Nothing pushed/deployed; human acceptance remains deferred.

## Training-record detail progress — 18 November 2026

`/enrolments/[id]` is migrated, bringing additional checked rows to eleven. Foundation, evidence upload/list/scan feedback and receipts use shared controls; summary-only and denied access remain server-scoped. The inventory now accurately records direct check/upload actions and no delete control. Both BackgroundReceipts consumers use the shared system; its legacy branch and two unused detail-grid selectors are retired. `GLOBAL_UI_TRAINING_RECORD_QA.md` records bounded evidence and limits. Next: onboarding `/enrolments/[id]/onboarding`. Remaining routes, final reference qualification and complete legacy retirement are open. Nothing pushed/deployed; human acceptance remains deferred.

## Onboarding progress — 18 November 2026

Onboarding and its assessment-upload/curriculum-creation controls are migrated, bringing additional checked rows to twelve. All seven steps retain their structure and existing permissions, autosave/version checks, confirmations and budget behavior. The page now registers dirty/pending work with the shared shell guard, and signed-out visits reach login. Evidence is in `GLOBAL_UI_ONBOARDING_QA.md`. Generic step/review/editor CSS remains for other consumers. Next: curriculum editor `/enrolments/[id]/plan`. Remaining routes, reference qualification and global legacy retirement remain open. Nothing pushed/deployed; human acceptance remains deferred.

## Curriculum progress ? 18 November 2026

Curriculum editing, version history/comparisons, baseline review/receipt and the generation request panel now share the application shell and visual system. Thirteen additional route rows are checked; seven reference routes retain final qualification work. Existing fields, permissions, approval and budget rules remain. Dirty/pending work is registered with the shared shell guard; signed-out visits reach login. Sixteen obsolete selector occurrences were removed after consumer checks. Evidence: `GLOBAL_UI_CURRICULUM_QA.md`. Next: generation progress `/enrolments/[id]/generation/[runId]`. Remaining routes and full legacy retirement are open. Nothing pushed/deployed; human acceptance remains deferred.

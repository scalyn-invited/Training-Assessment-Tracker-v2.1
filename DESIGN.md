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

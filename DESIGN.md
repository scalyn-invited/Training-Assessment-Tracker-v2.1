# Design system — Training Assessment Tracker V2.1

## World
Employee learning, assessment evidence and accountable human review. Preserve V2's calm workspace and existing layouts.

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

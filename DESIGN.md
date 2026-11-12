# Design system — Training Assessment Tracker V2.1

## World
Employee learning, assessment evidence and accountable human review. Preserve V2's calm workspace and existing layouts.

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

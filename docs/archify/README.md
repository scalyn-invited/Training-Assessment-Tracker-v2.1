# Training Assessment Tracker V2.1 — user workflow package

**Start here:** open [overview.html](overview.html) in Chrome or Edge. No application server is needed.

## Files to review

| File | Purpose |
|---|---|
| [overview.html](overview.html) | Core journey: enrolment → onboarding → plan approval → activation → learning → completion |
| [assessment.html](assessment.html) | Assessment publication, assignment, response, human decision, rejection and appeal |
| [training.html](training.html) | Active lesson work, submissions, human grading, revision loop and completion gates |
| [lifecycle.html](lifecycle.html) | Optional pause, calendar/capacity preview, explicit resumption and stale-preview recovery |
| [HANDOFF.md](HANDOFF.md) | Designer brief, roles, screen inventory, state distinctions, accessibility criteria and review questions |
| [EVIDENCE.md](EVIDENCE.md) | Real validation/browser results, hashes, visual-inspection scope and limitations |

Send the whole folder to the reviewing designer so the handoff, source JSON, evidence and screenshots stay together. Each diagram HTML is standalone. `*.candidate.json` files are the editable diagram specifications; generated HTML should not be hand-edited. `visual/` contains screenshot contact sheets. `*.finalize-summary.json` files are compact machine receipts.

## Review status

Ready for designer review — not approved screen design, owner acceptance or usability validation. All four diagrams passed Archify showcase validation and real-browser checks. See EVIDENCE.md for exact scope; application tests were not rerun.

Based on committed source `40df79d3e3d71c6d357feb176053b7d225770000`. Existing uncommitted audit/integration work is excluded, not overwritten. The backend profile provided a read-only business-rule consultation.

## Critical constraints

- Administration does not imply sensitive training access.
- Assessment results do not automatically populate onboarding findings.
- Saved input is not confirmed input; submitted work is not approved work.
- Approved curriculum is ready; activation is a separate explicit action.
- AI output is optional/provisional, never a substitute for required human approval.
- Initial-assessment and learning appeals have different eligibility rules.
- Pause does not silently shift dates. Completion is not driven by elapsed time alone.
- Preserve project DESIGN.md and V2 workflow conventions; the diagram colours are not an application redesign.

Detailed supporting workflows such as account recovery, provider budgeting/reconciliation and operations are outside this core-journey diagram package. Omission does not mean they are unimplemented.

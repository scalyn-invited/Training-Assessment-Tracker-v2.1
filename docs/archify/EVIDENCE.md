# Artifact verification evidence

Status: documentation produced and automated gates passed; human design acceptance pending.

Source revision: `40df79d3e3d71c6d357feb176053b7d225770000`.

## Automated acceptance

All four workflow artifacts passed 9/9 showcase checks with zero errors and zero warnings, verified delivery, strict provenance check and real-Chrome browser-check. Final candidate and HTML SHA-256 values were independently recomputed and matched the receipts.

Browser gate scope: light theme at 1440×900, 1600×1000, 1920×1080 and 2048×1320; dark-theme checks at endpoints; READ/Still state and containment/readability/viewer checks. This is not application accessibility or usability qualification.

### overview

- Diagram type: workflow
- HTML: [overview.html](overview.html)
- Specification: [overview.candidate.json](overview.candidate.json)
- Specification SHA-256: `2ba4f43445d2f63bae0e045e77da8e722ba3e2376dc3ce1e691c22c64f20ddf8`
- Artifact SHA-256: `0d144726921e1980968c85231d8949743275eb6163373598ebcb4e6c1fbee204`
- Validation: 9/9 showcase; 0 errors; 0 warnings
- Browser evidence: passed
- Receipt: [overview.finalize-summary.json](overview.finalize-summary.json); full stages in [overview.finalize.json](overview.finalize.json)
- Capture set: [visual/overview/overview.visual-check.html](visual/overview/overview.visual-check.html)

### assessment

- Diagram type: workflow
- HTML: [assessment.html](assessment.html)
- Specification: [assessment.candidate.json](assessment.candidate.json)
- Specification SHA-256: `a4317bd3640fbcc9b5ba65c2689d762a30dcbe86700338bfb81a52e31d5a9004`
- Artifact SHA-256: `e9082313b504a691fe9acb38c4ddf8965454c7e29cfbb348783985239b3aa677`
- Validation: 9/9 showcase; 0 errors; 0 warnings
- Browser evidence: passed
- Receipt: [assessment.finalize-summary.json](assessment.finalize-summary.json); full stages in [assessment.finalize.json](assessment.finalize.json)
- Capture set: [visual/assessment/assessment.visual-check.html](visual/assessment/assessment.visual-check.html)

### training

- Diagram type: workflow
- HTML: [training.html](training.html)
- Specification: [training.candidate.json](training.candidate.json)
- Specification SHA-256: `beee895450d4da8bf522d0a389bed71ab21c8b052a2d3b148af9c94eeea70e0d`
- Artifact SHA-256: `8d8b4edfb9809d6bc7d18f1abee79eb3e8ab6f1b6248e3e47883564836eac4d9`
- Validation: 9/9 showcase; 0 errors; 0 warnings
- Browser evidence: passed
- Receipt: [training.finalize-summary.json](training.finalize-summary.json); full stages in [training.finalize.json](training.finalize.json)
- Capture set: [visual/training/training.visual-check.html](visual/training/training.visual-check.html)

### lifecycle

- Diagram type: workflow
- HTML: [lifecycle.html](lifecycle.html)
- Specification: [lifecycle.candidate.json](lifecycle.candidate.json)
- Specification SHA-256: `1cfb947a5acce99b73e061e3948a0ca06a505e1fd3fe523fb0456d85dccec6db`
- Artifact SHA-256: `8f4beaa6caacc0c3dc50536af7dfc47e5d326217fa6ab996104468349522499d`
- Validation: 9/9 showcase; 0 errors; 0 warnings
- Browser evidence: passed
- Receipt: [lifecycle.finalize-summary.json](lifecycle.finalize-summary.json); full stages in [lifecycle.finalize.json](lifecycle.finalize.json)
- Capture set: [visual/lifecycle/lifecycle.visual-check.html](visual/lifecycle/lifecycle.visual-check.html)

## Capture and visual inspection, separate from automated gates

Artifact-bound visual-check completed successfully for each final HTML. Each set contains light/dark PNGs at 1440×900 and 2048×1320, plus a contact sheet and receipt.

The designer agent inspected all four light 1440×900 captures and all four dark 2048×1320 captures. Observed: the stage/role labels, node text, decision branches and return arrows are visible with no obvious node/text overlap or clipping in those inspected views. Assessment rejection/appeal branches and the training revision loop are distinguishable. Long outer routes remain in the overview onboarding handoff, assessment optional appeal and lifecycle review path; these are readable but less compact than ideal and are retained as review notes, not claimed aesthetic perfection. Some cards are below the first viewport and require normal page scrolling. Dark secondary labels are visually subdued; use the light view and zoom for close review.

Visual review status: inspected with the above observations, not human acceptance. No automated receipt was altered to imply perceptual approval. Export controls, keyboard interactions, phone/tablet viewer behaviour and every screenshot variant were not individually exercised. WCAG conformance is not established.

## Authoring repairs

- Overview: removed an optional monotonic-path lint declaration incompatible with its deliberate leftward final row, without changing nodes/arrows; widened the canvas from measured viewport evidence.
- Assessment: separated a colliding appeal route from the submission route.
- Training: a combined pause/resume diagram produced persistent route conflicts. The complete pause/resume branch was separated into lifecycle.html with explicit entry/return references; core training loops remain in training.html. Shorter responsibility headers removed layout expansion and restored desktop text readability.
- Pause/resume: removed a restrictive endpoint pin so the compiler could route the stale-preview return.

Final receipts describe the successful candidates, not the earlier failing drafts. Automated acceptance was rerun after final edits. No failed candidate is represented as accepted.

## Reproduction

Run from the repository root, using the installed Archify package path:

`node <archify>/bin/archify.mjs finalize workflow docs/archify/<name>.candidate.json docs/archify/<name>.html --repo-root . --quality showcase --json`

For a changed candidate, add a fresh `--out-dir docs/archify/review-<revision>/<name>` so previous browser evidence remains associated with its original bytes. Do not hand-edit generated HTML; edit the candidate and regenerate.

## Execution boundaries

Only docs/archify deliverables were authored. No application code, V2 files, databases, credentials or profile configuration were edited. No commit, push, deployment, mail or paid AI call was made. Backend was consulted read-only. Application tests/builds were not rerun because this deliverable is documentation; passing diagram gates do not establish fresh application regression status.

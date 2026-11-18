# User workflow handoff — Training Assessment Tracker V2.1

Status: **Ready for designer review; not approved UI/UX design.**

## Intent and scope

- Users: enrolled Members, authorised Coordinators, Client Admins and case-scoped alternate reviewers. Global Admin administration is a supporting capability, not blanket training access.
- Primary goal: help a member move from a correctly configured enrolment through confirmed onboarding, approved planning, active learning and evidenced completion.
- Secondary goals: publish/assign assessments, review submissions, handle appeals and explicitly manage pauses/resumption.
- Context: responsive web workspace. Device frequency and user expertise are not research-validated; desktop-first review of this documentation is an authoring assumption, not a product requirement.
- Worst cases: exposing private evidence to the wrong role/client, losing unsaved responses, mistaking provisional output for approval, or changing dates/approved history without explicit authority.
- Design implications: show identity/client context, current state and next responsible role; separate save, submit, confirm, approve and activate; retain recoverable input and immutable history.

This package describes the **implemented core training journey at commit `40df79d3e3d71c6d357feb176053b7d225770000`**. It is not a redesign or a complete specification of every administration, integration, provider or operations screen. Assessment assignment, appeals, optional AI assistance, pause/resume and adaptation are conditional branches. Confirmation, approval, activation and completion gates remain mandatory inside the workflows that require them.

## Reading order

1. [Overview](overview.html): roles, onboarding, planning, activation and completion.
2. [Assessment](assessment.html): publish, assign, respond, decide, return and appeal.
3. [Active training](training.html): lesson submission, human review, revision and completion.
4. [Pause/resume](lifecycle.html): optional lifecycle branch, separated to avoid a tangled overview. Its Active again endpoint returns to Work on lesson in training.html.

All four are Archify **workflow** diagrams; lifecycle.html uses responsibility lanes rather than the lifecycle schema. Arrows express workflow transitions/handoffs, not API calls. Cyan nodes represent user-facing actions/outcomes; rose nodes represent permission/validation/decision gates, not necessarily errors. These diagram colours are not replacement application tokens. Source badges expose repository-relative evidence. Source links are local-only: repository access is not required to open an HTML file.

## Role and permission inventory

| Role | Responsibility in this journey | Boundary the UI must preserve |
|---|---|---|
| Member | Own onboarding inputs where allowed; own assessment and lesson drafts/submissions; eligible appeals | Does not approve own curriculum, review own submissions or see private provisional analysis/answer keys |
| Coordinator | Author assessments; manage eligible assigned members; confirm findings/calendar; prepare/review/approve plans; activate and review training | Scope, historical team membership, current primary allocation and separate sensitive authority matter; role name alone is insufficient |
| Client Admin | Manage membership, allocation and enrolment; route eligible appeals | Administration/routing does not automatically expose training or assessment content |
| Alternate reviewer | Review the specifically routed open appeal | Exact active case and role binding; not permanent/general access; closes on resolution |
| Global Admin | Platform-level administration | Not an implicit super-reviewer of member training |

Evidence: `packages/domain/src/enrolments.ts:37-92`, `packages/domain/src/assessment-access.ts:27-67`; backend consultation also identified `packages/domain/src/access.ts:72-99,135-251`. Treat the latter as backend-reviewed references, not a separately executed permission test in this task.

## Workflow / screen inventory

Routes are existing entry-point references from `docs/implementation/PARITY_AUDIT.md:9-85`; they are not newly proposed navigation.

| Stage | Role and entry | Existing surface | Action / resulting state | Failure or alternate path |
|---|---|---|---|---|
| Enter workspace | Authenticated identity, available selected client | `/login`, `/clients`, `/dashboard` | Establish correct client context | Sign-in/client/permission recovery; no cross-client fallback |
| Create enrolment | Client Admin; current member and different eligible coordinator | `/administration` | Create `onboarding` record | Resolve primary/backup allocation conflict explicitly; creation does not grant sensitive access |
| Assessment authoring | Authorised coordinator | `/assessments`, `/assessments/definitions/[id]` | Save draft; separately publish ready revision | Incomplete content, stale version or unready media blocks publication |
| Assessment assignment | Published revision, eligible enrolment and authority | `/assessments/definitions/[id]/assign` | Individual assignment or creator-bound team rule | Team eligibility is rechecked; stop/resume is not assignment deletion |
| Assessment response | Assigned Member | `/assessments/assignments/[id]` | Save sections, submit exact saved draft, receive immutable receipt | Required answers, scan status, stale version, uncertain save/submission or open appeal |
| Assessment review | Current reviewer; latest attempt | Assignment review surface | Explicit approve/reject; optional separate return feedback | Queued analysis blocks decision; incomplete/invalid evidence requires correction |
| Assessment appeal | Member; recorded approved/rejected decision | Assignment + administration routing | Request → Client Admin routes → alternate upholds or decides | One open case; no editing/resubmission while open; loss of case authority blocks review |
| Onboarding | Member and Coordinator have different edit powers | `/enrolments/[id]/onboarding` | Partial saves across six steps; explicit findings and calendar confirmation | Save conflicts preserve input; unconfirmed/incomplete inputs block planning |
| Plan preparation | Authorised coordinator; complete confirmed inputs | `/enrolments/[id]/plan` | Create/refresh draft; edit blocks; request exact-version review | Calendar mismatch, outdated input, invalid content or capacity conflicts |
| Plan approval | Valid `needs_review` revision | Plan review surface | Human approval records receipt/capacity and sets enrolment `ready` | Never activate implicitly; preserve previous approved history |
| Activation | Coordinator; exact `ready` enrolment, fresh approved plan | `/enrolments/[id]/delivery` | Explicit activation creates delivery blocks and sets `active` | Revalidate permissions, approved plan and freshness |
| Lesson work | Member; active current block and available lesson | Delivery surface | Save draft; submit immutable attempt | Future preview-only lesson, stale draft, unclean evidence, pending/approved prior attempt |
| Lesson review | Authorised coordinator or exact alternate | `/learning-reviews`, `/enrolments/[id]/submissions/[submissionId]` | Approve or request changes; approved evidence updates KPIs | Manual review is supported; queued work blocks conflicting manual decision; insufficient evidence cannot be official numeric grade |
| Progress / support | Eligible Member/Coordinator views | `/enrolments/[id]/progress` | Review evidence, metrics and authorised support actions | N+2 adaptation is a separate approved future change, never automatic next-block rewriting |
| Pause/resume | Authorised Coordinator, active/paused exact record | Delivery/lifecycle controls | Pause → preview dates/capacity → approve fresh preview → active | Stale preview: remain paused and re-preview; no silent rescheduling |
| Complete | Coordinator; active exact record | Delivery/lifecycle controls | Explicit completed status and receipt/history | Every lesson needs approved evidence; at least three current KPI targets, all on target |

## Six onboarding steps and ownership

Preserve the existing sequence and labels:

1. Profile and role.
2. Desired capability.
3. Assessment findings.
4. Capacity and calendar.
5. Measures of success.
6. Learning resources.

Members may save profile, assessment and schedule inputs where authorised. Other steps and findings confirmation require coordinator management. Partial saves are allowed, but do not mean the inputs are complete. Ordinary assessment edits replace the confirmed step data; the UI must not retain a misleading confirmed badge.

Evidence: `packages/contracts/src/onboarding.ts:1-42`; `packages/domain/src/onboarding.ts:121-169`.

**No automatic assessment-to-onboarding import:** assessment approval updates assessment decisions/assignment/appeal/audit/notice records, not onboarding findings. Record a source/reference and findings, then have the coordinator confirm them. Findings can be provider score, self report or observed evidence; plan creation does not require an approved assignment ID. Do not draw assessment completion as a universal prerequisite for onboarding.

Evidence: `packages/domain/src/assessment-reviews.ts:271-311`; `packages/domain/src/onboarding-content.ts:27-40`; `packages/domain/src/learning-plans.ts:136-172`.

Calendar confirmation is a separate, version-bound action. Proposed availability/capacity must match the confirmed shared calendar before plan creation. Current UI explicitly explains that saving inputs does not approve a plan: `apps/web/app/components/onboarding.tsx:613-703`.

## State distinctions that must survive design

| Do not equate | Required distinction and source |
|---|---|
| Upload complete = scan clean | Attachable lesson evidence must be clean and currently readable: `delivery.ts:302-317` |
| Extracted text = confirmed findings | Extraction/review/confirmation are separate stages. Detailed document-screen specifications remain a follow-up; do not introduce automatic confirmation |
| Save = submit | Submission binds the exact saved version and returns an immutable attempt: `assessment-responses.ts:380-505`; `delivery.ts:467-579` |
| Submitted = approved | Reviewer decision is separate and version-bound: `assessment-reviews.ts:198-311`; `learning-grading.ts:319-413` |
| Internal rejection reason = learner feedback | Initial-assessment return feedback is separately stored and optional: `assessment-reviews.ts:198-220,271-285` |
| Analysis = decision | Provisional analysis cannot replace the human gate. Initial assessment decisions reject pending analysis: `assessment-reviews.ts:231-260` |
| Curriculum approved = training active | Approval sets ready: `learning-plans.ts:299-400`. Separate activation sets active: `delivery.ts:150-249` |
| Latest changes requested = previous approval removed | Delivery can retain an existing approved grade: `learning-grading.ts:377-389` |
| Assessment appeal = learning appeal | Initial assessment: approved/rejected decision. Learning: approved decision, with duplicate-decision/open-case checks: `assessment-reviews.ts:314-365`; `learning-grading.ts:493-556` |
| Pause = dates shifted | Pause only changes lifecycle state. Preview/resumption explicitly handle eligible schedule replacements: `learning-lifecycle.ts:50-184` |
| End date reached = completed | Completion requires explicit action, approved lesson evidence and sufficient on-target metrics: `learning-lifecycle.ts:288-355` |

Paths abbreviated in this table are under `packages/domain/src/`.

## Conditional branches not expanded into individual screen diagrams

- Learning appeal: Member appeals approved decision → Client Admin routes → alternate reviews → uphold or new decision → case authority closes. Do not offer initial-assessment rejected-decision eligibility here. Source: `packages/domain/src/learning-grading.ts:493-671` (routing/closure additionally reviewed by backend).
- AI assistance: optional preparation/analysis, never automatic human approval. Existing live-service qualification is outside this package; no provider call or spend was performed.
- N+2 support: evidence from block N can inform an eligible block numbered **at least N+2**, not necessarily exactly N+2. Approval rechecks source evidence, current calendar/policy, provisional result and target eligibility. A started/frozen block, or one with drafts/submissions, is not eligible. Do not depict an automatic N+1 rewrite. Source: `packages/domain/src/learning-support.ts:382-413`; eligibility and final-support fallback additionally reviewed by backend at `68-87,161-206`.
- Document evidence: quarantine/scanning → clean source → extraction/review → explicit confirmation. Detailed parser/scan retry screens are not comprehensively specified here.
- Account setup/recovery, team-rule scheduler management, promotion, notifications, branding, provider budgeting/reconciliation and operations are supporting workflows outside the diagram scope. Their omission is not evidence that they are unimplemented.

## UI state checklist for the reviewing designer

The following are **handoff acceptance criteria**, not claims of newly tested product behaviour:

- Loading: operation-specific status and stable context; do not flash empty state before loading finishes.
- Empty: distinguish no enrolment/assignment yet, no search matches and no accessible records. Offer only authorised next actions.
- Saving: distinguish unsaved, saving, saved and unconfirmed outcome. Do not disable typing unnecessarily or overwrite newer input after a response.
- Validation: inline field/section guidance, error summary where appropriate, focus to the first invalid field; retain all input.
- Conflict: preserve unsaved values; explain that another version exists; require explicit reload/reconciliation rather than silent overwrite.
- Upload/scan/extraction: identify each separate state, what is unavailable and the safe retry/replacement action. Never present a quarantined item as usable evidence.
- Submission: show exact assessment/member/client context, confirmation and receipt. Recovery must not create duplicate attempts.
- Approval/activation: separate buttons, separate explanations and explicit confirmations. Avoid generic “Done” for materially different actions.
- Permission revoked/session expired: cease privileged actions, avoid leaking private details, show a safe reauthentication/navigation path.
- Appeal: show open/routed/resolved status, next responsible role, edit restrictions and end of temporary authority.
- Success/history: retain exact revision/attempt identity and clarify approved versus provisional results.
- Disabled/read-only: explain why an action is unavailable and what can unlock it, without exposing unauthorised details.
- Calendar/capacity: display timezone, affected dates and shared-capacity implications before confirming.

## Visual, responsive and accessibility constraints

Follow `DESIGN.md`, not the Archify viewer aesthetic. Preserve existing V2 workflows, typography, palette, panels, buttons and navigation patterns. Target WCAG 2.2 AA; no accessibility conformance claim is made for this documentation or the application by this task.

For the screen-design handoff, specify keyboard order/focus restoration, announced pending/success/error feedback, labelled controls, non-colour status cues and confirmation cancellation behaviour. At narrow widths retain a single-column reading order, readable 16px inputs, reachable actions and no page-level horizontal overflow. Wide matrices may use a labelled local scroll region. Reuse existing components before adding new variants.

## Evidence, collaboration and limitations

The backend profile completed a read-only consultation, session `local-48e260cf07417c307d025e81fce0e340a31281ab087ab054aa137b3c70ae4ab6`. Its findings clarified permission scope, manual versus automatic steps, the two appeal models, retained approved grades and N+2 boundaries. Primary diagram claims were also traced in domain code by the designer. This consultation is not owner acceptance or a separate QA certification.

At task start, the worktree already contained modified `docs/implementation/FEATURE_CHECKLIST.md` and `scripts/dev.ts`, plus untracked PDF/audit/main-integration work. Those were not changed by this task and are not silently incorporated into the pinned source snapshot. A focused `git diff HEAD` confirmed no changes in the cited domain/contracts code, onboarding UI, DESIGN.md or parity audit during authoring. Archify separately verified the cited paths/line ranges against the pinned commit.

See [EVIDENCE.md](EVIDENCE.md) for actual artifact identities, automated gate results and screenshot-review limits. Application builds, domain regressions, live mail, paid AI, production scans and deployment were not run: this task changes documentation only.

## Review questions and explicit handoff

These are not blockers to this source-backed diagram; resolve them before redesign implementation:

1. Is the requested UI work strict visual/workflow parity or a separately approved usability redesign? Current project rules require preservation by default.
2. Which role/surface should be designed first? Recommended: Member assessment response plus Coordinator review, as a bounded connected feature.
3. Is manual transfer of findings between assessment and onboarding adequate, or should an explicit import be proposed as a new feature? Do not invent one in the current-state diagram.
4. What terminology should user-facing copy prefer: Member/learner, Coordinator/reviewer, curriculum/programme? Preserve existing labels until agreed.
5. Confirm real user devices, expertise and assistive-technology needs through research; these were not established here.
6. Reconcile newer uncommitted audit/integration work before treating this snapshot as the latest target for implementation.

Deliverable acceptance: source-backed diagrams exist, their Archify gates pass, editable specifications and evidence are retained, critical permission/state distinctions are documented, and no application code is modified. Handoff owner: reviewing designer, then frontend/backend/QA for an approved bounded implementation. Human design acceptance and user testing remain **pending**. No Kanban record was created or transitioned as part of this documentation request.

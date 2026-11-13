'use client';
import { useRef, useState } from 'react';
import { api, Feedback } from './auth-ui';
import { ReasonAction, useLeaveGuard } from './learning-controls';
import type { LearningGrading } from '../../../../packages/domain/src/learning-grading';
export type LearningReceiptView = Awaited<ReturnType<LearningGrading['read']>>;
export function LearningReview({
  view: v,
  client,
  csrf,
  refresh,
  close,
}: {
  view: LearningReceiptView;
  client: string;
  csrf: string;
  refresh: () => Promise<unknown>;
  close: () => void;
}) {
  const [scores, setScores] = useState(
      v.submission.rubric.criteria.map((c) => ({
        id: c.id,
        score: '',
        feedback: '',
        insufficient: false,
      })),
    ),
    [outcome, setOutcome] = useState(''),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const pending = useRef(false),
    queued = v.grades.some((g) => g.status === 'queued');
  useLeaveGuard(dirty || busy);
  const path = `/enrolments/${v.enrolment.id}/submissions/${v.submission.id}`;
  async function action(kind: string, data: Record<string, unknown>) {
    await api(path + '/' + kind, {
      csrf,
      clientId: client,
      version: v.submission.version,
      ...data,
    });
    if (v.caseOnly && ['decide', 'manual', 'uphold'].includes(kind)) {
      close();
      return;
    }
    await refresh();
    setMessage(
      kind === 'grade'
        ? 'Provisional grading requested. Human approval is still required.'
        : 'Decision recorded. Previous attempts remain in history.',
    );
  }
  async function manual(e: React.FormEvent) {
    e.preventDefault();
    if (
      pending.current ||
      queued ||
      !window.confirm(
        outcome === 'approved'
          ? 'Approve this exact submitted version using your evidence-backed scores? It will update official progress.'
          : 'Request changes using this exact review? The submitted snapshot stays in history.',
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action('manual', {
        outcome,
        reason,
        result: {
          rubric_id: v.submission.rubric.id,
          rubric_version: v.submission.rubric.version,
          criteria: scores.map((c) => ({
            id: c.id,
            score: Number(c.score),
            evidence_ids: [v.submission.id + ':text', ...v.submission.files],
            feedback: c.feedback,
            insufficient_evidence: c.insufficient,
          })),
        },
      });
      setDirty(false);
      setReason('');
      setOutcome('');
      setScores(scores.map((c) => ({ ...c, score: '', feedback: '', insufficient: false })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {v.changes && (
        <section className="panel">
          <h2>Requested changes</h2>
          <p>{v.changes.reason}</p>
          <ul>
            {v.changes.result.criteria.map((c) => (
              <li key={c.id}>{c.feedback}</li>
            ))}
          </ul>
          <p>
            Return to the lesson, update saved work and submit a new attempt when it is available.
          </p>
        </section>
      )}
      {v.approved ? (
        <section className="panel">
          <h2>Approved feedback</h2>
          <p>Score: {v.approved.total} / 100</p>
          <p>{v.approved.reason}</p>
          <ul>
            {v.approved.result.criteria.map((c) => (
              <li key={c.id}>
                {c.feedback} / {c.score} out of 100
              </li>
            ))}
          </ul>
        </section>
      ) : (
        !v.canReview &&
        v.submission.status !== 'withdrawn' && (
          <p className="notice">Awaiting review. Provisional scores are not official results.</p>
        )
      )}
      <Feedback error={error} success={message} />
      {v.canReview && v.submission.status !== 'withdrawn' && (
        <>
          <section className="panel">
            <h2>Grading attempts</h2>
            <p>
              Provisional results require your independent review against the submitted work. AI
              never approves a grade.
            </p>
            {dirty && (
              <p className="notice">
                Your human assessment has unsaved inputs. Record it or discard those inputs before
                another grading action.
              </p>
            )}
            {v.grades.length ? (
              v.grades.map((g) => (
                <details key={g.id} open={g.status === 'provisional' || g.status === 'queued'}>
                  <summary>
                    Grade attempt {g.version} / {g.status.replaceAll('_', ' ')}
                  </summary>
                  {g.result && (
                    <>
                      <p>
                        Provisional total: {g.total === null ? 'Insufficient evidence' : g.total}
                      </p>
                      <ul>
                        {g.result.criteria.map((c) => (
                          <li key={c.id}>
                            {c.feedback} /{' '}
                            {c.insufficient_evidence ? 'Insufficient evidence' : c.score}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {g.status === 'queued' && (
                    <p role="status">
                      Waiting for provisional grading. This page refreshes while it is queued.
                    </p>
                  )}
                  {g.status === 'technical_failure' && (
                    <p>
                      Grading did not produce a usable result. A supported human assessment is
                      available below. Ambiguous provider charges remain reserved for administrator
                      reconciliation.
                    </p>
                  )}
                  {g.status === 'provisional' && (
                    <>
                      <ReasonAction
                        label="Approve grade"
                        help="Approve only if every criterion is supported by the submitted evidence."
                        confirm="Approve this exact provisional grading attempt as official feedback?"
                        disabled={dirty || busy}
                        run={(reason) =>
                          action('decide', { gradeId: g.id, outcome: 'approved', reason })
                        }
                      />
                      <details>
                        <summary>Request changes to this work</summary>
                        <ReasonAction
                          label="Request changes"
                          help="Explain the evidence or changes the member needs to provide."
                          confirm="Record requested changes for this exact attempt?"
                          disabled={dirty || busy}
                          run={(reason) =>
                            action('decide', {
                              gradeId: g.id,
                              outcome: 'changes_requested',
                              reason,
                            })
                          }
                        />
                      </details>
                    </>
                  )}
                </details>
              ))
            ) : (
              <p>
                No grading attempt yet. Assess the evidence directly or request provisional
                analysis.
              </p>
            )}
            {!v.grades.some((g) => ['queued', 'provisional'].includes(g.status)) && (
              <details>
                <summary>Request provisional grading</summary>
                <ReasonAction
                  label="Request provisional grading"
                  help={
                    v.submission.quiz
                      ? 'The pinned answer key will be compared deterministically. Missing answers remain insufficient evidence.'
                      : 'Only supplied text is sent to the configured provider. Attached files remain unread; no result is official until human approval.'
                  }
                  confirm="Request provisional grading under the configured provider limits?"
                  disabled={dirty || busy}
                  run={(reason) => action('grade', { reason })}
                />
              </details>
            )}
            <button className="secondary" disabled={dirty || busy} onClick={() => void refresh()}>
              Refresh grading status
            </button>
          </section>
          <section className="panel">
            <h2>Human assessment or override</h2>
            {queued && (
              <p className="notice">
                Wait for the queued grading attempt or its failure before recording a human
                decision.
              </p>
            )}
            <form onSubmit={manual}>
              <fieldset disabled={queued || busy} style={{ border: 0, padding: 0 }}>
                <legend>Assess the pinned criteria</legend>
                {scores.map((c, i) => (
                  <fieldset key={c.id}>
                    <legend>
                      {v.submission.rubric.criteria[i].label} /{' '}
                      {v.submission.rubric.criteria[i].weight * 100}%
                    </legend>
                    <label>
                      Score for criterion {i + 1}
                      <input
                        required
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={c.score}
                        onChange={(e) => {
                          setDirty(true);
                          setScores(
                            scores.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)),
                          );
                        }}
                      />
                    </label>
                    <label>
                      Evidence and feedback for criterion {i + 1}
                      <textarea
                        aria-label={'Evidence and feedback for criterion ' + (i + 1)}
                        required
                        maxLength={4000}
                        value={c.feedback}
                        onChange={(e) => {
                          setDirty(true);
                          setScores(
                            scores.map((x, j) =>
                              j === i ? { ...x, feedback: e.target.value } : x,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={c.insufficient}
                        onChange={(e) => {
                          setDirty(true);
                          setScores(
                            scores.map((x, j) =>
                              j === i ? { ...x, insufficient: e.target.checked } : x,
                            ),
                          );
                        }}
                      />
                      Insufficient evidence for criterion {i + 1}
                    </label>
                  </fieldset>
                ))}
                <p>
                  Review the submitted text and any attached files. Missing evidence cannot be
                  approved as an official zero.
                </p>
                <fieldset>
                  <legend>Decision</legend>
                  <label>
                    <input
                      type="radio"
                      name="human-outcome"
                      required
                      value="approved"
                      checked={outcome === 'approved'}
                      onChange={() => {
                        setDirty(true);
                        setOutcome('approved');
                      }}
                    />
                    Approve
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="human-outcome"
                      required
                      value="changes_requested"
                      checked={outcome === 'changes_requested'}
                      onChange={() => {
                        setDirty(true);
                        setOutcome('changes_requested');
                      }}
                    />
                    Request more evidence or changes
                  </label>
                </fieldset>
                <label>
                  Decision rationale
                  <input
                    required
                    minLength={8}
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => {
                      setDirty(true);
                      setReason(e.target.value);
                    }}
                  />
                </label>
                <button className="primary" disabled={queued || busy} aria-busy={busy}>
                  {busy ? 'Recording decision...' : 'Record human decision'}
                </button>
              </fieldset>
            </form>
            {dirty && (
              <details>
                <summary>Discard unrecorded assessment inputs</summary>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !window.confirm(
                        'Discard these unrecorded scores and rationale? Saved decisions are preserved.',
                      )
                    )
                      return;
                    setScores(
                      scores.map((c) => ({ ...c, score: '', feedback: '', insufficient: false })),
                    );
                    setOutcome('');
                    setReason('');
                    setDirty(false);
                  }}
                >
                  Discard unrecorded inputs
                </button>
              </details>
            )}
          </section>
        </>
      )}
      {v.canAppeal && (
        <section className="panel">
          <h2>Request another review</h2>
          <ReasonAction
            label="Request an appeal"
            help="An administrator must assign an independent reviewer. The approved decision remains in place while the appeal is open."
            confirm="Request an independent appeal for this approved decision?"
            run={(reason) => action('appeal', { reason })}
          />
        </section>
      )}
      {v.appeals.map((p) => (
        <section className="panel" key={p.id}>
          <h2>Appeal / {p.status}</h2>
          <p>{p.reason}</p>
          <p>
            {p.resolution ||
              (p.assigned
                ? 'Assigned to an alternate reviewer.'
                : 'An administrator must assign an alternate reviewer.')}
          </p>
          {p.canUphold && (
            <ReasonAction
              label="Uphold existing decision"
              help="Record an independent rationale. This resolves the appeal and closes case access."
              confirm="Uphold the existing approved decision and close this appeal?"
              disabled={dirty || busy}
              run={(reason) => action('uphold', { reason })}
            />
          )}
        </section>
      ))}
    </>
  );
}

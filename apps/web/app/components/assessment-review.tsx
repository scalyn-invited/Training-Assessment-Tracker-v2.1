'use client';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import { api, Feedback, Pending } from './auth-ui';
import { useWorkGuard } from './use-work-guard';
import { workState } from './work-guard';
type ScoreRow = {
  id: string;
  score: number | null;
  evidence_ids: string[];
  feedback: string;
  insufficient_evidence: boolean;
};
type Result = {
  criteria: ScoreRow[];
  categories: Record<string, number | null>;
  total: number | null;
  threshold: number | null;
  success: boolean | null;
  rubric_applicable: boolean;
  objective: { percentage: number; correct: number; total: number } | null;
};
type Extraction = {
  id: string;
  status: string;
  version: number;
  text: string | null;
  error: string | null;
  warnings: string[];
  engine: string | null;
  pages: number | null;
};
type ReviewData = {
  status: string;
  canAnalyze: boolean;
  files: { id: string; name: string; status: string; extraction: Extraction | null }[];
  version: number;
  member: boolean;
  canReview: boolean;
  attemptId: string | null;
  definitionId: string;
  revision: number;
  rubricApplicable: boolean;
  objective: Result['objective'];
  appeal: { id: string; assigned: boolean; reason: string } | null;
  approved: {
    attempt_id: string;
    approved_at: string;
    result: Result;
    criterionLabels: Record<string, string>;
  } | null;
  reviews: {
    id: string;
    kind: string;
    status: string;
    result: Result | null;
    reason: string;
    createdAt: string;
  }[];
  rubric: {
    threshold: number | null;
    criteria: { id: string; category: string; label: string; guidance: string; weight: number }[];
  } | null;
  evidence: { id: string; text: string }[];
};
type Action = (action: string, reason: string, extra?: Record<string, unknown>) => Promise<void>;
export function AssessmentReview({
  id,
  client,
  csrf,
  status,
  complete,
  onStatus,
}: {
  id: string;
  client: string;
  csrf: string;
  status: string;
  complete: () => void;
  onStatus: (status: string) => void;
}) {
  const [data, setData] = useState<ReviewData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [writeStopped, setWriteStopped] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState('');
  useWorkGuard({ dirty: false, pending: busy, uncertain: writeStopped });
  async function load(silent = false) {
    setError('');
    if (!silent) setLoading(true);
    try {
      const next = await api<ReviewData>('/assessments/reviews/' + id + '?clientId=' + client);
      if (writeStopped || (data && next.attemptId !== data.attemptId && workState().dirty)) {
        setWriteStopped(true);
        setMessage(
          `Server status: ${next.status}; version ${next.version}. Local review is retained separately and cannot be submitted. Reload to start a fresh review.`,
        );
        return;
      }
      setData(next);
      if (next.canReview) onStatus(next.status);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [id, client]);
  const queued = data?.reviews.some((r) => r.status === 'queued') ?? false;
  const extracting =
    data?.files.some(
      (file) =>
        file.extraction && ['queued', 'waiting_scan', 'running'].includes(file.extraction.status),
    ) ?? false;
  useEffect(() => {
    if ((!queued && !extracting) || error) return;
    const timer = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(timer);
  }, [queued, extracting, error, id, client]);
  const perform: Action = async (action, reason, extra = {}) => {
    if (!data || busy || writeStopped) return;
    const confirmations: Record<string, string> = {
      approve: 'Approve this reviewed result and make the feedback visible to the member?',
      reject: 'Reject this attempt and allow the member to submit a new response?',
      appeal: 'Request an alternate review? Editing will be paused while this appeal is open.',
      uphold: 'Uphold the previous decision and close this appeal?',
      analysis:
        'Request synthetic provisional analysis? Verify the result independently before approving.',
      confirm: 'Confirm that this text has been checked against the original file?',
    };
    if (action !== 'extract' && !window.confirm(confirmations[action])) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/assessments/reviews/' + id, {
        csrf,
        clientId: client,
        expected_version: data.version,
        attempt: data.attemptId,
        action,
        reason,
        ...extra,
      });
      if (data.appeal && data.canReview && ['approve', 'reject', 'uphold'].includes(action)) {
        window.location.assign('/assessments?review=recorded');
        return;
      }
      if (action === 'extract') {
        setMessage(
          'Text extraction requested. Compare the draft with the original before confirming.',
        );
        await load();
      } else if (action === 'analysis') {
        setMessage('Synthetic analysis queued. This page will refresh its review status.');
        await load();
      } else if (action === 'confirm') {
        setMessage('File evidence confirmed. Review scores against the updated evidence.');
        await load();
      } else complete();
    } catch (e) {
      const code = (e as Error & { code?: string }).code;
      if (!code || ['stale_review', 'decision_state', 'review_forbidden'].includes(code))
        setWriteStopped(true);
      setError(
        (e as Error).message +
          ' Your entered review is still here. If the outcome is uncertain, reload the assessment before trying again.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <section className="panel">
        <h2>Review and results</h2>
        <Pending error={error} retry={() => void load()} />
      </section>
    );
  return (
    <section aria-label="Assessment review and results">
      {writeStopped && (
        <p role="status">
          Review writes are stopped. Refresh status to inspect the recorded outcome. Your entered
          values remain here; reload only after reviewing the outcome and accepting that local edits
          will be discarded.
        </p>
      )}
      <Feedback error={error} success={message} />
      {loading && <p role="status">Refreshing review...</p>}
      {error && (
        <button className="secondary" onClick={() => void load()} disabled={busy}>
          Refresh review status
        </button>
      )}
      {data.appeal && (
        <div className="notice">
          <h2>Alternate review requested</h2>
          <p>
            An appeal is open. Previous approved results remain visible while alternate review is
            pending.
          </p>
          <p>
            {data.appeal.assigned
              ? 'An alternate reviewer has been assigned.'
              : 'A Client Admin needs to assign an alternate reviewer.'}
          </p>
        </div>
      )}
      {data.approved && <ApprovedResult approved={data.approved} />}
      {data.canReview && data.attemptId && (
        <>
          {data.objective && (
            <section className="panel">
              <h2>Automatic multiple-choice score</h2>
              <p>
                {data.objective.percentage}% - {data.objective.correct} of {data.objective.total}{' '}
                correct.{' '}
                {data.approved?.attempt_id === data.attemptId
                  ? 'This automatic score uses the assigned revision. The result above was approved.'
                  : 'This uses the assigned revision. Human approval is still required.'}
              </p>
            </section>
          )}
          <section className="panel">
            <h2>Evidence for review</h2>
            {!data.evidence.length && (
              <p>
                No written or confirmed file evidence is available. Do not invent a score without
                evidence.
              </p>
            )}
            {data.evidence.map((item) => (
              <details key={item.id}>
                <summary style={{ overflowWrap: 'anywhere' }}>{item.id}</summary>
                <p style={{ whiteSpace: 'pre-wrap' }}>{item.text}</p>
              </details>
            ))}
            {data.files.map((file, index) =>
              file.status === 'clean' ? (
                <ConfirmFile
                  key={file.id}
                  file={file.id}
                  name={file.name}
                  extraction={file.extraction}
                  refresh={() => void load()}
                  index={index}
                  perform={perform}
                  busy={busy || loading || writeStopped}
                />
              ) : (
                <p key={file.id}>
                  {file.name} - {file.status}. File confirmation is available only after scanning
                  passes.
                </p>
              ),
            )}
          </section>
          {data.reviews.length > 0 && (
            <section className="panel">
              <h2>Review history - private</h2>
              {data.reviews.map((review) => (
                <details key={review.id}>
                  <summary>
                    {review.kind} - {review.status} - {new Date(review.createdAt).toLocaleString()}
                  </summary>
                  <p>{review.reason}</p>
                  {review.result?.criteria.map((row) => (
                    <p key={row.id}>
                      {row.id}: {row.score ?? 'Insufficient evidence'} - {row.feedback}
                    </p>
                  ))}
                </details>
              ))}
            </section>
          )}
          {data.canAnalyze &&
            !queued &&
            ['submitted', 'review_pending', 'technical_failure', 'approved'].includes(
              data.status,
            ) && (
              <ReasonForm
                title="Synthetic provisional analysis"
                label="Analysis reason"
                button="Request synthetic provisional analysis"
                action="analysis"
                perform={perform}
                busy={busy || loading || writeStopped}
              />
            )}
          {data.status === 'technical_failure' && (
            <p className="notice">
              Analysis did not finish. You can review manually or request a new analysis. Uncertain
              provider charges require administrator reconciliation.
            </p>
          )}
          {queued ? (
            <div className="notice" role="status">
              <p>
                Analysis is pending. Wait for it to finish before deciding. You can leave this page
                and return later.
              </p>
              <button className="secondary" onClick={() => void load()} disabled={busy || loading}>
                Refresh analysis status
              </button>
            </div>
          ) : (
            <DecisionForm
              key={
                data.attemptId +
                ':' +
                (data.reviews.find((r) => r.status === 'provisional')?.id ?? 'manual')
              }
              data={data}
              perform={perform}
              busy={busy || loading || writeStopped}
              status={data.status}
            />
          )}
        </>
      )}
      {data.member && ['approved', 'rejected'].includes(status) && !data.appeal && (
        <ReasonForm
          title="Request alternate review"
          label="Reason for appeal"
          button="Request alternate review"
          action="appeal"
          perform={perform}
          busy={busy || loading || writeStopped}
        />
      )}
    </section>
  );
}
function ApprovedResult({ approved }: { approved: NonNullable<ReviewData['approved']> }) {
  const result = approved.result;
  return (
    <section className="panel">
      <h2>Approved result</h2>
      <p>
        Rubric score:{' '}
        <strong>
          {result.rubric_applicable ? (result.total ?? 'Insufficient evidence') : 'Not applicable'}
        </strong>
      </p>
      {result.objective && (
        <p>
          Multiple-choice score: <strong>{result.objective.percentage}%</strong> (
          {result.objective.correct} of {result.objective.total})
        </p>
      )}
      {Object.entries(result.categories).map(([category, value]) => (
        <p key={category}>
          {category}: {value ?? 'Insufficient evidence'}
        </p>
      ))}
      {result.criteria.map((row) => (
        <article key={row.id}>
          <h3>{approved.criterionLabels[row.id] ?? row.id}</h3>
          <p>
            {row.score ?? 'Insufficient evidence'} - {row.feedback}
          </p>
        </article>
      ))}
      {result.rubric_applicable && result.threshold !== null && (
        <p>
          Success threshold: {result.threshold} -{' '}
          {result.success === null
            ? 'Insufficient evidence'
            : result.success
              ? 'Met'
              : 'Not yet met'}
        </p>
      )}
      <p>Approved {new Date(approved.approved_at).toLocaleString()}.</p>
      <p>Development-plan creation is not available for this assessment.</p>
    </section>
  );
}
function ReasonForm({
  title,
  label,
  button,
  action,
  perform,
  busy,
}: {
  title: string;
  label: string;
  button: string;
  action: string;
  perform: Action;
  busy: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void perform(action, reason);
      }}
    >
      <h2>{title}</h2>
      <label>
        {label}
        <textarea
          aria-label={label}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={8}
          maxLength={2000}
          disabled={busy}
        />
      </label>
      <button className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Saving...' : button}
      </button>
    </form>
  );
}
function ConfirmFile({
  file,
  name,
  index,
  extraction,
  refresh,
  perform,
  busy,
}: {
  file: string;
  name: string;
  extraction: Extraction | null;
  refresh: () => void;
  index: number;
  perform: Action;
  busy: boolean;
}) {
  const [text, setText] = useState(''),
    [reason, setReason] = useState('');
  const edited = useRef(false);
  useWorkGuard({ dirty: Boolean(text || reason), pending: busy });
  const pending = Boolean(
    extraction && ['queued', 'waiting_scan', 'running'].includes(extraction.status),
  );
  const fits = Boolean(extraction?.text && [...extraction.text].length <= 30000);
  useEffect(() => {
    if (!edited.current && fits) setText(extraction!.text!);
  }, [extraction?.id, extraction?.version, fits]);

  return (
    <details>
      <summary>Verify {name}</summary>
      <p>
        <a href={'/api/files/' + file}>Download {name}</a>
      </p>
      {!pending && extraction?.status !== 'ready' && (
        <button
          type="button"
          className="secondary"
          onClick={() => void perform('extract', '', { file })}
          disabled={busy}
          aria-busy={busy}
        >
          {extraction?.status === 'failed' ? 'Retry text extraction' : 'Request text extraction'}
        </button>
      )}
      {extraction && (
        <div className="notice">
          <p role="status">Extraction: {extraction.status.replaceAll('_', ' ')}</p>
          {pending && (
            <>
              <p>
                Text extraction is pending. You can leave and return later, or enter verified text
                manually.
              </p>
              <button type="button" className="secondary" disabled={busy} onClick={refresh}>
                Refresh extraction status
              </button>
            </>
          )}
          {extraction.error && <p>{extraction.error}</p>}
          {extraction.text && (
            <>
              <p>
                {extraction.engine}, {extraction.pages} page(s). Extracted text is an unconfirmed
                draft.
              </p>
              {extraction.warnings.map((warning, index) => (
                <p key={index}>{warning}</p>
              ))}
              <details>
                <summary>Read extracted text</summary>
                <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {extraction.text}
                </p>
              </details>
              {fits ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      text &&
                      text !== extraction.text &&
                      !window.confirm(
                        'Replace your entered evidence text with the extraction draft?',
                      )
                    )
                      return;
                    edited.current = true;
                    setText(extraction.text!);
                  }}
                >
                  Use extracted text
                </button>
              ) : (
                <p>
                  The extraction exceeds the 30,000-character evidence limit. Enter the relevant
                  verified text below; the extraction has not been truncated.
                </p>
              )}
            </>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void perform('confirm', reason, { file, text });
        }}
      >
        <label>
          Verified evidence text
          <textarea
            aria-label={'Verified evidence text ' + (index + 1)}
            value={text}
            onChange={(e) => {
              edited.current = true;
              setText(e.target.value);
            }}
            required
            maxLength={30000}
            disabled={busy}
          />
        </label>
        <label>
          Confirmation reason
          <textarea
            aria-label={'Confirmation reason ' + (index + 1)}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            minLength={8}
            maxLength={2000}
            disabled={busy}
          />
        </label>
        <p>
          Confirm only text you have checked against this file. Extraction alone does not confirm
          evidence.
        </p>
        <button className="secondary" disabled={busy} aria-busy={busy}>
          Confirm file evidence
        </button>
      </form>
    </details>
  );
}
function DecisionForm({
  data,
  perform,
  busy,
  status,
}: {
  data: ReviewData;
  perform: Action;
  busy: boolean;
  status: string;
}) {
  const provisional = data.reviews.find((r) => r.status === 'provisional'),
    criteria = data.rubricApplicable ? (data.rubric?.criteria ?? []) : [];
  const [rows, setRows] = useState(() =>
      Object.fromEntries(
        criteria.map((c) => {
          const prior = provisional?.result?.criteria.find((r) => r.id === c.id);
          return [
            c.id,
            {
              score: prior?.score?.toString() ?? '',
              feedback: prior?.feedback ?? '',
              evidence_ids: prior?.evidence_ids ?? [],
              insufficient_evidence: prior?.insufficient_evidence ?? false,
            },
          ];
        }),
      ),
    ),
    [reason, setReason] = useState('');
  const baseline = useRef(JSON.stringify({ rows, reason }));
  useWorkGuard({ dirty: JSON.stringify({ rows, reason }) !== baseline.current, pending: busy });
  function patch(id: string, value: object) {
    setRows((current) => ({ ...current, [id]: { ...current[id], ...value } }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value ?? 'approve';
    void perform(action, reason, {
      source: provisional?.id ?? null,
      result: {
        rubric_id: data.definitionId,
        rubric_version: data.revision,
        criteria: criteria.map((c) => ({
          id: c.id,
          ...rows[c.id],
          score: rows[c.id].score === '' ? null : Number(rows[c.id].score),
        })),
      },
    });
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h2>Human review</h2>
      {provisional && (
        <p className="notice">
          Provisional analysis is prefilled. Independently verify every score and evidence reference
          before approving.
        </p>
      )}
      {criteria.map((c) => {
        const row = rows[c.id];
        return (
          <fieldset key={c.id} disabled={busy}>
            <legend>
              {c.category} - {c.label}
            </legend>
            <p>
              {c.guidance} (weight {c.weight})
            </p>
            <label>
              Score (0-100)
              <input
                aria-label={'Score for ' + c.label}
                type="number"
                min={0}
                max={100}
                step="0.001"
                value={row.score}
                onChange={(e) => patch(c.id, { score: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={row.insufficient_evidence}
                onChange={(e) => patch(c.id, { insufficient_evidence: e.target.checked })}
              />
              Insufficient evidence for {c.label}
            </label>
            <label>
              Member-visible explanation, strengths and next focus
              <textarea
                aria-label={'Feedback for ' + c.label}
                maxLength={4000}
                value={row.feedback}
                onChange={(e) => patch(c.id, { feedback: e.target.value })}
              />
            </label>
            <p>Supporting evidence</p>
            {data.evidence.map((item) => (
              <label key={item.id} style={{ overflowWrap: 'anywhere' }}>
                <input
                  type="checkbox"
                  checked={row.evidence_ids.includes(item.id)}
                  onChange={(e) =>
                    patch(c.id, {
                      evidence_ids: e.target.checked
                        ? [...row.evidence_ids, item.id]
                        : row.evidence_ids.filter((id) => id !== item.id),
                    })
                  }
                />
                {item.id}
              </label>
            ))}
          </fieldset>
        );
      })}
      <label>
        Private decision rationale
        <textarea
          aria-label="Private decision rationale"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={8}
          maxLength={2000}
          disabled={busy}
        />
      </label>
      <div className="actions">
        <button
          className="primary"
          value="approve"
          disabled={
            busy ||
            !['submitted', 'review_pending', 'technical_failure', 'approved'].includes(status)
          }
          aria-busy={busy}
        >
          Approve reviewed result
        </button>
        <button
          className="secondary"
          value="reject"
          disabled={
            busy ||
            !['submitted', 'review_pending', 'technical_failure', 'approved'].includes(status)
          }
        >
          Reject and allow resubmission
        </button>
        {data.appeal && (
          <button className="secondary" value="uphold" disabled={busy}>
            Uphold previous decision
          </button>
        )}
      </div>
    </form>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, Feedback, Guest, Pending, useContext } from './auth-ui';
type Run = {
  id: string;
  status: string;
  message: string;
  reserved: number;
  spent: number;
  createdAt: string;
  resultVersion: number | null;
  baseVersion: number | null;
  feedback: string;
  configuration: {
    policyVersion: number;
    promptVersion: string;
    schemaVersion: string;
    providers: {
      id: string;
      model: string;
      version: string;
      rateVersion: string;
      synthetic: boolean;
    }[];
  };
  blocks: { block_index: number; status: string; calls: number; repairs: number }[];
  attempts: {
    provider: string;
    model: string;
    status: string;
    input_tokens: string | null;
    output_tokens: string | null;
    external_id: string | null;
    block_index: number;
  }[];
};
type Runs = { enrolment: { id: string; title: string }; runs: Run[] };
function useRuns(id: string, client: string | undefined, runId?: string) {
  const [view, setView] = useState<Runs | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const load = useCallback(async () => {
    if (!client || pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      setView(
        await api<Runs>(
          `/enrolments/${id}/plan/generation${runId ? '/' + runId : ''}?clientId=${client}`,
        ),
      );
      setError('');
    } catch (e) {
      setError((e as Error).message + ' Refresh generation details to retry.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }, [id, client, runId]);
  useEffect(() => {
    void load();
  }, [load]);
  const active = view?.runs.some((run) => ['queued', 'running'].includes(run.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [active, load]);
  return { view, error, loading, load };
}
export function GenerationRequest({
  id,
  client,
  csrf,
  version,
  onDirty,
  canQueue,
}: {
  id: string;
  client: string;
  csrf: string;
  version: number;
  onDirty: (value: boolean) => void;
  canQueue: () => boolean;
}) {
  const { view, error: loadError, loading, load } = useRuns(id, client),
    router = useRouter();
  const [feedback, setFeedback] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    attempt = useRef<{ version: number; feedback: string; key: string } | null>(null);
  const active = view?.runs.some((run) => ['queued', 'running', 'ambiguous'].includes(run.status));
  async function queue() {
    if (pending.current || !canQueue()) {
      setError(
        'Save your curriculum edits and resolve the approval rationale before requesting generation.',
      );
      return;
    }
    if (
      !window.confirm(
        `Queue all blocks from curriculum version ${version}? This reserves the configured AI budget and creates only a draft for human review.`,
      )
    )
      return;
    if (
      !attempt.current ||
      attempt.current.version !== version ||
      attempt.current.feedback !== feedback
    )
      attempt.current = { version, feedback, key: crypto.randomUUID() };
    pending.current = true;
    setBusy(true);
    setError('');
    onDirty(true);
    try {
      const run = await api<{ id: string }>(`/enrolments/${id}/plan/generation`, {
        clientId: client,
        csrf,
        ...attempt.current,
      });
      onDirty(false);
      setFeedback('');
      router.push(`/enrolments/${id}/generation/${run.id}`);
    } catch (e) {
      setError(
        (e as Error).message +
          ' Your revision notes are retained. Retry uses the same request key.',
      );
      onDirty(Boolean(feedback));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <details className="panel">
      <summary>Generate or revise with AI</summary>
      <p>
        Generate all blocks as a new draft using the administrator-approved route. Every result
        still requires coordinator review.
      </p>
      <p>
        Data used: profile, confirmed findings, target competencies, KPI definitions, reviewed
        resource, scheduled dates, existing draft and your revision notes. Names, identity records
        and uploaded files are excluded.
      </p>
      <Feedback error={error || loadError} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void queue();
        }}
      >
        <label htmlFor="generation-feedback">Revision notes (optional)</label>
        <textarea
          id="generation-feedback"
          rows={3}
          maxLength={4000}
          value={feedback}
          disabled={busy}
          onChange={(e) => {
            setFeedback(e.target.value);
            onDirty(Boolean(e.target.value));
          }}
        />
        {active && (
          <p className="notice">
            An existing generation is queued, running or awaiting charge reconciliation. Open its
            progress before requesting another.
          </p>
        )}
        <button className="primary" disabled={busy || Boolean(active) || !view} aria-busy={busy}>
          {busy ? 'Queuing curriculum generation…' : 'Queue curriculum generation'}
        </button>
      </form>
      <h3>Recent generation requests</h3>
      {!view && !loadError && <p role="status">Loading generation requests…</p>}
      {view?.runs.length === 0 && (
        <p>
          No generation requests yet. You can queue a draft above or continue editing the curriculum
          manually.
        </p>
      )}
      <ul>
        {view?.runs.map((run) => (
          <li key={run.id}>
            <Link href={`/enrolments/${id}/generation/${run.id}`}>
              {run.baseVersion === null
                ? 'Archived request (temporary input removed)'
                : `Version ${run.baseVersion} request`}{' '}
              · {run.status} · {new Date(run.createdAt).toLocaleString()}
            </Link>
          </li>
        ))}
      </ul>
      <button className="secondary" type="button" disabled={loading} onClick={() => void load()}>
        {loading ? 'Refreshing generation requests…' : 'Refresh generation requests'}
      </button>
    </details>
  );
}
export function GenerationRun({ id, runId }: { id: string; runId: string }) {
  const { context, error: contextError, load: loadContext } = useContext(),
    client = context?.client?.id;
  const { view, error, loading, load } = useRuns(id, client, runId),
    run = view?.runs[0];
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={contextError} retry={loadContext} />
      ) : !client ? (
        <>
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <>
          <Link className="back" href={`/enrolments/${id}/plan`}>
            Back to curriculum
          </Link>
          <p className="eyebrow">Draft generation</p>
          <h1>{view?.enrolment.title || 'Curriculum generation'}</h1>
          <Feedback error={error} />
          {!view && !error && <p role="status">Loading generation details…</p>}
          {view && !run && (
            <p>
              This request is unavailable in the selected training record. Return to the curriculum
              to see your available requests.
            </p>
          )}
          {run && (
            <>
              <section className="panel">
                <h2>Generation progress</h2>
                <p role="status">{run.message}</p>
                <p>
                  {run.blocks.filter((b) => b.status === 'complete').length} of {run.blocks.length}{' '}
                  blocks complete · {run.status}
                </p>
                <p>
                  Reserved:{' '}
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {run.reserved.toLocaleString()} micro-USD
                  </span>{' '}
                  · Accounted usage:{' '}
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {run.spent.toLocaleString()} micro-USD
                  </span>
                </p>
                <p className="subtle">
                  1,000,000 micro-USD = USD 1. Mock amounts are simulated ledger entries, not actual
                  charges. Uncertain charges remain reserved until reconciled.
                </p>
                {run.status === 'ambiguous' && (
                  <p className="notice">
                    Ask a client administrator to reconcile the uncertain charge in AI settings.
                    Automatic retry is stopped; your existing curriculum remains available.
                  </p>
                )}
                {run.status === 'failed' && (
                  <p className="notice">
                    The generated content was not applied. Review the current curriculum and inputs
                    before requesting a new draft.
                  </p>
                )}
                {run.resultVersion && (
                  <p>
                    <Link href={`/enrolments/${id}/plan?version=${run.resultVersion}`}>
                      Review generated draft · version {run.resultVersion}
                    </Link>
                  </p>
                )}
                <ol>
                  {run.blocks.map((b) => (
                    <li key={b.block_index}>
                      Block {b.block_index + 1} · {b.status} · {b.calls} provider calls ·{' '}
                      {b.repairs} repairs
                    </li>
                  ))}
                </ol>
              </section>
              <section className="panel">
                <h2>Configuration and provenance</h2>
                <p>
                  Policy version {run.configuration.policyVersion} · Prompt{' '}
                  {run.configuration.promptVersion} · Schema {run.configuration.schemaVersion}
                </p>
                <ul>
                  {run.configuration.providers.map((p, i) => (
                    <li key={p.id}>
                      {p.id} · {p.model} · Configuration {p.version} · Rate {p.rateVersion}
                      {i > 0 ? ' (permitted fallback)' : ''}
                      {p.synthetic ? ' · synthetic demonstration' : ''}
                    </li>
                  ))}
                </ul>
                <p className="preserve-lines">
                  Revision notes:{' '}
                  {run.baseVersion === null
                    ? 'Removed under retention policy'
                    : run.feedback || 'None'}
                </p>
                <h3>Provider attempts</h3>
                <ul>
                  {run.attempts.length ? (
                    run.attempts.map((a, i) => (
                      <li key={i}>
                        Block {a.block_index + 1} · {a.provider} · {a.model} · {a.status} ·{' '}
                        {a.input_tokens ?? 'unknown'} input / {a.output_tokens ?? 'unknown'} output
                        tokens · Request {a.external_id ?? 'not supplied'}
                      </li>
                    ))
                  ) : (
                    <li>No provider attempts yet.</li>
                  )}
                </ul>
              </section>
            </>
          )}
          <button className="secondary" disabled={loading} onClick={() => void load()}>
            {loading ? 'Refreshing generation details…' : 'Refresh full details'}
          </button>
        </>
      )}
    </Guest>
  );
}

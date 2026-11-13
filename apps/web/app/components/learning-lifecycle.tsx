'use client';
import { useEffect, useRef, useState } from 'react';
import { api, Feedback, Pending } from './auth-ui';
import { ReasonAction, useLeaveGuard } from './learning-controls';
import type { LearningLifecycle as LifecycleService } from '../../../../packages/domain/src/learning-lifecycle';
type View = Awaited<ReturnType<LifecycleService['read']>>;
export function LearningLifecycle({
  id,
  client,
  csrf,
  version,
  refresh,
}: {
  id: string;
  client: string;
  csrf: string;
  version: number;
  refresh: () => Promise<unknown>;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [weeks, setWeeks] = useState('0'),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  const sequence = useRef(0),
    pending = useRef(false);
  useLeaveGuard(!!reason || busy);
  async function load() {
    const request = ++sequence.current;
    try {
      const v = await api<View>(`/enrolments/${id}/lifecycle?clientId=${client}`);
      if (request === sequence.current) {
        setView(v);
        setError('');
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    setView(null);
    void load();
    return () => {
      sequence.current++;
    };
  }, [id, client, version]);
  async function mutate(data: Record<string, unknown>) {
    await api(`/enrolments/${id}/lifecycle`, {
      csrf,
      clientId: client,
      version: view!.version,
      ...data,
    });
    await load();
    await refresh();
  }
  async function preview(e: React.FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await mutate({ action: 'preview', weeks: Number(weeks), reason });
      setReason('');
      setMessage('Preview created. Dates remain unchanged until you confirm resumption.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (!view)
    return (
      <section className="panel">
        <h2>Programme status</h2>
        <Pending error={error} retry={load} />
      </section>
    );
  if (!view.canManage) return null;
  return (
    <section className="panel">
      <h2>Programme status</h2>
      <Feedback error={error} success={message} />
      {view.status === 'active' && (
        <>
          <details>
            <summary>Pause programme</summary>
            <ReasonAction
              label="Pause programme"
              help="Pausing stops new lesson work. Existing drafts, submissions and approved evidence remain available."
              confirm="Pause this programme? The member cannot save or submit new lesson work until it is resumed."
              run={async (reason) => {
                await mutate({ action: 'pause', reason });
                setMessage(
                  'Programme paused. Review an explicit calendar preview before resuming.',
                );
              }}
            />
          </details>
          <details>
            <summary>Confirm programme completion</summary>
            <ReasonAction
              label="Complete programme"
              help="Every required lesson must have approved evidence, and at least three current KPI targets must have sufficient on-target evidence. Time elapsed alone does not complete training."
              confirm="Confirm the member has achieved the required capability and complete this programme? This decision will be recorded in its history."
              run={async (reason) => {
                await mutate({ action: 'complete', reason });
                setMessage('Programme completed with approved capability evidence.');
              }}
            />
          </details>
        </>
      )}
      {view.status === 'paused' && (
        <>
          <p>
            Programme paused. Started work stays on its original dates. Preview how unstarted blocks
            will resume.
          </p>
          <form onSubmit={preview}>
            <label>
              Move unstarted blocks by weeks
              <input
                type="number"
                min={0}
                max={52}
                step={1}
                required
                value={weeks}
                disabled={busy}
                onChange={(e) => setWeeks(e.target.value)}
              />
            </label>
            <p>
              Use 0 to retain dates. Shared calendar availability and capacity are checked before
              preview and again before resumption.
            </p>
            <label>
              Resumption reason
              <input
                required
                minLength={8}
                maxLength={2000}
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Checking calendar...' : 'Preview resumption'}
            </button>
          </form>
          <h3>Resumption previews</h3>
          {!!reason && (
            <p>Create the new preview or clear its reason before approving an earlier preview.</p>
          )}
          {!view.previews.length ? (
            <p>No previews yet. Enter the planned delay and reason above.</p>
          ) : (
            view.previews.map((p) => (
              <article key={p.id} className="panel">
                <h4>
                  {p.preview.weeks === 0
                    ? 'Keep unstarted block dates'
                    : `Move unstarted blocks by ${p.preview.weeks} weeks`}
                </h4>
                <p>{p.reason}</p>
                <ul>
                  {Object.values(p.preview.replacements).map((b) => (
                    <li key={b.number}>
                      Block {b.number}: {b.start}
                      <ul>
                        {b.lessons.map((l, i) => (
                          <li key={i}>
                            {l.date} / {l.title}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {!Object.keys(p.preview.replacements).length && (
                  <p>All blocks have started. Their dates will stay unchanged.</p>
                )}
                <p>
                  {Object.keys(p.preview.days).length} future learning days checked against shared
                  capacity.
                </p>
                <ResumePreview
                  disabled={busy || !!reason || p.version !== view.version}
                  stale={p.version !== view.version}
                  run={async () => {
                    await mutate({ action: 'resume', changeId: p.id });
                    setMessage('Programme resumed. Started history is preserved.');
                  }}
                />
              </article>
            ))
          )}
        </>
      )}
      {view.status === 'completed' && (
        <p>Programme completed. Submitted evidence and decisions remain in history.</p>
      )}
    </section>
  );
}
function ResumePreview({
  disabled,
  stale,
  run,
}: {
  disabled: boolean;
  stale: boolean;
  run: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  return (
    <>
      <Feedback error={error} />
      {stale && <p>This preview is out of date. Create a new preview.</p>}
      <button
        className="secondary"
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={async () => {
          if (
            pending.current ||
            !window.confirm(
              'Resume with these exact dates? Unstarted blocks receive new versions; started history is preserved.',
            )
          )
            return;
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            await run();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? 'Resuming programme...' : 'Confirm preview and resume'}
      </button>
    </>
  );
}

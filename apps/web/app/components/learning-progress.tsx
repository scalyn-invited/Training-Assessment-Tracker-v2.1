'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest } from './auth-ui';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Textarea, Panel, PageHeader, Feedback } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/learning-progress.module.css';
import recordStyles from './ui/training-record.module.css';
import { registerWorkGuard } from './work-guard';
import { LearningSupport } from './learning-support';
import type { LearningKpis } from '../../../../packages/domain/src/learning-kpis';
type View = Awaited<ReturnType<LearningKpis['read']>>;
type Metric = View['metrics'][number];
export function LearningProgress({ id }: { id: string }) {
  const ctx = useContext(),
    client = ctx.context?.client?.id;
  const router = useRouter();
  useEffect(() => {
    if (ctx.context && !ctx.context.user) router.replace('/login');
  }, [ctx.context, router]);
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState('');
  const sequence = useRef(0);
  async function load() {
    if (!client) return;
    const request = ++sequence.current;
    try {
      const v = await api<View>(`/enrolments/${id}/progress?clientId=${client}`);
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
  }, [id, client]);
  async function mutate(data: Record<string, unknown>) {
    await api(`/enrolments/${id}/progress`, { csrf: ctx.context!.csrf, clientId: client, ...data });
    await load();
  }
  return (
    <Guest>
      <div className={layout.page}>
        <Link href={`/enrolments/${id}/delivery`}>Back to learning plan</Link>
        {!ctx.context?.user || !view ? (
          <>
            <PageHeader title="Progress and evidence" />
            <Feedback error={error || ctx.error} />
            {error || ctx.error ? (
              <Button onClick={() => void (ctx.context?.user ? load() : ctx.load())}>
                Try loading again
              </Button>
            ) : (
              <p role="status">
                {ctx.context?.user ? 'Loading progress...' : 'Loading your session...'}
              </p>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">{view.memberName}</p>
              <PageHeader title="Progress and evidence">{view.enrolment.title}</PageHeader>
            </div>
            <p>Approved evidence informs progress. Missing samples are never treated as zero.</p>
            <Feedback error={error} />
            {!view.metrics.length ? (
              <p className={recordStyles.notice}>
                KPI definitions become available after programme activation.
              </p>
            ) : (
              view.metrics.map((metric) => (
                <MetricCard
                  key={metric.id}
                  metric={metric}
                  coordinator={view.coordinator}
                  mutate={mutate}
                />
              ))
            )}
            <LearningSupport
              key={`${id}:${client}`}
              id={id}
              client={client!}
              csrf={ctx.context!.csrf}
              active={view.enrolment.status === 'active'}
            />
          </>
        )}
      </div>
    </Guest>
  );
}
function MetricCard({
  metric: m,
  coordinator,
  mutate,
}: {
  metric: Metric;
  coordinator: boolean;
  mutate: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const pending = useRef(false);
  useEffect(() => registerWorkGuard(() => ({ dirty: false, pending: pending.current })), []);
  const d = m.definition,
    s = m.snapshot;
  return (
    <Panel className={`${layout.panel} ${styles.panel}`}>
      <h2>{d.name}</h2>
      <p>{d.rationale}</p>
      <p>
        Target {d.target}
        {d.direction === 'band' ? ` to ${d.upper_target}` : ''} {d.unit} /{' '}
        {d.direction === 'higher'
          ? 'At least'
          : d.direction === 'lower'
            ? 'At most'
            : 'Within band'}{' '}
        / {d.evidence_type.replaceAll('_', ' ')} / definition {m.version}
      </p>
      <p>
        <strong>{s ? s.status.replaceAll('_', ' ') : 'Insufficient evidence'}</strong> /{' '}
        {s?.value ?? 'No sufficient result'} / {s?.sampleCount ?? 0}/{d.sample_minimum} required
        samples
      </p>
      {s && (
        <details>
          <summary>Evidence lineage</summary>
          <p>
            Snapshot {s.id} / {new Date(s.createdAt).toISOString()}. Later changes do not rewrite
            this snapshot.
          </p>
          <ul>
            {s.sourceIds.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </details>
      )}
      {coordinator && (
        <>
          <Feedback error={error} success={message} />
          <Button
            variant="secondary"
            disabled={busy}
            aria-busy={busy}
            onClick={async () => {
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              setError('');
              try {
                await mutate({ action: 'snapshot', metricId: m.id });
                setMessage('Evidence snapshot recorded. Earlier snapshots remain in history.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            {busy ? 'Recording snapshot...' : 'Refresh evidence snapshot'}
          </Button>
          {d.formula === 'manual_mean' && <Observation metric={m} mutate={mutate} />}
          {m.latest && (
            <>
              <p>
                {m.latest.id !== m.id
                  ? `Latest definition ${m.latest.version} takes effect at ${new Date(m.latest.effectiveAt).toISOString()}. Current evidence still uses definition ${m.version}.`
                  : ''}
              </p>
              <Definition key={m.latest.id} metric={m} mutate={mutate} />
            </>
          )}
        </>
      )}
    </Panel>
  );
}
function Observation({
  metric: m,
  mutate,
}: {
  metric: Metric;
  mutate: (d: Record<string, unknown>) => Promise<void>;
}) {
  const [value, setValue] = useState(''),
    [evidence, setEvidence] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const pending = useRef(false);
  useEffect(
    () =>
      registerWorkGuard(() => ({
        dirty: !!value || !!evidence || !!reason,
        pending: pending.current,
      })),
    [value, evidence, reason],
  );
  return (
    <details>
      <summary>Record workplace evidence</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            pending.current ||
            !window.confirm(
              `Record this verified observation for ${m.definition.name}? It will contribute to progress and remain in history.`,
            )
          )
            return;
          pending.current = true;
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await mutate({
              action: 'observe',
              metricId: m.id,
              value: Number(value),
              evidence,
              reason,
            });
            setValue('');
            setEvidence('');
            setReason('');
            setMessage('Verified observation recorded.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Observed value
          <Input
            type="number"
            step="any"
            required
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label>
          Evidence reference
          <Textarea
            aria-label="Evidence reference"
            required
            minLength={10}
            maxLength={4000}
            value={evidence}
            disabled={busy}
            onChange={(e) => setEvidence(e.target.value)}
          />
        </label>
        <label>
          Observation reason
          <Input
            required
            minLength={8}
            maxLength={2000}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Feedback error={error} success={message} />
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Recording evidence...' : 'Record evidence'}
        </Button>
      </form>
    </details>
  );
}
function Definition({
  metric: m,
  mutate,
}: {
  metric: Metric;
  mutate: (d: Record<string, unknown>) => Promise<void>;
}) {
  const latest = m.latest!,
    base = latest.definition;
  const [d, setD] = useState({
      ...base,
      target: String(base.target),
      upper_target: base.upper_target == null ? '' : String(base.upper_target),
      sample_minimum: String(base.sample_minimum),
    }),
    [effective, setEffective] = useState(''),
    [reason, setReason] = useState(''),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  useEffect(() => registerWorkGuard(() => ({ dirty, pending: pending.current })), [dirty]);
  function field(key: string, value: string) {
    setD((p) => ({ ...p, [key]: value }));
    setDirty(true);
  }
  return (
    <details>
      <summary>Revise future KPI definition</summary>
      <p>
        Revision starts from the latest definition, version {latest.version}. Historical
        observations and snapshots will not be recalculated into the new definition.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            pending.current ||
            !window.confirm(
              `Create a future definition for ${m.definition.name}? Earlier evidence stays with its original definition.`,
            )
          )
            return;
          pending.current = true;
          setBusy(true);
          setError('');
          try {
            await mutate({
              action: 'revise',
              metricId: latest.id,
              definition: {
                ...d,
                target: Number(d.target),
                upper_target: d.upper_target === '' ? null : Number(d.upper_target),
                sample_minimum: Number(d.sample_minimum),
              },
              effective: effective + ':00Z',
              reason,
            });
            setDirty(false);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>Measure and purpose</legend>
          {(['name', 'rationale', 'unit', 'baseline'] as const).map((k) => (
            <label key={k}>
              {k[0].toUpperCase() + k.slice(1)}
              <Input
                required
                maxLength={k === 'rationale' ? 1000 : k === 'unit' ? 100 : 200}
                value={d[k]}
                onChange={(e) => field(k, e.target.value)}
              />
            </label>
          ))}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Target and direction</legend>
          <label>
            Target
            <Input
              type="number"
              step="any"
              required
              value={d.target}
              onChange={(e) => field('target', e.target.value)}
            />
          </label>
          <label>
            Direction
            <Select
              aria-label="Direction"
              value={d.direction}
              onChange={(e) => field('direction', e.target.value)}
            >
              <option value="higher">At least the target</option>
              <option value="lower">At most the target</option>
              <option value="band">Within a target band</option>
            </Select>
          </label>
          {d.direction === 'band' && (
            <label>
              Upper target
              <Input
                type="number"
                step="any"
                required
                value={d.upper_target}
                onChange={(e) => field('upper_target', e.target.value)}
              />
            </label>
          )}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Comparable evidence</legend>
          <label>
            Formula
            <Select
              aria-label="Formula"
              value={d.formula}
              onChange={(e) => field('formula', e.target.value)}
            >
              <option value="approved_grade_mean">Approved grade mean (percent)</option>
              <option value="manual_mean">Observed evidence mean</option>
            </Select>
          </label>
          <label>
            Evidence type
            <Select
              aria-label="Evidence type"
              value={d.evidence_type}
              onChange={(e) => field('evidence_type', e.target.value)}
            >
              <option value="demonstrated_competence">Demonstrated competence</option>
              <option value="workplace_outcome">Workplace outcome</option>
            </Select>
          </label>
          <label>
            Minimum samples
            <Input
              type="number"
              min={1}
              max={100}
              required
              value={d.sample_minimum}
              onChange={(e) => field('sample_minimum', e.target.value)}
            />
          </label>
          <p>
            Approved grade means require percent units and demonstrated competence. Different
            evidence types are never combined.
          </p>
        </fieldset>
        <label>
          Effective from (UTC)
          <Input
            type="datetime-local"
            required
            disabled={busy}
            value={effective}
            onChange={(e) => {
              setEffective(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label>
          Revision reason
          <Input
            required
            minLength={8}
            maxLength={2000}
            disabled={busy}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <Feedback error={error} />
        <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving definition...' : 'Save future definition'}
        </Button>
      </form>
    </details>
  );
}

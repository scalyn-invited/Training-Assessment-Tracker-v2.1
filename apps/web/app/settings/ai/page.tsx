'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending } from '../../components/auth-ui';
import {
  Button,
  Input,
  Select,
  Textarea,
  Panel,
  PageHeader,
  Feedback,
} from '../../components/ui/controls';
import styles from '../../components/ui/form-layout.module.css';
type Policy = { task: string; version: number; routing: string[] };
type Provider = {
  enabled: boolean;
  contextBytes: number;
  maxOutputTokens: number;
  id: string;
  model: string;
  purposes: string[];
  currency: string;
  rateVersion: string;
};
type Charge = { id: string; spent: string; reserved: string };
type Settings = {
  organisationLimit: number;
  programmeLimit: number;
  policies: Policy[];
  providers: Provider[];
  ambiguous: Charge[];
};
const label = (task: string) =>
  ({
    generate_programme: 'Generate programme',
    assess_initial: 'Assess initial',
    grade_submission: 'Grade submission',
    propose_adaptation: 'Propose adaptation',
    suggest_kpi_actions: 'Suggest KPI actions',
  })[task] ?? task;
export default function AiSettings() {
  const { context, error, load } = useContext(),
    router = useRouter();
  const [data, setData] = useState<Settings | null>(null),
    [failure, setFailure] = useState(''),
    [revision, setRevision] = useState(0);
  const client = context?.client?.id;
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user || !client) return;
    let cancelled = false;
    setData(null);
    setFailure('');
    api<Settings>('/ai/settings?clientId=' + client)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [context?.user?.id, client, revision]);
  if (!context)
    return (
      <Guest>
        <Pending error={error} retry={load} />
      </Guest>
    );
  if (!context.user)
    return (
      <Guest>
        <p>Opening sign in...</p>
      </Guest>
    );
  if (!client)
    return (
      <Guest>
        <PageHeader title="AI provider settings" />
        <p>Select a client to manage provider routing.</p>
        <Link href="/clients">Choose a client</Link>
      </Guest>
    );
  const refresh = () => setRevision((v) => v + 1);
  return (
    <Guest>
      <div className={styles.page}>
        <Link href="/administration">Client administration</Link>
        <PageHeader title="AI provider settings" />
        <p>{context.client?.name}</p>
        <p>
          Routing changes apply to new requests. Existing requests retain their exact configuration.
        </p>
        {!data ? (
          failure ? (
            <>
              <Feedback error={failure} />
              <Button onClick={refresh}>Try loading again</Button>
            </>
          ) : (
            <p role="status">Loading provider settings...</p>
          )
        ) : (
          <>
            <Panel className={styles.panel}>
              <h2>Provider registry</h2>
              <p>
                Lifetime client cap: {data.organisationLimit} micro-USD. Per-programme cap:{' '}
                {data.programmeLimit} micro-USD. Reservations and accounted usage both count.
              </p>
              <p>
                Models, data policies, limits and pricing are configured by deployment. Credentials
                are never displayed. Mock charges are simulated.
              </p>
              {data.providers.length ? (
                <ul>
                  {data.providers.map((p) => (
                    <li key={p.id}>
                      <strong>{p.id}</strong> - {p.enabled ? 'Enabled' : 'Not configured'} -{' '}
                      {p.model} - {p.currency}, pricing {p.rateVersion}. {p.contextBytes} input
                      bytes / {p.maxOutputTokens} output tokens
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No qualified provider is configured. Contact the deployment administrator before
                  requesting analysis.
                </p>
              )}
            </Panel>
            {data.policies.map((p) => (
              <RouteForm
                key={client + ':' + p.task + ':' + p.version}
                policy={p}
                providers={data.providers}
                client={client}
                csrf={context.csrf}
              />
            ))}
            <Panel className={styles.panel}>
              <h2>Uncertain charges</h2>
              <p>
                Reconcile against provider billing evidence. Enter the total for the entire run,
                including already accounted calls. This releases the hold; a new request must be
                made separately.
              </p>
              {!data.ambiguous.length && <p>No charges awaiting reconciliation.</p>}
              {data.ambiguous.map((run) => (
                <ChargeForm
                  key={client + ':' + run.id}
                  run={run}
                  client={client}
                  csrf={context.csrf}
                />
              ))}
            </Panel>
            <Button
              type="submit"
              variant="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    'Reload provider settings? Unsaved form changes will be discarded.',
                  )
                )
                  refresh();
              }}
            >
              Reload provider settings
            </Button>
          </>
        )}
      </div>
    </Guest>
  );
}
function RouteForm({
  policy,
  providers,
  client,
  csrf,
}: {
  policy: Policy;
  providers: Provider[];
  client: string;
  csrf: string;
}) {
  const choices = providers.filter((p) => p.enabled && p.purposes.includes(policy.task));
  const [primary, setPrimary] = useState(policy.routing[0] ?? ''),
    [fallback, setFallback] = useState(policy.routing[1] ?? ''),
    [version, setVersion] = useState(policy.version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<{ version: number }>('/ai/policy', {
        csrf,
        clientId: client,
        task: policy.task,
        expectedVersion: version,
        primary,
        fallback: fallback || null,
      });
      setVersion(result.version);
      setSuccess(
        'Routing version ' +
          result.version +
          ' saved. Existing requests retain their configuration.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className={styles.panel}>
      <h2>{label(policy.task)}</h2>
      <p>Routing version {version}</p>
      <Feedback error={error} success={success} />
      <form onSubmit={save}>
        <fieldset disabled={busy || !choices.length}>
          <legend>Provider route</legend>
          <label>
            Primary provider
            <Select
              aria-label={'Primary provider for ' + label(policy.task)}
              value={primary}
              required
              onChange={(e) => setPrimary(e.target.value)}
            >
              {!choices.some((p) => p.id === primary) && (
                <option value="">Choose a provider</option>
              )}
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Explicitly permitted fallback (optional)
            <Select
              aria-label={'Fallback provider for ' + label(policy.task)}
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
            >
              <option value="">None</option>
              {choices.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </Select>
          </label>
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || !choices.some((p) => p.id === primary)}
            aria-busy={busy}
          >
            {busy ? 'Saving route...' : 'Save ' + label(policy.task).toLowerCase() + ' route'}
          </Button>
        </fieldset>
        {!choices.length && <p>No qualified provider supports this task.</p>}
      </form>
    </Panel>
  );
}
function ChargeForm({ run, client, csrf }: { run: Charge; client: string; csrf: string }) {
  const [total, setTotal] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      busy ||
      done ||
      !window.confirm(
        'Record the verified total and release this reservation? This will not retry the request.',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api('/ai/runs/' + run.id + '/reconcile', {
        csrf,
        clientId: client,
        total: Number(total),
        reason,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <h3 style={{ overflowWrap: 'anywhere' }}>Run {run.id}</h3>
      <p>
        Known usage: <span style={{ whiteSpace: 'nowrap' }}>{run.spent} micro-USD</span>
      </p>
      <p>
        Reserved: <span style={{ whiteSpace: 'nowrap' }}>{run.reserved} micro-USD</span>
      </p>
      <Feedback
        error={error}
        success={done ? 'Charge reconciliation recorded. The request was not retried.' : ''}
      />
      {!done && (
        <fieldset disabled={busy}>
          <legend>Billing evidence</legend>
          <label>
            Verified total (micro-USD)
            <Input
              aria-label={'Verified total for ' + run.id}
              type="number"
              min={run.spent}
              max={Number.MAX_SAFE_INTEGER}
              step={1}
              required
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </label>
          <label>
            Billing reference and reason
            <Textarea
              aria-label={'Billing reason for ' + run.id}
              required
              minLength={8}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={busy} aria-busy={busy}>
            {busy ? 'Recording reconciliation...' : 'Record reconciliation'}
          </Button>
        </fieldset>
      )}
    </form>
  );
}

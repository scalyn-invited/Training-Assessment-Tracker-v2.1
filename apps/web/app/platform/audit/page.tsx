'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, Feedback } from '../../components/auth-ui';
type Event = {
  id: string;
  action: string;
  target_id: string;
  reason: string;
  changes: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  operator_reference: string | null;
};
type History = { events: Event[]; total: number; actions: string[]; page: number };
const title = (value: string) => value.replace(/[._]/g, ' ');
export default function AuditPage() {
  const { context, error, load } = useContext(),
    router = useRouter();
  const [filters, setFilters] = useState(''),
    [result, setResult] = useState<History | null>(null),
    [actions, setActions] = useState<string[]>([]),
    [failure, setFailure] = useState(''),
    [busy, setBusy] = useState(true),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user?.global_admin) return;
    let cancelled = false;
    setBusy(true);
    setFailure('');
    setResult(null);
    api<History>('/platform/audit?' + filters)
      .then((data) => {
        if (!cancelled) {
          setResult(data);
          setActions(data.actions);
        }
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context, filters, retry]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const [key, value] of data) if (String(value)) query.set(key, String(value));
    setFilters(query.toString());
    setRetry((n) => n + 1);
  }
  function page(number: number) {
    const query = new URLSearchParams(filters);
    query.set('page', String(number));
    setFilters(query.toString());
  }
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !context.user.global_admin ? (
        <>
          <h1>Global Admin access required</h1>
          <Link href="/dashboard">Return to workspace</Link>
        </>
      ) : (
        <>
          <p className="eyebrow">Platform administration</p>
          <h1>Administrative audit</h1>
          <p>
            <Link href="/dashboard">Workspace</Link> ·{' '}
            <Link href="/platform/clients">Manage clients</Link>
          </p>
          <section className="panel directory-panel">
            <h2>Filter and review events</h2>
            <p>Dates and times are shown in UTC.</p>
            <form
              onSubmit={submit}
              onReset={() => {
                setFilters('');
                setRetry((n) => n + 1);
              }}
              className="directory-filters directory-audit-filters"
            >
              <label>
                Action
                <select name="action" defaultValue="">
                  <option value="">All actions</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {title(action)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search reason or target
                <input name="query" maxLength={120} />
              </label>
              <label>
                Exact target ID
                <input name="target" maxLength={80} />
              </label>
              <label>
                Actor name
                <input name="actor" maxLength={120} />
              </label>
              <label>
                From (UTC)
                <input name="from" type="date" />
              </label>
              <label>
                To (UTC)
                <input name="to" type="date" />
              </label>
              <button disabled={busy} aria-busy={busy}>
                {busy ? 'Loading events…' : 'Filter audit'}
              </button>
              <button type="reset" className="secondary" disabled={busy}>
                Clear filters
              </button>
            </form>
            <Feedback error={failure} />
            {failure && (
              <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
                Retry audit
              </button>
            )}
            {busy && <p role="status">Loading administrative events…</p>}
            {result && (
              <>
                <p role="status">{result.total} matching events</p>
                <table className="directory-table">
                  <caption className="sr-only">Administrative audit</caption>
                  <thead>
                    <tr>
                      {['Time (UTC)', 'Actor', 'Action', 'Target', 'Reason', 'Details'].map(
                        (label) => (
                          <th scope="col" key={label}>
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {result.events.map((event) => (
                      <tr key={event.id}>
                        <td data-label="Time (UTC)">
                          <time dateTime={event.created_at}>
                            {new Date(event.created_at)
                              .toISOString()
                              .replace('T', ' ')
                              .replace(/\.\d+Z$/, ' UTC')}
                          </time>
                        </td>
                        <td data-label="Actor">
                          {event.actor_name ??
                            'Operator: ' + (event.operator_reference ?? 'unrecorded')}
                        </td>
                        <td data-label="Action">
                          {title(event.action)}
                          <small>{event.action}</small>
                        </td>
                        <td data-label="Target">{event.target_id}</td>
                        <td data-label="Reason">{event.reason}</td>
                        <td data-label="Details">
                          <details>
                            <summary>Change details</summary>
                            {Object.entries(event.changes ?? {}).map(([key, value]) => (
                              <div key={key}>
                                <strong>{title(key)}</strong>
                                {value &&
                                typeof value === 'object' &&
                                ('before' in value || 'after' in value) ? (
                                  <dl>
                                    <dt>Before</dt>
                                    <dd className="audit-changes">
                                      {JSON.stringify(
                                        (value as Record<string, unknown>).before ?? null,
                                      )}
                                    </dd>
                                    <dt>After</dt>
                                    <dd className="audit-changes">
                                      {JSON.stringify(
                                        (value as Record<string, unknown>).after ?? null,
                                      )}
                                    </dd>
                                  </dl>
                                ) : (
                                  <p className="audit-changes">{JSON.stringify(value)}</p>
                                )}
                              </div>
                            ))}
                            {!Object.keys(event.changes ?? {}).length && (
                              <p>No detailed change payload was recorded for this event.</p>
                            )}
                          </details>
                        </td>
                      </tr>
                    ))}
                    {!result.events.length && (
                      <tr>
                        <td colSpan={6}>No administrative events match these filters.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <nav aria-label="Audit pages">
                  <button
                    className="secondary"
                    disabled={busy || result.page <= 1}
                    onClick={() => page(result.page - 1)}
                  >
                    Previous page
                  </button>
                  <span> Page {result.page} </span>
                  <button
                    className="secondary"
                    disabled={busy || result.page * 25 >= result.total}
                    onClick={() => page(result.page + 1)}
                  >
                    Next page
                  </button>
                </nav>
              </>
            )}
          </section>
        </>
      )}
    </Guest>
  );
}

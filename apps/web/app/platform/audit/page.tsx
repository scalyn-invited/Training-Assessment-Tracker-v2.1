'use client';
import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, Feedback } from '../../components/auth-ui';
import { AuditIcon } from '../../components/audit-icon';
import { Dialog } from '../../components/ui/dialog';
import shell from '../overview.module.css';
import styles from './audit.module.css';

type AuditEvent = {
  id: string;
  action: string;
  target_id: string;
  reason: string;
  changes: Record<string, unknown>;
  created_at: string;
  actor_name: string | null;
  operator_reference: string | null;
};
type History = { events: AuditEvent[]; total: number; actions: string[]; page: number };
type Filters = {
  action: string;
  query: string;
  target: string;
  actor: string;
  from: string;
  to: string;
  page: number;
};
const empty: Filters = { action: '', query: '', target: '', actor: '', from: '', to: '', page: 1 };
const title = (value: string) => {
  const words = value.replace(/[._]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const actorName = (event: AuditEvent) =>
  event.actor_name ?? 'Operator: ' + (event.operator_reference ?? 'unrecorded');
const iso = (value: string) => new Date(value).toISOString();
function fromUrl(): Filters {
  const query = new URLSearchParams(window.location.search),
    page = Number(query.get('page') ?? 1);
  return {
    action: (query.get('action') ?? '').slice(0, 120),
    query: (query.get('query') ?? '').slice(0, 120),
    target: (query.get('target') ?? '').slice(0, 80),
    actor: (query.get('actor') ?? '').slice(0, 120),
    from: (query.get('from') ?? '').slice(0, 10),
    to: (query.get('to') ?? '').slice(0, 10),
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
  };
}
function parameters(filters: Filters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== '' && !(key === 'page' && value === 1)) query.set(key, String(value));
  return query;
}

export default function AuditPage() {
  const { context, error, load } = useContext(),
    router = useRouter();
  const [filters, setFilters] = useState<Filters | null>(null),
    [draft, setDraft] = useState<Filters>(empty);
  const [result, setResult] = useState<History | null>(null),
    [actions, setActions] = useState<string[]>([]);
  const [failure, setFailure] = useState(''),
    [retry, setRetry] = useState(0),
    [more, setMore] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [selected, setSelected] = useState<AuditEvent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    function restore() {
      const next = fromUrl();
      setFilters(next);
      setDraft(next);
      setMore(Boolean(next.actor || next.target));
      setCollapsed(new Set());
      dialog.current?.close();
    }
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!filters || !context?.user?.global_admin) return;
    let cancelled = false;
    setFailure('');
    setResult(null);
    api<History>('/platform/audit?' + parameters(filters))
      .then((data) => {
        if (!cancelled) {
          setResult(data);
          setActions(data.actions);
        }
      })
      .catch((error) => {
        if (!cancelled) setFailure(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, context?.user?.id, context?.user?.global_admin, retry]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  function navigate(next: Filters) {
    const url = new URL(window.location.href);
    for (const key of Object.keys(empty)) url.searchParams.delete(key);
    for (const [key, value] of parameters(next)) url.searchParams.set(key, value);
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
    setFilters(next);
    setDraft(next);
    setCollapsed(new Set());
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ ...draft, page: 1 });
  }
  function update(key: keyof Omit<Filters, 'page'>, value: string) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  const groups = new Map<string, AuditEvent[]>();
  for (const event of result?.events ?? []) {
    const date = iso(event.created_at).slice(0, 10);
    groups.set(date, [...(groups.get(date) ?? []), event]);
  }
  const busy = !result && !failure;
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
        <div className={styles.page}>
          <header className={styles.header}>
            <h1>Audit log</h1>
            <p>Who changed what, and why. Dates and times are shown in UTC.</p>
          </header>
          <form className={styles.filters} onSubmit={submit} aria-label="Filter audit events">
            <div className={styles.fields}>
              <label>
                Action
                <span className={styles.select}>
                  <select
                    value={draft.action}
                    onChange={(event) => update('action', event.target.value)}
                  >
                    <option value="">All actions</option>
                    {draft.action && !actions.includes(draft.action) && (
                      <option value={draft.action}>{title(draft.action)}</option>
                    )}
                    {actions.map((action) => (
                      <option key={action} value={action}>
                        {title(action)}
                      </option>
                    ))}
                  </select>
                  <AuditIcon name="expand" />
                </span>
              </label>
              <label>
                Search
                <span className={styles.search}>
                  <AuditIcon name="search" />
                  <input
                    type="search"
                    aria-label="Search reason or target"
                    placeholder="Reason or target"
                    maxLength={120}
                    value={draft.query}
                    onChange={(event) => update('query', event.target.value)}
                  />
                </span>
              </label>
              {(['from', 'to'] as const).map((key) => (
                <label key={key}>
                  {key === 'from' ? 'From (UTC)' : 'To (UTC)'}
                  <span className={styles.date}>
                    <input
                      type="date"
                      value={draft[key]}
                      onChange={(event) => update(key, event.target.value)}
                    />
                    <AuditIcon name="calendar" />
                  </span>
                </label>
              ))}
            </div>
            <div className={styles.filterActions}>
              <div>
                <button className={styles.apply} disabled={!filters || busy} aria-busy={busy}>
                  <AuditIcon name="filter" />
                  Apply filters
                </button>
                <button
                  className={styles.clear}
                  type="button"
                  aria-label="Clear filters"
                  disabled={!filters}
                  onClick={() => {
                    navigate({ ...empty });
                    setMore(false);
                  }}
                >
                  Clear
                </button>
              </div>
              <button
                className={styles.more}
                type="button"
                aria-expanded={more}
                aria-controls="audit-more-filters"
                onClick={() => setMore((value) => !value)}
              >
                More filters
                {(draft.actor || draft.target) && (
                  <span className={styles.filterCount}>
                    {Number(Boolean(draft.actor)) + Number(Boolean(draft.target))}
                  </span>
                )}
                <AuditIcon name="more" />
              </button>
            </div>
            <div className={styles.advanced} id="audit-more-filters" hidden={!more}>
              <label>
                Exact target ID
                <input
                  value={draft.target}
                  maxLength={80}
                  onChange={(event) => update('target', event.target.value)}
                />
              </label>
              <label>
                Actor name
                <input
                  value={draft.actor}
                  maxLength={120}
                  onChange={(event) => update('actor', event.target.value)}
                />
              </label>
            </div>
          </form>
          <section className={styles.events} aria-label="Administrative audit" aria-busy={busy}>
            {failure ? (
              <div className={styles.message}>
                <Feedback error={failure} />
                <button className="secondary" onClick={() => setRetry((value) => value + 1)}>
                  Retry audit
                </button>
              </div>
            ) : busy ? (
              <p className={styles.message} role="status">
                Loading administrative events…
              </p>
            ) : (
              result && (
                <>
                  <p className="sr-only" role="status">
                    {result.total} matching events
                  </p>
                  <table className={styles.table}>
                    <caption className="sr-only">Administrative audit</caption>
                    <thead>
                      <tr>
                        {['Time (UTC)', 'Actor', 'Action', 'Target', 'Reason', 'Details'].map(
                          (label) => (
                            <th scope="col" key={label}>
                              <span className={label === 'Details' ? 'sr-only' : undefined}>
                                {label}
                              </span>
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    {Array.from(groups, ([date, events]) => (
                      <Fragment key={date}>
                        <tbody className={styles.group}>
                          <tr>
                            <th colSpan={6} scope="rowgroup">
                              <button
                                type="button"
                                aria-expanded={!collapsed.has(date)}
                                aria-controls={`audit-day-${date}`}
                                aria-label={`${date}, ${events.length} ${events.length === 1 ? 'event' : 'events'} on this page`}
                                onClick={() =>
                                  setCollapsed((previous) => {
                                    const next = new Set(previous);
                                    if (next.has(date)) next.delete(date);
                                    else next.add(date);
                                    return next;
                                  })
                                }
                              >
                                <AuditIcon name="expand" />
                                <time dateTime={date}>{date}</time>
                                <span className={styles.count} title="Events on this page">
                                  {events.length}
                                </span>
                              </button>
                            </th>
                          </tr>
                        </tbody>
                        <tbody id={`audit-day-${date}`} hidden={collapsed.has(date)}>
                          {events.map((event) => (
                            <tr key={event.id}>
                              <td data-label="Time (UTC)">
                                <span className={styles.mobileLabel}>Time (UTC)</span>
                                <time
                                  className={styles.time}
                                  dateTime={event.created_at}
                                  title={iso(event.created_at)}
                                >
                                  {iso(event.created_at).slice(11, 19)}
                                </time>
                              </td>
                              <td data-label="Actor">
                                <span className={styles.mobileLabel}>Actor</span>
                                <span>{actorName(event)}</span>
                              </td>
                              <td data-label="Action">
                                <span className={styles.mobileLabel}>Action</span>
                                <div>
                                  {title(event.action)}
                                  <small className={styles.code}>{event.action}</small>
                                </div>
                              </td>
                              <td data-label="Target">
                                <span className={styles.mobileLabel}>Target</span>
                                <span className={styles.target} title={event.target_id}>
                                  {event.target_id}
                                </span>
                              </td>
                              <td data-label="Reason">
                                <span className={styles.mobileLabel}>Reason</span>
                                <span className={styles.reason}>{event.reason}</span>
                              </td>
                              <td className={styles.detailsCell}>
                                <button
                                  className={styles.details}
                                  type="button"
                                  aria-label={`Details for ${event.action} at ${iso(event.created_at)}`}
                                  onClick={() => setSelected(event)}
                                >
                                  Details
                                  <AuditIcon name="details" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Fragment>
                    ))}
                    {!result.events.length && (
                      <tbody>
                        <tr>
                          <td colSpan={6} className={styles.message}>
                            No administrative events match these filters.
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </table>
                  {(result.total > 25 || result.page > 1) && filters && (
                    <footer className={styles.pagination}>
                      <span>
                        Showing {result.events.length ? (result.page - 1) * 25 + 1 : 0}–
                        {result.events.length ? (result.page - 1) * 25 + result.events.length : 0}{' '}
                        of {result.total}
                      </span>
                      <nav aria-label="Audit pages">
                        <button
                          disabled={result.page <= 1}
                          onClick={() => navigate({ ...filters, page: result.page - 1 })}
                        >
                          Previous page
                        </button>
                        <span>Page {result.page}</span>
                        <button
                          disabled={result.page * 25 >= result.total}
                          onClick={() => navigate({ ...filters, page: result.page + 1 })}
                        >
                          Next page
                        </button>
                      </nav>
                    </footer>
                  )}
                </>
              )
            )}
          </section>
          <Dialog
            dialogRef={dialog}
            titleId="audit-details-title"
            onClose={() => setSelected(null)}
          >
            <div className={shell.dialogHeader}>
              <h2 id="audit-details-title">Change details</h2>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  dialog.current?.close();
                  setSelected(null);
                }}
              >
                Close
              </button>
            </div>
            {selected && (
              <div className={styles.detailContent}>
                <dl className={styles.metadata}>
                  {[
                    ['Event ID', selected.id],
                    ['Time (UTC)', iso(selected.created_at).replace('T', ' ').replace('Z', ' UTC')],
                    ['Actor', actorName(selected)],
                    ['Action', selected.action],
                    ['Target', selected.target_id],
                    ['Reason', selected.reason],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {Object.entries(selected.changes ?? {}).map(([key, value]) => (
                  <section key={key} className={styles.change}>
                    <h3>{title(key)}</h3>
                    {value && typeof value === 'object' && !Array.isArray(value) ? (
                      <dl>
                        <div>
                          <dt>Before</dt>
                          <dd>
                            {JSON.stringify((value as Record<string, unknown>).before ?? null)}
                          </dd>
                        </div>
                        <div>
                          <dt>After</dt>
                          <dd>
                            {JSON.stringify((value as Record<string, unknown>).after ?? null)}
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <p>{JSON.stringify(value)}</p>
                    )}
                  </section>
                ))}
                {!Object.keys(selected.changes ?? {}).length && (
                  <p>No detailed change payload was recorded for this event.</p>
                )}
              </div>
            )}
          </Dialog>
        </div>
      )}
    </Guest>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../../components/auth-ui';
type Client = {
  id: string;
  name: string;
  active: boolean;
  suspended: boolean;
  version: number;
  members: number;
  admins: number;
};
type Directory = { clients: Client[]; total: number; all: number; page: number };
export default function ClientDirectory() {
  const { context, error, load } = useContext(),
    router = useRouter();
  const [data, setData] = useState<Directory | null>(null),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [sort, setSort] = useState('asc'),
    [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false),
    [failure, setFailure] = useState(''),
    [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<Client | 'new' | null>(null),
    [saving, setSaving] = useState(false),
    [formError, setFormError] = useState(''),
    [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    form = useRef<HTMLFormElement>(null),
    requestId = useRef(0),
    opener = useRef<HTMLElement | null>(null);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setFailure('');
    try {
      const result = await api<Directory>(
        '/platform/clients?' + new URLSearchParams({ search, status, sort, page: String(page) }),
      );
      if (id === requestId.current) setData(result);
    } catch (e) {
      if (id === requestId.current) setFailure((e as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [search, status, sort, page]);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user?.global_admin) return;
    const timer = setTimeout(() => void refresh(), 300);
    return () => clearTimeout(timer);
  }, [context, refresh]);
  useEffect(() => {
    if (selected) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
      opener.current?.focus();
    }
  }, [selected]);
  function open(client: Client | 'new') {
    opener.current = document.activeElement as HTMLElement;
    setFormError('');
    setConfirm(false);
    setSelected(client);
  }
  function close() {
    if (!saving) setSelected(null);
  }
  function clear() {
    setSearch('');
    setStatus('');
    setPage(1);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !context || saving) return;
    const values = new FormData(event.currentTarget),
      name = String(values.get('name')),
      reason = String(values.get('reason'));
    setSaving(true);
    setFormError('');
    try {
      await api('/platform/clients', {
        csrf: context.csrf,
        id: selected === 'new' ? null : selected.id,
        name,
        reason,
        version: selected === 'new' ? 0 : selected.version,
        ...(confirm && selected !== 'new' ? { suspended: !selected.suspended } : {}),
      });
      setSuccess(
        selected === 'new'
          ? 'Client created.'
          : confirm
            ? selected.suspended
              ? 'Client reactivated.'
              : 'Client suspended.'
            : 'Directory name saved.',
      );
      setSelected(null);
      await refresh();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!context?.user)
    return (
      <Guest>
        <Pending error={error} retry={load} />
      </Guest>
    );
  if (!context.user.global_admin)
    return (
      <Guest>
        <h1>Global Admin access required</h1>
        <p>Your account cannot manage the platform directory.</p>
        <Link href="/dashboard">Back to workspace</Link>
      </Guest>
    );
  return (
    <Guest>
      <p>
        <Link href="/dashboard">Back to workspace</Link>
      </p>
      <header className="page-header">
        <div>
          <p className="eyebrow">Platform</p>
          <h1>Clients</h1>
          <p>Manage organisations and access. Training content requires its own permissions.</p>
        </div>
        <button className="primary" onClick={() => open('new')}>
          Create client
        </button>
      </header>
      <Feedback error={failure} success={success} />
      {failure && (
        <button className="secondary" onClick={() => void refresh()}>
          Try loading the directory again
        </button>
      )}
      <section className="panel directory-panel" aria-busy={loading}>
        <form
          className="directory-filters"
          role="search"
          aria-label="Find clients"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <label>
            Search clients
            <input
              type="search"
              maxLength={120}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              enterKeyHint="search"
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Directory inactive</option>
            </select>
          </label>
          <button type="button" className="secondary" onClick={clear}>
            Clear filters
          </button>
        </form>
        <p className="directory-count" role="status">
          {data ? data.total + ' of ' + data.all + ' clients' : 'Loading client directory…'}
          {loading && data ? ' · Updating…' : ''}
        </p>
        <button
          className="directory-mobile-sort secondary"
          onClick={() => {
            setSort(sort === 'asc' ? 'desc' : 'asc');
            setPage(1);
          }}
        >
          Client name: {sort === 'asc' ? 'A to Z' : 'Z to A'}
        </button>
        <div className="directory-table-wrap">
          <table className="directory-table client-directory-table">
            <caption className="sr-only">Client directory</caption>
            <thead>
              <tr>
                <th scope="col" aria-sort={sort === 'asc' ? 'ascending' : 'descending'}>
                  <button
                    className="directory-sort"
                    onClick={() => {
                      setSort(sort === 'asc' ? 'desc' : 'asc');
                      setPage(1);
                    }}
                  >
                    Client name {sort === 'asc' ? '↑' : '↓'}
                  </button>
                </th>
                <th scope="col">Status</th>
                <th scope="col">Members</th>
                <th scope="col">Client admins</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div className="client-identity">
                      <span className="client-initials" aria-hidden="true">
                        {client.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <div>
                        <strong>{client.name}</strong>
                        <small title={client.id}>{client.id}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Status">
                    <span className="directory-badge">
                      {client.suspended
                        ? 'Suspended'
                        : client.active
                          ? 'Active'
                          : 'Directory inactive'}
                    </span>
                  </td>
                  <td data-label="Members">{client.members}</td>
                  <td data-label="Client admins">
                    {client.admins || (
                      <span className="directory-badge">
                        {client.suspended ? 'Access suspended' : 'None assigned'}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="directory-action"
                      aria-label={'Manage ' + client.name}
                      onClick={() => open(client)}
                    >
                      Manage client →
                    </button>
                  </td>
                </tr>
              ))}
              {data?.clients.length === 0 && (
                <tr>
                  <td className="directory-empty" colSpan={5}>
                    <strong>No clients found</strong>
                    <p>No clients yet, or none match your filters.</p>
                    <button className="secondary" onClick={clear}>
                      Clear search and status
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && data.total > 20 && (
          <nav aria-label="Directory pages">
            <button
              className="secondary"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span> Page {page} </span>
            <button
              className="secondary"
              disabled={page * 20 >= data.total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
        )}
        <p className="field-help">
          Counts show effective access. Suspended clients have zero effective members and admins;
          retained assignments are blocked.
        </p>
      </section>
      <dialog
        ref={dialog}
        className="workspace-dialog"
        aria-labelledby="client-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => {
          if (!saving) setSelected(null);
        }}
      >
        {selected && (
          <>
            <div className="directory-dialog-header">
              <h2 id="client-title">{selected === 'new' ? 'Create client' : selected.name}</h2>
              <button type="button" onClick={close} disabled={saving} autoFocus>
                Close
              </button>
            </div>
            {selected !== 'new' && (
              <>
                <p>{selected.id}</p>
                <p>
                  Effective members: {selected.members} · Effective admins: {selected.admins}
                </p>
              </>
            )}
            <form ref={form} onSubmit={save} aria-busy={saving}>
              <Feedback error={formError} />
              <label>
                Directory name
                <input
                  name="name"
                  defaultValue={selected === 'new' ? '' : selected.name}
                  required
                  maxLength={160}
                  readOnly={confirm}
                />
              </label>
              <label>
                {selected === 'new' ? 'Creation reason' : 'Client change reason'}
                <input name="reason" required minLength={8} maxLength={2000} readOnly={confirm} />
              </label>
              {!confirm ? (
                <>
                  <button className="primary" disabled={saving}>
                    {saving
                      ? 'Saving…'
                      : selected === 'new'
                        ? 'Create client'
                        : 'Save directory name'}
                  </button>
                  {selected !== 'new' && (
                    <div className="directory-danger">
                      <h3>Client access</h3>
                      <p>
                        Suspension blocks access and cancels pending work. Reactivation requires
                        fresh approval for sensitive grants.
                      </p>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          if (form.current?.reportValidity()) setConfirm(true);
                        }}
                      >
                        {selected.suspended ? 'Reactivate client' : 'Suspend client'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div
                  className="directory-danger"
                  role="group"
                  aria-label="Confirm client access change"
                >
                  <h3>
                    {selected !== 'new' && selected.suspended ? 'Reactivate' : 'Suspend'}{' '}
                    {selected !== 'new' && selected.name}?
                  </h3>
                  <p>
                    {selected !== 'new' && selected.suspended
                      ? 'Access can resume. Ended grants and stopped work will remain ended.'
                      : 'Members will be signed out and pending work stopped.'}
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConfirm(false)}
                    disabled={saving}
                    autoFocus
                  >
                    Cancel
                  </button>
                  <button className="danger" disabled={saving}>
                    {saving
                      ? 'Saving…'
                      : selected !== 'new' && selected.suspended
                        ? 'Confirm reactivation'
                        : 'Confirm suspension'}
                  </button>
                </div>
              )}
            </form>
          </>
        )}
      </dialog>
    </Guest>
  );
}

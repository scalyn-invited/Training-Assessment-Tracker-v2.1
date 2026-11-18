'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlatformAccounts } from '../../components/platform-accounts';
import { ClientsIcon } from '../../components/clients-icon';
import { DirectoryTable, Pagination } from '../../components/ui/directory';
import { Badge } from '../../components/ui/controls';
import styles from './clients.module.css';
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
  const [data, setData] = useState<Directory | null>(null);
  const [filters, setFilters] = useState({ search: '', status: '', sort: 'asc', page: 1 });
  const { search, status, sort, page } = filters;
  const [urlReady, setUrlReady] = useState(false);
  const accountAccess = useRef<HTMLDetailsElement>(null);
  const bindAccountAccess = useCallback((node: HTMLDetailsElement | null) => {
    accountAccess.current = node;
    // The authenticated shell can mount after the page context resolves.
    if (node && window.location.hash === '#client-account-access') node.open = true;
  }, []);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState('');
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === '#client-account-access' && accountAccess.current) {
        accountAccess.current.open = true;
        document.getElementById('client-account-access')?.scrollIntoView();
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    window.addEventListener('popstate', reveal);
    return () => {
      window.removeEventListener('hashchange', reveal);
      window.removeEventListener('popstate', reveal);
    };
  }, [context]);
  async function openWorkspace(client: Client) {
    if (!context || opening || !client.active || client.suspended) return;
    setOpening(client.id);
    setOpenError('');
    try {
      await api('/clients/select', { csrf: context.csrf, clientId: client.id });
      // Selection rotates CSRF; reload the shell and context for the chosen client.
      window.location.assign('/dashboard');
    } catch (e) {
      setOpenError((e as Error).message);
      setOpening(null);
    }
  }
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const restore = () => {
      if (historyTimer.current) clearTimeout(historyTimer.current);
      const params = new URLSearchParams(window.location.search),
        rawPage = Number(params.get('page') ?? 1);
      setFilters({
        search: (params.get('client_search') ?? '').slice(0, 120),
        status: ['active', 'suspended', 'inactive'].includes(params.get('status') ?? '')
          ? params.get('status')!
          : '',
        sort: params.get('sort') === 'desc' ? 'desc' : 'asc',
        page: Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 100000 ? rawPage : 1,
      });
      setUrlReady(true);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      if (historyTimer.current) clearTimeout(historyTimer.current);
    };
  }, []);
  function updateFilters(change: Partial<typeof filters>, debounce = false) {
    const next = { ...filters, ...change };
    setFilters(next);
    if (historyTimer.current) clearTimeout(historyTimer.current);
    const write = () => {
      const url = new URL(window.location.href);
      for (const [key, value] of Object.entries({
        client_search: next.search,
        status: next.status,
        sort: next.sort === 'asc' ? '' : next.sort,
        page: next.page === 1 ? '' : String(next.page),
      })) {
        if (value) url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      }
      if (url.href !== window.location.href)
        window.history.pushState(null, '', url.pathname + url.search + url.hash);
    };
    if (debounce) historyTimer.current = setTimeout(write, 300);
    else write();
  }
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
    if (!context?.user?.global_admin || !urlReady) return;
    ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => void refresh(), 300);
    return () => clearTimeout(timer);
  }, [context, refresh, urlReady]);
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
    updateFilters({ search: '', status: '', page: 1 });
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
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1>Clients</h1>
            <p>Create organisations, manage them, or open a client workspace.</p>
          </div>
          <button className={styles.create} onClick={() => open('new')}>
            <ClientsIcon name="add" /> Create client
          </button>
        </header>
        <Feedback error={failure || openError} success={success} />
        {failure && (
          <button className="secondary" onClick={() => void refresh()}>
            Try loading the directory again
          </button>
        )}
        <form
          className={styles.filters}
          role="search"
          aria-label="Find clients"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <label className={styles.search}>
            <span className="sr-only">Search clients</span>
            <ClientsIcon name="search" />
            <input
              type="search"
              placeholder="Search clients by name"
              maxLength={120}
              value={search}
              onChange={(e) => updateFilters({ search: e.target.value, page: 1 }, true)}
              enterKeyHint="search"
            />
          </label>
          <label className={styles.statusFilter}>
            <span className="sr-only">Status</span>
            <ClientsIcon name="filter" />
            <span aria-hidden="true">
              Status:{' '}
              {status === 'active'
                ? 'Active'
                : status === 'suspended'
                  ? 'Suspended'
                  : status === 'inactive'
                    ? 'Directory inactive'
                    : 'All statuses'}
            </span>
            <ClientsIcon name="chevron" />
            <select
              value={status}
              onChange={(e) => updateFilters({ status: e.target.value, page: 1 })}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Directory inactive</option>
            </select>
          </label>
          {(search || status) && (
            <button type="button" className={styles.manage} onClick={clear}>
              Clear filters
            </button>
          )}
        </form>
        <section className={styles.directory} aria-label="Clients" aria-busy={loading}>
          <button
            className={styles.mobileSort}
            onClick={() => updateFilters({ sort: sort === 'asc' ? 'desc' : 'asc', page: 1 })}
          >
            Client name: {sort === 'asc' ? 'A to Z' : 'Z to A'}
            <span className={sort === 'desc' ? styles.descending : undefined}>
              <ClientsIcon name="sort" />
            </span>
          </button>
          <DirectoryTable className={styles.table}>
            <caption className="sr-only">Client directory</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-label="Client name"
                  aria-sort={sort === 'asc' ? 'ascending' : 'descending'}
                >
                  <button
                    className={styles.sort}
                    onClick={() =>
                      updateFilters({ sort: sort === 'asc' ? 'desc' : 'asc', page: 1 })
                    }
                  >
                    Client name{' '}
                    <span className={sort === 'desc' ? styles.descending : undefined}>
                      <ClientsIcon name="sort" />
                    </span>
                  </button>
                </th>
                <th scope="col">Status</th>
                <th scope="col">Members</th>
                <th scope="col">Client admins</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.clients.map((client) => (
                <tr key={client.id}>
                  <td>
                    <div className={styles.identity}>
                      <span className={styles.initials} aria-hidden="true">
                        {client.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join('')
                          .toUpperCase()}
                      </span>
                      <strong>{client.name}</strong>
                    </div>
                  </td>
                  <td data-label="Status">
                    <Badge
                      tone={client.suspended ? 'warning' : client.active ? 'success' : undefined}
                      className={styles.badge}
                      data-state={
                        client.suspended ? 'suspended' : client.active ? 'active' : 'inactive'
                      }
                    >
                      {client.active && !client.suspended && <ClientsIcon name="active-dot" />}
                      {client.suspended
                        ? 'Suspended'
                        : client.active
                          ? 'Active'
                          : 'Directory inactive'}
                    </Badge>
                  </td>
                  <td data-label="Members">{client.members}</td>
                  <td data-label="Client admins">{client.admins}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className={styles.manage}
                        aria-label={'Manage ' + client.name}
                        onClick={() => open(client)}
                      >
                        Manage
                      </button>
                      <button
                        className={styles.open}
                        aria-label={'Open workspace for ' + client.name}
                        disabled={Boolean(opening) || !client.active || client.suspended}
                        aria-busy={opening === client.id}
                        title={
                          client.suspended
                            ? 'Workspace access is suspended'
                            : !client.active
                              ? 'This client is inactive'
                              : undefined
                        }
                        onClick={() => void openWorkspace(client)}
                      >
                        {opening === client.id ? 'Opening?' : 'Open workspace'}{' '}
                        <ClientsIcon name="workspace-arrow" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data?.clients.length === 0 && (
                <tr>
                  <td className={styles.empty} colSpan={5}>
                    <strong>No clients found</strong>
                    <p>No clients yet, or none match your filters.</p>
                    {(search || status) && (
                      <button className="secondary" onClick={clear}>
                        Clear search and status
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </DirectoryTable>
          <div className={styles.directoryFooter}>
            <p role="status">
              {data
                ? data.total + ' of ' + data.all + ' clients'
                : failure
                  ? 'Client directory unavailable.'
                  : 'Loading client directory?'}
              {loading && data ? ' ? Updating?' : ''}
            </p>
            {data && data.total > 20 && (
              <Pagination aria-label="Directory pages">
                <button
                  className={styles.manage}
                  disabled={page === 1 || loading}
                  onClick={() => updateFilters({ page: page - 1 })}
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  className={styles.manage}
                  disabled={page * 20 >= data.total || loading}
                  onClick={() => updateFilters({ page: page + 1 })}
                >
                  Next
                </button>
              </Pagination>
            )}
            <p>
              Counts show effective access. Suspended clients have zero effective members and
              admins; retained assignments are blocked.
            </p>
          </div>
        </section>
        <details ref={bindAccountAccess} className={styles.accountAccess}>
          <summary>Client account access</summary>
          <PlatformAccounts csrf={context.csrf} onChanged={() => void refresh()} />
        </details>
        <dialog
          ref={dialog}
          className={'workspace-dialog ' + styles.dialog}
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
      </div>
    </Guest>
  );
}

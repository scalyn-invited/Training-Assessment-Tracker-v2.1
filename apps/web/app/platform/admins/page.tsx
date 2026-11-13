'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, Feedback } from '../../components/auth-ui';
type Account = {
  id: string;
  name: string;
  email: string;
  global_admin: boolean;
  permission_version: number;
};
type Admin = { id: string; user_id: string; name: string; email: string; active: boolean };
type Directory = {
  admins: Admin[];
  adminTotal: number;
  activeAdmins: number;
  accounts: Account[];
  total: number;
  page: number;
  adminsPage: number;
};
type Selection = { id: string; name: string; email: string } & (
  { action: 'appoint'; permission_version: number } | { action: 'revoke' }
);
export default function AdminsPage() {
  const { context, error, load } = useContext(),
    router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Directory | null>(null),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [adminsPage, setAdminsPage] = useState(1),
    [revision, setRevision] = useState(0),
    [failure, setFailure] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [selection, setSelection] = useState<Selection | null>(null),
    [actionError, setActionError] = useState(''),
    [staleAccount, setStaleAccount] = useState(false);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user?.global_admin) return;
    let cancelled = false;
    setData(null);
    setFailure('');
    api<Directory>(
      '/platform/admins?' +
        new URLSearchParams({ search: query, page: String(page), adminsPage: String(adminsPage) }),
    )
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [context, query, page, adminsPage, revision]);
  useEffect(() => {
    if (selection) dialog.current?.showModal();
  }, [selection]);
  function open(value: Selection) {
    setStaleAccount(false);
    setActionError('');
    setSelection(value);
  }
  function close() {
    dialog.current?.close();
    setSelection(null);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selection || !context || busy || staleAccount) return;
    const reason = String(new FormData(event.currentTarget).get('reason'));
    setBusy(true);
    setActionError('');
    try {
      await api('/platform/admins/' + selection.action, {
        csrf: context.csrf,
        reason,
        ...(selection.action === 'appoint'
          ? { userId: selection.id, expectedVersion: selection.permission_version }
          : { id: selection.id }),
      });
      setSuccess(
        selection.action === 'appoint'
          ? 'Global Admin appointed. Their existing sessions have ended.'
          : 'Global Admin access revoked. Their existing sessions have ended.',
      );
      close();
      setRevision((n) => n + 1);
      load();
    } catch (e) {
      setActionError((e as Error).message);
      setStaleAccount((e as Error & { code?: string }).code === 'account_version_conflict');
    } finally {
      setBusy(false);
    }
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
          <h1>Global admins</h1>
          <p>Manage organisations and access. Training content requires its own permissions.</p>
          <p>
            <Link href="/dashboard">Workspace</Link> ·{' '}
            <Link href="/platform/clients">Manage clients</Link> ·{' '}
            <Link href="/platform/audit">View audit</Link>
          </p>
          <Feedback error={failure} success={success} />
          {failure && (
            <button onClick={() => setRevision((n) => n + 1)}>Retry administrators</button>
          )}
          {!data && !failure && <p role="status">Loading administrators and accounts…</p>}
          {data && (
            <>
              <section className="panel directory-panel">
                <h2>Current administrators</h2>
                <p>
                  {data.activeAdmins} active Global Admins. The last active Global Admin cannot be
                  removed.
                </p>
                <div className="directory-table-wrap">
                  <table className="directory-table">
                    <caption className="sr-only">Current global administrators</caption>
                    <thead>
                      <tr>
                        <th scope="col">Administrator</th>
                        <th scope="col">Status</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.admins.map((admin) => (
                        <tr key={admin.id}>
                          <td data-label="Administrator">
                            <strong>{admin.name}</strong>
                            <small>{admin.email}</small>
                          </td>
                          <td data-label="Status">{admin.active ? 'Active' : 'Inactive'}</td>
                          <td data-label="Actions">
                            <button
                              className="secondary"
                              disabled={admin.active && data.activeAdmins <= 1}
                              onClick={() => open({ ...admin, action: 'revoke' })}
                            >
                              Manage access
                            </button>
                            {admin.active && data.activeAdmins <= 1 && (
                              <p>Protected: last active Global Admin.</p>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!data.admins.length && (
                        <tr>
                          <td colSpan={3}>No administrators on this page.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="Administrator pages">
                  <button
                    className="secondary"
                    disabled={adminsPage <= 1}
                    onClick={() => setAdminsPage((n) => n - 1)}
                  >
                    Previous administrators
                  </button>
                  <span> Page {adminsPage} </span>
                  <button
                    className="secondary"
                    disabled={adminsPage * 20 >= data.adminTotal}
                    onClick={() => setAdminsPage((n) => n + 1)}
                  >
                    Next administrators
                  </button>
                </nav>
              </section>
            </>
          )}
          <section className="panel directory-panel">
            <h2>Account access</h2>
            <form
              className="directory-filters directory-search-filters"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(String(new FormData(event.currentTarget).get('search')));
                setPage(1);
                setRevision((n) => n + 1);
              }}
              onReset={() => {
                setQuery('');
                setPage(1);
                setRevision((n) => n + 1);
              }}
            >
              <label>
                Search name or email
                <input type="search" name="search" maxLength={120} />
              </label>
              <button className="primary" disabled={!data}>
                Search accounts
              </button>
              <button type="reset" className="secondary" disabled={!data}>
                Clear search
              </button>
            </form>
            {data && (
              <>
                <p role="status">{data.total} matching accounts</p>
                <div className="directory-table-wrap">
                  <table className="directory-table">
                    <caption className="sr-only">Account access</caption>
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col">Platform role</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((account) => (
                        <tr key={account.id}>
                          <td data-label="Account">
                            <strong>{account.name}</strong>
                            <small>{account.email}</small>
                          </td>
                          <td data-label="Platform role">
                            {account.global_admin ? 'Global Admin' : 'Standard account'}
                          </td>
                          <td data-label="Actions">
                            {account.global_admin ? (
                              <span>Already appointed</span>
                            ) : (
                              <button
                                className="secondary"
                                onClick={() => open({ ...account, action: 'appoint' })}
                              >
                                Appoint Global Admin
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!data.accounts.length && (
                        <tr>
                          <td colSpan={3}>No eligible accounts match this search.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="Account pages">
                  <button
                    className="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Previous accounts
                  </button>
                  <span> Page {page} </span>
                  <button
                    className="secondary"
                    disabled={page * 20 >= data.total}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next accounts
                  </button>
                </nav>
              </>
            )}
          </section>
          <dialog
            className="workspace-dialog"
            ref={dialog}
            aria-labelledby="admin-action-title"
            onCancel={(event) => {
              if (busy) event.preventDefault();
              else setSelection(null);
            }}
          >
            {selection && (
              <>
                <h2 id="admin-action-title">
                  {selection.action === 'appoint' ? 'Appoint' : 'Revoke'} Global Admin
                </h2>
                <p>
                  <strong>{selection.name}</strong>
                  <br />
                  {selection.email}
                </p>
                <p>
                  {selection.action === 'appoint'
                    ? 'This account will be able to administer all clients. Training permissions remain separate.'
                    : 'This account will lose platform administration access.'}{' '}
                  Existing sessions will end.
                </p>
                <form onSubmit={save}>
                  <label>
                    Reason
                    <input name="reason" required minLength={8} maxLength={2000} />
                  </label>
                  <Feedback error={actionError} />
                  {staleAccount && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        close();
                        setRevision((value) => value + 1);
                      }}
                    >
                      Reload accounts
                    </button>
                  )}
                  <button
                    className={selection.action === 'revoke' ? 'danger' : 'primary'}
                    disabled={busy || staleAccount}
                    aria-busy={busy}
                  >
                    {busy
                      ? 'Saving access…'
                      : selection.action === 'appoint'
                        ? 'Confirm appointment'
                        : 'Confirm revocation'}
                  </button>{' '}
                  <button type="button" className="secondary" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                </form>
              </>
            )}
          </dialog>
        </>
      )}
    </Guest>
  );
}

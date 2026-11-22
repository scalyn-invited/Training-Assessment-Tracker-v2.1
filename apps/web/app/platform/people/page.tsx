'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending } from '../../components/auth-ui';
import { Button, Input, Feedback } from '../../components/ui/controls';
import { Dialog } from '../../components/ui/dialog';
import accessStyles from '../../components/account-access.module.css';
import { AccountAccess } from '../../components/platform-accounts';
import { PeopleIcon } from '../../components/people-icon';
import shell from '../overview.module.css';
import styles from './people.module.css';

type Choice = { id: string; name: string };
type Account = {
  id: string;
  name: string;
  email: string;
  permission_version: number;
  memberships: Choice[];
  roles: { clientId: string; role: string }[];
  defaultClientId: string;
  global_admin_id: string | null;
  account_active: boolean;
};
type Directory = {
  accounts: Account[];
  clients: Choice[];
  total: number;
  page: number;
  accountTotal: number;
  adminTotal: number;
  activeAdmins: number;
  allowJoin: boolean;
};
type Filter = { view: 'all' | 'admins'; search: string; page: number };
function fromUrl(): Filter {
  const params = new URLSearchParams(window.location.search),
    page = Number(params.get('page') ?? 1);
  return {
    view: params.get('view') === 'admins' ? 'admins' : 'all',
    search: (params.get('search') ?? '').slice(0, 120),
    page: Number.isInteger(page) && page >= 1 && page <= 100000 ? page : 1,
  };
}
function roleName(role: string) {
  return role === 'admin' ? 'Client Admin' : role.charAt(0).toUpperCase() + role.slice(1);
}

export default function PeoplePage() {
  const { context, error: contextError, load } = useContext(),
    router = useRouter();
  const [filter, setFilter] = useState<Filter | null>(null),
    [search, setSearch] = useState('');
  const [data, setData] = useState<Directory | null>(null),
    [error, setError] = useState('');
  const [revision, setRevision] = useState(0),
    [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<Account | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    function restore() {
      const next = fromUrl();
      setFilter(next);
      setSearch(next.search);
    }
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!filter || !context?.user?.global_admin) return;
    let cancelled = false;
    setData(null);
    setError('');
    api<Directory>(
      '/platform/client-accounts?' + new URLSearchParams({ ...filter, page: String(filter.page) }),
    )
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure.message);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, context?.user?.id, context?.user?.global_admin, revision]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  function navigate(next: Filter) {
    setSuccess('');
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next)) {
      if ((key === 'view' && value === 'all') || (key === 'page' && value === 1) || value === '')
        url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    window.history.pushState(null, '', url.pathname + url.search + url.hash);
    setFilter(next);
    setSearch(next.search);
  }
  function close() {
    dialog.current?.close();
    setSelected(null);
  }
  function reload() {
    close();
    setRevision((value) => value + 1);
  }
  function saved() {
    setSuccess(`Access updated for ${selected?.name}. Affected sessions have ended.`);
    reload();
    load();
  }
  const pages = Math.ceil((data?.total ?? 0) / 20);
  const pageNumbers = filter
    ? Array.from(new Set([1, ...Array.from({ length: 5 }, (_, i) => filter.page - 2 + i), pages]))
        .filter((value) => value >= 1 && value <= pages)
        .sort((a, b) => a - b)
    : [];
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={contextError} retry={load} />
      ) : !context.user.global_admin ? (
        <>
          <h1>Global Admin access required</h1>
          <Link href="/dashboard">Return to workspace</Link>
        </>
      ) : (
        <div className={styles.page}>
          <header className={styles.header}>
            <div>
              <h1>People &amp; access</h1>
              <p>
                Everyone with an account, across all clients. Global Admins are listed under their
                own tab.
              </p>
            </div>
            <Link className={styles.add} href="/accounts">
              <PeopleIcon name="add-account" />
              Add account
            </Link>
          </header>
          <nav className={styles.tabs} aria-label="Account directories">
            <button
              type="button"
              aria-current={filter?.view === 'all' ? 'page' : undefined}
              onClick={() => navigate({ view: 'all', search: '', page: 1 })}
            >
              All accounts {data && <span>{data.accountTotal}</span>}
            </button>
            <button
              type="button"
              aria-current={filter?.view === 'admins' ? 'page' : undefined}
              onClick={() => navigate({ view: 'admins', search: '', page: 1 })}
            >
              Global admins {data && <span>{data.adminTotal}</span>}
            </button>
          </nav>
          <Feedback success={success} />
          <section
            className={styles.directory}
            aria-label={
              filter?.view === 'admins' ? 'Global admins directory' : 'All accounts directory'
            }
            aria-busy={!data && !error}
          >
            <form
              className={styles.filters}
              role="search"
              aria-label="Find people"
              onSubmit={(event) => {
                event.preventDefault();
                if (filter) navigate({ ...filter, search, page: 1 });
              }}
            >
              <label className={styles.search}>
                <span className="sr-only">Search name or email</span>
                <PeopleIcon name="search" />
                <input
                  type="search"
                  placeholder="Search name or email"
                  maxLength={120}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <button className={styles.searchButton} disabled={!filter}>
                Search
              </button>
              <button
                type="button"
                className={styles.clear}
                disabled={!filter}
                onClick={() => filter && navigate({ ...filter, search: '', page: 1 })}
              >
                Clear filters
              </button>
            </form>
            {error ? (
              <div className={styles.message}>
                <Feedback error={error} />
                <button className="secondary" onClick={() => setRevision((value) => value + 1)}>
                  Retry accounts
                </button>
              </div>
            ) : !data ? (
              <p className={styles.message} role="status">
                Loading accounts…
              </p>
            ) : (
              <>
                <table className={styles.table}>
                  <caption className="sr-only">
                    {filter?.view === 'admins' ? 'Global admins' : 'All accounts'}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Account</th>
                      <th scope="col">Client memberships</th>
                      <th scope="col">Platform role</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((account) => {
                      const roles =
                        account.memberships.length === 1
                          ? account.roles.filter(
                              (role) => role.clientId === account.memberships[0].id,
                            )
                          : [];
                      return (
                        <tr key={account.id}>
                          <td>
                            <div className={styles.identity}>
                              <span className={styles.avatar} aria-hidden="true">
                                {account.name
                                  .trim()
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .map((word) => word[0])
                                  .join('')
                                  .toUpperCase()}
                              </span>
                              <div className={styles.identityCopy}>
                                <div className={styles.name}>
                                  <strong>{account.name}</strong>
                                  {roles.map((role) => (
                                    <span className={styles.badge} key={role.role}>
                                      {roleName(role.role)}
                                    </span>
                                  ))}
                                  {account.memberships.length === 1 && !roles.length && (
                                    <span className={styles.badge}>Member</span>
                                  )}
                                </div>
                                <small>{account.email}</small>
                              </div>
                            </div>
                          </td>
                          <td data-label="Client memberships">
                            <span className={styles.mobileLabel}>Client memberships</span>
                            <div>
                              {account.memberships.length
                                ? account.memberships.map((client) => (
                                    <div key={client.id}>
                                      {client.name}
                                      {account.memberships.length > 1 && (
                                        <small className={styles.clientRoles}>
                                          {account.roles
                                            .filter((role) => role.clientId === client.id)
                                            .map((role) => roleName(role.role))
                                            .join(', ') || 'Member'}
                                        </small>
                                      )}
                                    </div>
                                  ))
                                : 'No active membership'}
                            </div>
                          </td>
                          <td data-label="Platform role">
                            <span className={styles.mobileLabel}>Platform role</span>
                            <span
                              className={account.global_admin_id ? styles.adminBadge : undefined}
                            >
                              {account.global_admin_id
                                ? account.account_active
                                  ? 'Global Admin'
                                  : 'Inactive Global Admin'
                                : 'Standard account'}
                            </span>
                          </td>
                          <td className={styles.action}>
                            <button
                              className={styles.manage}
                              aria-label={`Manage access for ${account.name}`}
                              onClick={() => {
                                setSuccess('');
                                setSelected(account);
                              }}
                            >
                              Manage access
                              <PeopleIcon name="arrow" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!data.accounts.length && (
                  <p className={styles.message}>
                    No accounts match this search. Clear filters or try another name or email.
                  </p>
                )}
                {filter?.view === 'admins' && (
                  <p className={styles.protection}>
                    <PeopleIcon name="lock" />
                    The last active Global Admin cannot be removed.
                  </p>
                )}
                {(filter?.view === 'all' || pages > 1 || (filter?.page ?? 1) > 1) && filter && (
                  <footer className={styles.pagination}>
                    <span role="status">
                      Showing {data.accounts.length ? (filter.page - 1) * 20 + 1 : 0}–
                      {data.accounts.length ? (filter.page - 1) * 20 + data.accounts.length : 0} of{' '}
                      {data.total}
                    </span>
                    <nav aria-label="Account pages">
                      <button
                        disabled={filter.page <= 1}
                        onClick={() => navigate({ ...filter, page: filter.page - 1 })}
                      >
                        Previous
                      </button>
                      {pageNumbers.map((number, index) => (
                        <span key={number}>
                          {index > 0 && number > pageNumbers[index - 1] + 1 && (
                            <span className={styles.ellipsis}>…</span>
                          )}
                          <button
                            aria-label={`Page ${number}`}
                            aria-current={filter.page === number ? 'page' : undefined}
                            onClick={() => navigate({ ...filter, page: number })}
                          >
                            {number}
                          </button>
                        </span>
                      ))}
                      <button
                        disabled={filter.page >= pages}
                        onClick={() => navigate({ ...filter, page: filter.page + 1 })}
                      >
                        Next
                      </button>
                    </nav>
                  </footer>
                )}
              </>
            )}
          </section>
          <Dialog
            dialogRef={dialog}
            className={styles.accessDialog}
            titleId="people-access-title"
            onClose={() => setSelected(null)}
          >
            {selected && data && (
              <>
                <div className={shell.dialogHeader}>
                  <h2 id="people-access-title">Manage access</h2>
                  <Button onClick={close}>Close</Button>
                </div>
                <p>
                  {selected.name} · {selected.email}
                </p>
                <section>
                  <h3>Client access</h3>
                  <p>Client Admin access does not grant training review permissions.</p>
                  {selected.account_active ? (
                    <AccountAccess
                      key={selected.id + ':' + selected.permission_version}
                      account={selected}
                      clients={data.clients}
                      allowJoin={data.allowJoin}
                      csrf={context.csrf}
                      reload={reload}
                      onSaved={saved}
                      expanded
                    />
                  ) : (
                    <p>
                      This account is inactive or requires a permissions refresh. Client access
                      cannot be changed.
                    </p>
                  )}
                </section>
                <GlobalAccess
                  key={
                    selected.id + ':' + selected.permission_version + ':' + selected.global_admin_id
                  }
                  account={selected}
                  csrf={context.csrf}
                  activeAdmins={data.activeAdmins}
                  reload={reload}
                  saved={saved}
                />
              </>
            )}
          </Dialog>
        </div>
      )}
    </Guest>
  );
}

function GlobalAccess({
  account,
  csrf,
  activeAdmins,
  reload,
  saved,
}: {
  account: Account;
  csrf: string;
  activeAdmins: number;
  reload: () => void;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false);
  const revoke = Boolean(account.global_admin_id),
    protectedAdmin = revoke && account.account_active && activeAdmins <= 1;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || stale || protectedAdmin) return;
    const reason = String(new FormData(event.currentTarget).get('reason'));
    setBusy(true);
    setError('');
    try {
      await api('/platform/admins/' + (revoke ? 'revoke' : 'appoint'), {
        csrf,
        reason,
        ...(revoke
          ? { id: account.global_admin_id }
          : { userId: account.id, expectedVersion: account.permission_version }),
      });
      saved();
    } catch (failure) {
      setError((failure as Error).message);
      setStale(
        ['account_version_conflict', 'last_administrator', 'grant_unavailable'].includes(
          (failure as Error & { code?: string }).code ?? '',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h3>Global Admin access</h3>
      <p>Platform administration does not grant access to training content.</p>
      {protectedAdmin ? (
        <p className={styles.protection}>
          <PeopleIcon name="lock" />
          Protected: the last active Global Admin cannot be removed.
        </p>
      ) : !revoke && !account.account_active ? (
        <p>This account is not eligible for appointment.</p>
      ) : (
        <form
          className={accessStyles.form}
          aria-label={`Manage Global Admin access for ${account.email}`}
          onSubmit={save}
          aria-busy={busy}
        >
          <fieldset disabled={busy || stale}>
            <legend>{revoke ? 'Revoke Global Admin' : 'Appoint Global Admin'}</legend>
            <label>
              Reason
              <Input name="reason" required minLength={8} maxLength={2000} />
            </label>
            <label className={accessStyles.confirmation}>
              <Input type="checkbox" required />I confirm {revoke ? 'revoking' : 'appointing'}{' '}
              Global Admin access for {account.name}.
            </label>
            <p>Their existing sessions will end.</p>
            <Button type="submit" variant={revoke ? 'danger' : 'primary'}>
              {busy ? 'Saving access…' : revoke ? 'Confirm revocation' : 'Confirm appointment'}
            </Button>
          </fieldset>
          <Feedback error={error} />
          {stale && <Button onClick={reload}>Reload accounts</Button>}
        </form>
      )}
    </section>
  );
}

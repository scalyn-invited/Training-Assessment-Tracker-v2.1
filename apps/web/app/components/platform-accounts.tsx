'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from './auth-ui';
import { Button, Input, Select, Panel, Feedback } from './ui/controls';
import { Pagination } from './ui/directory';
import styles from './account-access.module.css';
type Choice = { id: string; name: string };
type Account = {
  id: string;
  name: string;
  email: string;
  permission_version: number;
  memberships: Choice[];
  roles: { clientId: string; role: string }[];
  defaultClientId: string;
};
type Directory = {
  accounts: Account[];
  clients: Choice[];
  total: number;
  page: number;
  allowJoin: boolean;
};
export function PlatformAccounts({ csrf, onChanged }: { csrf: string; onChanged: () => void }) {
  const [data, setData] = useState<Directory | null>(null),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api<Directory>(
      '/platform/client-accounts?' + new URLSearchParams({ search: query, page: String(page) }),
    )
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page, revision]);
  const reload = () => setRevision((n) => n + 1);
  return (
    <Panel
      id="client-account-access"
      className={styles.directory}
      aria-label="Client account access"
      aria-busy={loading}
    >
      <h2>Client account access</h2>
      <p>
        Choose an account and client before changing access. Client Admin access does not grant
        training review permissions.
      </p>
      <form
        className={styles.form}
        role="search"
        aria-label="Find client accounts"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(String(new FormData(e.currentTarget).get('search')));
          setPage(1);
          reload();
        }}
      >
        <label>
          Search accounts
          <Input type="search" name="search" maxLength={120} />
        </label>
        <Button type="submit" disabled={loading}>
          Search accounts
        </Button>
      </form>
      <Feedback error={error} success={success} />
      {error && <Button onClick={reload}>Reload accounts</Button>}
      {loading && <p role="status">Loading accounts...</p>}
      {data && !loading && (
        <>
          <p>{data.total} matching accounts</p>
          {!data.accounts.length && (
            <p>No accounts match this search. Change the search to try again.</p>
          )}
          {data.accounts.map((account) => (
            <AccountAccess
              key={account.id + ':' + account.permission_version + ':' + revision}
              account={account}
              clients={data.clients}
              allowJoin={data.allowJoin}
              csrf={csrf}
              reload={reload}
              onSaved={() => {
                setSuccess(`Access updated for ${account.name}. Affected sessions have ended.`);
                reload();
                onChanged();
              }}
            />
          ))}
          <Pagination aria-label="Client account pages">
            <Button disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
              Previous accounts
            </Button>
            <span>Page {page}</span>
            <Button disabled={page * 20 >= data.total} onClick={() => setPage((n) => n + 1)}>
              Next accounts
            </Button>
          </Pagination>
        </>
      )}
    </Panel>
  );
}
export function AccountAccess({
  account,
  clients,
  allowJoin,
  csrf,
  reload,
  onSaved,
  expanded = false,
}: {
  account: Account;
  clients: Choice[];
  allowJoin: boolean;
  csrf: string;
  reload: () => void;
  onSaved: () => void;
  expanded?: boolean;
}) {
  const [client, setClient] = useState(account.defaultClientId),
    [action, setAction] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || stale || !confirmed) return;
    const reason = String(new FormData(e.currentTarget).get('reason'));
    setBusy(true);
    setError('');
    try {
      await api('/platform/client-accounts', {
        csrf,
        clientId: client,
        userId: account.id,
        action,
        expectedVersion: account.permission_version,
        reason,
      });
      onSaved();
    } catch (failure) {
      const e = failure as Error & { code?: string };
      setError(e.message);
      setStale(e.code === 'account_version_conflict');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={styles.account} open={expanded || undefined}>
      <summary>
        {account.name} - {account.email}
      </summary>
      <p>
        Current clients:{' '}
        {account.memberships.map((m) => m.name).join(', ') || 'No active client membership'}
      </p>
      <p>
        Client roles:{' '}
        {account.roles
          .map(
            (r) =>
              `${clients.find((c) => c.id === r.clientId)?.name ?? 'Unavailable client'}: ${r.role}`,
          )
          .join('; ') || 'None'}
      </p>
      <form
        className={styles.form}
        aria-label={'Manage client access for ' + account.email}
        onSubmit={save}
        aria-busy={busy}
      >
        <fieldset disabled={busy || stale}>
          <label>
            Client
            <Select
              required
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Choose a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Action
            <Select
              required
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Choose an action</option>
              {allowJoin && <option value="join">Join client</option>}
              <option value="grant">Grant Client Admin</option>
              <option value="revoke">Revoke Client Admin</option>
            </Select>
          </label>
          {!allowJoin && (
            <p>Joining another client requires an invitation accepted by the account owner.</p>
          )}
          <label>
            Reason
            <Input name="reason" required minLength={8} maxLength={2000} />
          </label>
          <label className={styles.confirmation}>
            <Input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            I confirm this access change for {account.name} in{' '}
            {clients.find((c) => c.id === client)?.name ?? 'the selected client'}.
          </label>
          <p>Affected sessions will end. Review the account, client and action before applying.</p>
          <Button type="submit" disabled={busy || stale}>
            {busy ? 'Updating access...' : 'Apply access change'}
          </Button>
        </fieldset>
        <Feedback error={error} />
        {stale && <Button onClick={reload}>Reload accounts</Button>}
      </form>
    </details>
  );
}

'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Input,
  Select,
  Panel,
  PageHeader,
  Feedback,
  Badge,
} from '../components/ui/controls';
import { DirectoryTable, Pagination } from '../components/ui/directory';
import { PasswordField } from '../components/ui/password';
import styles from '../components/ui/form-layout.module.css';
import { api, useContext, Guest, Pending, values } from '../components/auth-ui';
type Client = { id: string; name: string };
type Issued = {
  id: string;
  purpose: string;
  organisation_id: string | null;
  name: string;
  email: string;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};
type Data = {
  accountMailAvailable: boolean;
  clients: Client[];
  targets: { id: string; name: string; email: string; passwordEnabled: boolean }[];
  links: Issued[];
  total: number;
  page: number;
  clientId: string | null;
  global: boolean;
};
type Result = { path: string; purpose: string; expiresAt: string; delivery?: string | null };
export default function AccountsPage() {
  const { context, error: contextError, load: loadContext } = useContext(),
    router = useRouter();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [mode, setMode] = useState('new'),
    [review, setReview] = useState<Record<string, string> | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [message, setMessage] = useState(''),
    [page, setPage] = useState(1),
    [search, setSearch] = useState('');
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    try {
      const response = await api<Data>(
        '/accounts/manage?' + new URLSearchParams({ page: String(page), search }),
      );
      if (id === request.current) setData(response);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [page, search]);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
    else if (context?.user) void refresh();
  }, [context, router, refresh]);
  async function create(event: FormEvent<HTMLFormElement>) {
    const fields = values(event);
    if (!context || busy) return;
    if (!review) {
      setReview(fields);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await api<Result>('/accounts/create', {
        csrf: context.csrf,
        clientId: fields.clientId,
        name: fields.name ?? '',
        email: fields.email,
        password: fields.createPassword,
        reason: fields.reason,
        mode,
        synthetic: fields.synthetic === 'on',
        sendEmail: fields.sendEmail === 'on',
      });
      setResult(response);
      setReview(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function recover(event: FormEvent<HTMLFormElement>) {
    const fields = values(event);
    if (!context || busy) return;
    setBusy(true);
    setError('');
    try {
      setResult(
        await api<Result>('/accounts/recover', {
          csrf: context.csrf,
          userId: fields.userId,
          clientId: fields.clientId || data?.clientId || null,
          purpose: fields.purpose,
          sendEmail: fields.sendEmail === 'on',
          password: fields.recoveryPassword,
          reason: fields.reason,
        }),
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(event: FormEvent<HTMLFormElement>, link: Issued) {
    const fields = values(event);
    if (!context || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/accounts/cancel', {
        csrf: context.csrf,
        id: link.id,
        clientId: link.organisation_id,
        password: fields['password-' + link.id],
        reason: fields.reason,
      });
      setMessage('Link cancelled.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!context?.user)
    return (
      <Guest>
        <Pending error={contextError} retry={loadContext} />
      </Guest>
    );
  return (
    <Guest>
      <div className={styles.page}>
        <p>
          <Link href="/dashboard">Back to workspace</Link>
        </p>
        <PageHeader title="Accounts" />
        <Feedback error={error} success={message} />
        {error && (
          <p>
            <Button
              variant="secondary"
              onClick={() => {
                setError('');
                void refresh();
              }}
            >
              Try loading accounts again
            </Button>{' '}
            <Link href="/clients">Choose your client</Link>
          </p>
        )}
        {!data && !error && <p role="status">Loading account administration…</p>}
        {data &&
          (!result ? (
            <>
              <Panel className={styles.panel}>
                <h2>Create an account or invite an existing member</h2>
                <p>
                  Access starts after password setup or invitation acceptance. Initial access is
                  Member only.
                </p>
                {!data.clients.length ? (
                  <>
                    <p>Create your first client to start adding accounts.</p>
                    <Link href="/platform/clients">Manage clients</Link>
                  </>
                ) : (
                  <form onSubmit={create} aria-busy={busy}>
                    <fieldset hidden={Boolean(review)} disabled={busy}>
                      <legend>Account details</legend>
                      <label>
                        Client
                        <Select name="clientId" required defaultValue={data.clientId ?? ''}>
                          <option value="">Choose client…</option>
                          {data.clients.map((c) => (
                            <option value={c.id} key={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        Account operation
                        <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                          <option value="new">New account</option>
                          <option value="existing">Existing account invitation</option>
                        </Select>
                      </label>
                      {mode === 'new' && (
                        <label>
                          Name
                          <Input name="name" required maxLength={120} autoComplete="off" />
                        </label>
                      )}
                      <label>
                        Email
                        <Input
                          type="email"
                          name="email"
                          required
                          maxLength={200}
                          autoComplete="off"
                        />
                      </label>
                      {mode === 'new' && (
                        <>
                          <label>
                            <Input type="checkbox" name="synthetic" defaultChecked /> Test account
                          </label>
                          <p className="field-help">
                            Uncheck for a non-test local account. Existing accounts keep their
                            classification.
                          </p>
                        </>
                      )}
                      {!data.accountMailAvailable && (
                        <p>
                          Email is not configured. A private link will be shown for manual sharing.
                        </p>
                      )}
                      <PasswordField name="createPassword" label="Your current password" />
                      <label>
                        Reason
                        <Input name="reason" required minLength={8} maxLength={2000} />
                      </label>
                    </fieldset>
                    {review && (
                      <div role="group" aria-label="Review account action">
                        <h3>Review {mode === 'new' ? 'account setup' : 'invitation'}</h3>
                        <p>
                          {review.name} · {review.email}
                        </p>
                        <p>Client: {data.clients.find((c) => c.id === review.clientId)?.name}</p>
                        <p>Reason: {review.reason}</p>
                        <p>The recipient must accept access. This action creates a private link.</p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setReview(null)}
                          disabled={busy}
                        >
                          Back to details
                        </Button>
                      </div>
                    )}
                    {data.accountMailAvailable && (
                      <details>
                        <summary>Optional email delivery</summary>
                        <label>
                          <Input type="checkbox" name="sendEmail" disabled={busy} /> Email this link
                          to the approved recipient (optional)
                        </label>
                      </details>
                    )}
                    <Button type="submit" variant="primary" disabled={busy}>
                      {busy
                        ? 'Creating private link…'
                        : review
                          ? 'Create private link'
                          : 'Review and continue'}
                    </Button>
                  </form>
                )}
              </Panel>
              <details className={styles.panel}>
                <summary>Manage setup and recovery links</summary>
                <p>
                  Recovery changes the shared login across every client and ends all recipient
                  sessions when completed. Client Admins cannot recover themselves or Global Admins.
                </p>
                <label>
                  Find an account
                  <Input
                    type="search"
                    maxLength={120}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    enterKeyHint="search"
                  />
                </label>
                {loading && <p role="status">Updating accounts…</p>}
                <form onSubmit={recover} aria-busy={busy}>
                  <label>
                    Action
                    <Select name="purpose" required>
                      <option value="">Choose action…</option>
                      <option value="reset">Issue recovery link</option>
                      <option value="setup">Reissue initial setup</option>
                    </Select>
                  </label>
                  <label>
                    Account
                    <Select name="userId" required>
                      <option value="">Choose account…</option>
                      {data.targets.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name} — {t.email}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <p className="field-help">
                    Up to 100 matching accounts are shown. Refine the search if needed.
                  </p>
                  {data.global && (
                    <label>
                      Client (required for initial setup)
                      <Select name="clientId">
                        <option value="">Account-wide recovery</option>
                        {data.clients.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  <PasswordField
                    name="recoveryPassword"
                    label="Your current password for recovery"
                  />
                  <label>
                    Recovery reason
                    <Input name="reason" required minLength={8} maxLength={2000} />
                  </label>
                  <label>
                    <Input type="checkbox" required /> I have checked the recipient and recovery
                    action.
                  </label>
                  {data.accountMailAvailable && (
                    <details>
                      <summary>Optional email delivery</summary>
                      <label>
                        <Input type="checkbox" name="sendEmail" disabled={busy} /> Email this link
                        to the approved recipient (optional)
                      </label>
                    </details>
                  )}
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {busy ? 'Issuing…' : 'Issue private link'}
                  </Button>
                </form>
              </details>
              <Panel className={styles.panel} aria-busy={loading}>
                <h2>Issued links</h2>
                <p className="directory-count">{data.total} issued links</p>
                <div className={styles.tableWrap}>
                  <DirectoryTable stacked className={styles.table}>
                    <caption className="sr-only">Issued account links</caption>
                    <thead>
                      <tr>
                        <th scope="col">Account</th>
                        <th scope="col">Purpose</th>
                        <th scope="col">Status</th>
                        <th scope="col">Expires (UTC)</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.links.map((link) => (
                        <tr key={link.id}>
                          <td>
                            <strong>{link.name}</strong>
                            <small>{link.email}</small>
                          </td>
                          <td data-label="Purpose">{link.purpose}</td>
                          <td data-label="Status">
                            <Badge>
                              {link.consumed_at
                                ? 'Used'
                                : link.revoked_at
                                  ? 'Cancelled'
                                  : Date.parse(link.expires_at) <= Date.now()
                                    ? 'Expired'
                                    : 'Pending'}
                            </Badge>
                          </td>
                          <td data-label="Expires (UTC)">
                            {new Date(link.expires_at).toUTCString()}
                          </td>
                          <td>
                            {!link.consumed_at && !link.revoked_at ? (
                              <details>
                                <summary>Manage link</summary>
                                <form onSubmit={(e) => void cancel(e, link)}>
                                  <PasswordField
                                    name={'password-' + link.id}
                                    label={'Your current password to cancel ' + link.name}
                                  />
                                  <label>
                                    Cancellation reason
                                    <Input name="reason" required minLength={8} maxLength={2000} />
                                  </label>
                                  <label>
                                    <Input type="checkbox" required /> Cancel this private link.
                                  </label>
                                  <Button type="submit" variant="danger" disabled={busy}>
                                    Cancel link
                                  </Button>
                                </form>
                              </details>
                            ) : (
                              <span>No action available</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!data.links.length && (
                        <tr>
                          <td colSpan={5}>
                            No links have been issued. Create an account or invitation above to
                            begin.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </DirectoryTable>
                </div>
                {data.total > 20 && (
                  <Pagination aria-label="Issued link pages">
                    <Button
                      variant="secondary"
                      disabled={page === 1 || loading}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span> Page {page} </span>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={page * 20 >= data.total || loading}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </Pagination>
                )}
              </Panel>
            </>
          ) : (
            <Panel className={styles.panel}>
              <h2>Private account link</h2>
              {result.delivery && <p role="status">{result.delivery}</p>}
              <p>
                This {result.purpose} link is shown once. Share it privately with the intended
                person.
              </p>
              <p>Expires: {new Date(result.expiresAt).toUTCString()}</p>
              <label>
                Private link
                <Input
                  readOnly
                  value={typeof window === 'undefined' ? '' : window.location.origin + result.path}
                  aria-describedby="link-warning"
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <p id="link-warning">
                Do not put this link in a ticket, public message, or screenshot. Reissuing cancels
                the previous link.
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  setResult(null);
                  setMessage('Private link hidden.');
                }}
              >
                Done with private link
              </Button>
            </Panel>
          ))}
      </div>
    </Guest>
  );
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, useContext, Guest, values } from '../../components/auth-ui';
import { Button, Panel, Feedback } from '../../components/ui/controls';
import { PasswordField as Password } from '../../components/ui/password';
import { GuestPending as Pending } from '../../components/guest-shell';
import styles from '../../components/ui/guest.module.css';
import { useWorkGuard } from '../../components/use-work-guard';
type Credential = { raw: string; purpose: 'setup' | 'reset' | 'invite' };
type Details = {
  purpose: string;
  recipient: { name: string; email: string };
  client: string | null;
  expiresAt: string;
};
export default function AccountLink() {
  const { context, error: contextError, load } = useContext();
  const [credential, setCredential] = useState<Credential | null>(null),
    [details, setDetails] = useState<Details | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState(false);
  const [dirty, setDirty] = useState(false);
  useWorkGuard({ dirty: !complete && dirty, pending: busy });
  useEffect(() => {
    const readLink = () => {
      setComplete(false);
      setDirty(false);
      setDetails(null);
      setError('');
      const q = new URLSearchParams(window.location.hash.slice(1)),
        raw = q.get('token') ?? '',
        purpose = q.get('purpose');
      if (
        /^[a-f0-9]{64}$/.test(raw) &&
        (purpose === 'setup' || purpose === 'reset' || purpose === 'invite')
      )
        setCredential({ raw, purpose });
      else {
        setCredential(null);
        setError('This link is incomplete. Ask your administrator for a new private link.');
      }
    };
    readLink();
    const changed = () => {
      readLink();
      load();
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    if (!context || !credential || complete) return;
    let cancelled = false;
    // A retry for the same private link must not discard entered passwords/acceptance.
    // readLink clears the old recipient and form when the fragment actually changes.
    setError('');
    api<Details>('/accounts/inspect', { csrf: context.csrf, ...credential })
      .then((result) => {
        if (!cancelled) setDetails(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [context, credential, complete]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = values(event);
    if (!context || !credential || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/accounts/redeem', {
        csrf: context.csrf,
        ...credential,
        password: data.password,
        confirmation: data.confirmation,
        accept: data.accept === 'on',
      });
      setComplete(true);
      setDirty(false);
      setDetails(null);
      setCredential(null);
      window.history.replaceState(null, '', '/account/link');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Guest>
      <Panel className={`${styles.card} ${styles.stack}`}>
        <header className={styles.heading}>
          <span className={styles.headerIcon} aria-hidden="true">
            <img
              src={
                credential?.purpose === 'invite' || complete
                  ? '/auth/accepted.svg'
                  : '/auth/key.svg'
              }
              alt=""
              width={26}
              height={26}
            />
          </span>
          <h1>
            {complete
              ? 'Account action completed'
              : credential?.purpose === 'invite'
                ? 'Client invitation'
                : credential?.purpose === 'reset'
                  ? 'Reset your password'
                  : 'Set your password'}
          </h1>
        </header>
        {context && contextError && (
          <>
            <Feedback error={contextError} />
            <Button onClick={load} disabled={busy}>
              Retry session
            </Button>
          </>
        )}
        {!context ? (
          <Pending error={contextError} retry={load} />
        ) : complete ? (
          <>
            <p role="status">Your access has been updated. Sign in again to continue.</p>
            <Link href="/login">Continue to sign in</Link>
          </>
        ) : (
          <>
            <Feedback error={error} />
            {error && (
              <>
                {credential?.purpose === 'invite' ? (
                  <>
                    <p>Invitation acceptance requires the intended recipient to be signed in.</p>
                    <p>
                      <Link href="/login" target="_blank" rel="noopener">
                        Open sign in in another tab
                      </Link>
                    </p>
                  </>
                ) : (
                  <p>
                    If this link has expired or been replaced, ask the person who issued it for a
                    new private link.
                  </p>
                )}
                <Button onClick={load} disabled={busy}>
                  Check this link again
                </Button>
              </>
            )}
            {!details && !error && <p role="status">Checking your private link…</p>}
            {details && (
              <>
                <dl className={styles.details}>
                  <div>
                    <dt>Account</dt>
                    <dd>
                      {details.recipient.name}
                      <br />
                      {details.recipient.email}
                    </dd>
                  </div>
                  {details.client && (
                    <div>
                      <dt>Client</dt>
                      <dd>{details.client}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Expires</dt>
                    <dd>{new Date(details.expiresAt).toUTCString()}</dd>
                  </div>
                </dl>
                <form
                  onSubmit={submit}
                  aria-busy={busy}
                  className={styles.form}
                  onInput={(event) => {
                    const data = new FormData(event.currentTarget);
                    setDirty(
                      !!(data.get('password') || data.get('confirmation') || data.get('accept')),
                    );
                  }}
                >
                  {credential?.purpose === 'invite' ? (
                    <>
                      <div className={styles.callout}>
                        <img src="/auth/info.svg" alt="" width={18} height={18} />
                        <p>
                          Accepting adds Member access to this client. Your existing accounts and
                          permissions remain separate.
                        </p>
                      </div>
                      <label className={styles.checkbox}>
                        <input type="checkbox" name="accept" required /> I accept this client
                        invitation.
                      </label>
                    </>
                  ) : (
                    <>
                      <Password
                        name="password"
                        label="New password"
                        creation
                        className={styles.password}
                      />
                      <Password
                        name="confirmation"
                        label="Confirm new password"
                        creation
                        className={styles.password}
                      />
                    </>
                  )}
                  <div className={styles.actions}>
                    <Button type="submit" variant="primary" disabled={busy}>
                      {busy
                        ? 'Saving…'
                        : credential?.purpose === 'invite'
                          ? 'Accept invitation'
                          : 'Save password'}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </Panel>
    </Guest>
  );
}

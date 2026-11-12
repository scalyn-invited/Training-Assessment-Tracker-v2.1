'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  api,
  useContext,
  Guest,
  Pending,
  Password,
  Feedback,
  values,
} from '../../components/auth-ui';
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
  useEffect(() => {
    const readLink = () => {
      setComplete(false);
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
    setDetails(null);
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
      <section className="panel">
        <h1>
          {complete
            ? 'Account action completed'
            : credential?.purpose === 'invite'
              ? 'Client invitation'
              : credential?.purpose === 'reset'
                ? 'Reset your password'
                : 'Set your password'}
        </h1>
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
                <p>Invitation acceptance requires the intended recipient to be signed in.</p>
                <p>
                  <Link href="/login" target="_blank" rel="noopener">
                    Open sign in in another tab
                  </Link>
                </p>
                <button className="secondary" onClick={load}>
                  Check this link again
                </button>
              </>
            )}
            {!details && !error && <p role="status">Checking your private link…</p>}
            {details && (
              <>
                <p>
                  <strong>{details.recipient.name}</strong> · {details.recipient.email}
                </p>
                {details.client && <p>Client: {details.client}</p>}
                <p>Expires: {new Date(details.expiresAt).toUTCString()}</p>
                <form onSubmit={submit} aria-busy={busy}>
                  {credential?.purpose === 'invite' ? (
                    <>
                      <p>
                        Accepting adds Member access to this client. Your existing accounts and
                        permissions remain separate.
                      </p>
                      <label>
                        <input type="checkbox" name="accept" required /> I accept this client
                        invitation.
                      </label>
                    </>
                  ) : (
                    <>
                      <Password name="password" label="New password" creation />
                      <Password name="confirmation" label="Confirm new password" creation />
                    </>
                  )}
                  <button className="primary" disabled={busy}>
                    {busy
                      ? 'Saving…'
                      : credential?.purpose === 'invite'
                        ? 'Accept invitation'
                        : 'Save password'}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </section>
    </Guest>
  );
}

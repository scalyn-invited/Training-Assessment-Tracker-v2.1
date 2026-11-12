'use client';
import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  api,
  useContext,
  Guest,
  Pending,
  Password,
  Feedback,
  values,
} from '../../components/auth-ui';
export default function Security() {
  const { context, error: loadError, load } = useContext(),
    router = useRouter();
  const [enabled, setEnabled] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [secret, setSecret] = useState(''),
    [codes, setCodes] = useState<string[]>([]),
    [confirmDisable, setConfirmDisable] = useState(false);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
    if (context?.user)
      api<{ enabled: boolean }>('mfa')
        .then((result) => setEnabled(result.enabled))
        .catch((e) => setError(e.message));
  }, [context, router]);
  async function action(event: FormEvent<HTMLFormElement>, route: string) {
    const data = values(event);
    if (!context || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<{
        secret?: string;
        enabled?: boolean;
        recoveryCodes?: string[];
        csrf?: string;
      }>(route, { ...data, csrf: context.csrf });
      if (result.secret) setSecret(result.secret);
      if (result.enabled !== undefined) {
        setEnabled(result.enabled);
        setSecret('');
        setConfirmDisable(false);
      }
      if (result.recoveryCodes) setCodes(result.recoveryCodes);
      if (route === 'password') {
        router.replace('/login?passwordChanged=1');
      } else
        setSuccess(
          route === 'mfa/begin'
            ? 'Add the setup key to your authenticator, then confirm a code.'
            : route === 'mfa/confirm'
              ? 'Authenticator verification enabled. Save your recovery codes.'
              : 'Authenticator verification disabled.',
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={loadError} retry={load} />
      ) : (
        <>
          <Link href="/dashboard">Back to workspace</Link>
          <h1>Account security</h1>
          <p>{context.user.email}</p>
          <Feedback error={error} success={success} />
          {enabled === null ? (
            <button className="secondary" onClick={() => location.reload()}>
              Reload security settings
            </button>
          ) : (
            <section className="panel">
              <h2>Authenticator verification</h2>
              <p>
                {enabled
                  ? 'Enabled. A code is required when you sign in.'
                  : 'Optional. Your password is currently enough to sign in.'}
              </p>
              {codes.length > 0 ? (
                <div>
                  <h3>Save your recovery codes</h3>
                  <p>
                    Each code works once. These codes will not be shown again. Store them somewhere
                    private before leaving this page.
                  </p>
                  <ul className="recovery-codes">
                    {codes.map((code) => (
                      <li key={code}>
                        <code>{code}</code>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="primary"
                    onClick={() => {
                      setCodes([]);
                      setSuccess('Recovery-code display closed. Keep your saved codes private.');
                    }}
                  >
                    I have saved my recovery codes
                  </button>
                </div>
              ) : secret ? (
                <form onSubmit={(e) => action(e, 'mfa/confirm')}>
                  <label htmlFor="setup-key">Authenticator setup key</label>
                  <input id="setup-key" readOnly value={secret} autoComplete="off" />
                  <p>
                    Add this key manually in your authenticator with time-based six-digit codes.
                  </p>
                  <label htmlFor="code">Authenticator code</label>
                  <input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                  <button className="primary" disabled={busy}>
                    {busy ? 'Confirming…' : 'Confirm authenticator'}
                  </button>
                </form>
              ) : !enabled ? (
                <form onSubmit={(e) => action(e, 'mfa/begin')}>
                  <Password name="password" label="Your current password" />
                  <button className="primary" disabled={busy}>
                    {busy ? 'Preparing…' : 'Set up authenticator'}
                  </button>
                </form>
              ) : !confirmDisable ? (
                <button className="secondary" onClick={() => setConfirmDisable(true)}>
                  Disable authenticator verification
                </button>
              ) : (
                <form onSubmit={(e) => action(e, 'mfa/disable')}>
                  <h3>Disable authenticator verification?</h3>
                  <p>
                    Future sign-ins will require only your password. Other sessions will be signed
                    out.
                  </p>
                  <Password name="password" label="Your current password" />
                  <label htmlFor="code">New authenticator or unused recovery code</label>
                  <input
                    id="code"
                    name="code"
                    autoComplete="one-time-code"
                    maxLength={64}
                    required
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConfirmDisable(false)}
                  >
                    Cancel
                  </button>
                  <button className="danger" disabled={busy}>
                    {busy ? 'Disabling…' : 'Confirm disable'}
                  </button>
                </form>
              )}
            </section>
          )}
          <section className="panel">
            <h2>Change password</h2>
            <form onSubmit={(e) => action(e, 'password')}>
              <Password name="current" label="Current password" />
              <Password name="next" label="New password" creation />
              <Password name="confirmation" label="Confirm new password" creation />
              <p>Saving ends all sessions. You will sign in again.</p>
              <button className="secondary" disabled={busy}>
                {busy ? 'Saving…' : 'Change password'}
              </button>
            </form>
          </section>
        </>
      )}
    </Guest>
  );
}

'use client';
import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { Button, Input, Panel, PageHeader, Feedback } from '../../components/ui/controls';
import { PasswordField } from '../../components/ui/password';
import styles from '../../components/ui/form-layout.module.css';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, values } from '../../components/auth-ui';
export default function Security() {
  const { context, error: loadError, load } = useContext(),
    router = useRouter();
  const [unavailable, setUnavailable] = useState(false);
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
        .catch((e) => {
          if (e.code === 'local_password_unavailable') setUnavailable(true);
          else setError(e.message);
        });
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
        <div className={styles.page}>
          <Link href="/dashboard">Back to workspace</Link>
          <PageHeader title="Account security">{context.user.email}</PageHeader>
          <Feedback error={error} success={success} />
          {unavailable ? (
            <p>
              Password and authenticator settings are unavailable for simulated sign-in. Return to
              the workspace to continue testing.
            </p>
          ) : (
            <>
              {enabled === null ? (
                <Button variant="secondary" onClick={() => location.reload()}>
                  Reload security settings
                </Button>
              ) : (
                <Panel className={styles.panel}>
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
                        Each code works once. These codes will not be shown again. Store them
                        somewhere private before leaving this page.
                      </p>
                      <ul className="recovery-codes">
                        {codes.map((code) => (
                          <li key={code}>
                            <code>{code}</code>
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant="primary"
                        onClick={() => {
                          setCodes([]);
                          setSuccess(
                            'Recovery-code display closed. Keep your saved codes private.',
                          );
                        }}
                      >
                        I have saved my recovery codes
                      </Button>
                    </div>
                  ) : secret ? (
                    <form onSubmit={(e) => action(e, 'mfa/confirm')}>
                      <label htmlFor="setup-key">Authenticator setup key</label>
                      <Input id="setup-key" readOnly value={secret} autoComplete="off" />
                      <p>
                        Add this key manually in your authenticator with time-based six-digit codes.
                      </p>
                      <label htmlFor="code">Authenticator code</label>
                      <Input
                        id="code"
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                      />
                      <Button type="submit" variant="primary" disabled={busy}>
                        {busy ? 'Confirming…' : 'Confirm authenticator'}
                      </Button>
                    </form>
                  ) : !enabled ? (
                    <form onSubmit={(e) => action(e, 'mfa/begin')}>
                      <PasswordField name="password" label="Your current password" />
                      <Button type="submit" variant="primary" disabled={busy}>
                        {busy ? 'Preparing…' : 'Set up authenticator'}
                      </Button>
                    </form>
                  ) : !confirmDisable ? (
                    <Button variant="secondary" onClick={() => setConfirmDisable(true)}>
                      Disable authenticator verification
                    </Button>
                  ) : (
                    <form onSubmit={(e) => action(e, 'mfa/disable')}>
                      <h3>Disable authenticator verification?</h3>
                      <p>
                        Future sign-ins will require only your password. Other sessions will be
                        signed out.
                      </p>
                      <PasswordField name="password" label="Your current password" />
                      <label htmlFor="code">New authenticator or unused recovery code</label>
                      <Input
                        id="code"
                        name="code"
                        autoComplete="one-time-code"
                        maxLength={64}
                        required
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setConfirmDisable(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" variant="danger" disabled={busy}>
                        {busy ? 'Disabling…' : 'Confirm disable'}
                      </Button>
                    </form>
                  )}
                </Panel>
              )}
              <Panel className={styles.panel}>
                <h2>Change password</h2>
                <form onSubmit={(e) => action(e, 'password')}>
                  <PasswordField name="current" label="Current password" />
                  <PasswordField name="next" label="New password" creation />
                  <PasswordField name="confirmation" label="Confirm new password" creation />
                  <p>Saving ends all sessions. You will sign in again.</p>
                  <Button type="submit" variant="secondary" disabled={busy}>
                    {busy ? 'Saving…' : 'Change password'}
                  </Button>
                </form>
              </Panel>
            </>
          )}
        </div>
      )}
    </Guest>
  );
}

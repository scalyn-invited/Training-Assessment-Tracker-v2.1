'use client';
import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  useContext,
  Guest,
  Pending,
  Password,
  Feedback,
  values,
  type ApiError,
} from '../components/auth-ui';
type SignInOptions = {
  mode: 'local_password' | 'mock' | 'unavailable';
  identities: { id: string; name: string }[];
};
export default function Login() {
  const { context, error: loadError, load } = useContext(),
    router = useRouter();
  const [options, setOptions] = useState<SignInOptions | null>(null);
  const [optionsError, setOptionsError] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const optionsRequest = useRef(0);
  const loadOptions = useCallback(() => {
    const request = ++optionsRequest.current;
    setOptionsError('');
    setOptions(null);
    api<SignInOptions>('sign-in-options')
      .then((result) => {
        if (request === optionsRequest.current) setOptions(result);
      })
      .catch((e) => {
        if (request === optionsRequest.current) setOptionsError(e.message);
      });
  }, []);
  useEffect(() => {
    loadOptions();
    return () => {
      optionsRequest.current++;
    };
  }, [loadOptions]);
  const [passwordChanged, setPasswordChanged] = useState(false);
  useEffect(() => {
    setPasswordChanged(new URLSearchParams(window.location.search).get('passwordChanged') === '1');
  }, []);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [mfa, setMfa] = useState(false);
  useEffect(() => {
    if (context && !context.installed) router.replace('/setup');
    else if (context?.user)
      router.replace(
        context.user.global_admin
          ? '/platform'
          : context.authMode === 'mock'
            ? '/dashboard'
            : '/clients',
      );
  }, [context, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = values(event);
    if (!context || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: { global_admin: boolean } }>('login', {
        ...data,
        csrf: context.csrf,
      });
      router.replace(result.user.global_admin ? '/platform' : '/clients');
    } catch (e) {
      const problem = e as ApiError;
      setError(problem.message);
      if (problem.code === 'mfa_required') setMfa(true);
    } finally {
      setBusy(false);
    }
  }
  async function signInAs(identityId: string) {
    if (!context || busy) return;
    setBusy(true);
    setSelectedIdentity(identityId);
    setError('');
    try {
      const result = await api<{ user: { global_admin: boolean } }>('mock-login', {
        csrf: context.csrf,
        identityId,
      });
      router.replace(result.user.global_admin ? '/platform' : '/dashboard');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setSelectedIdentity(null);
    }
  }
  return (
    <Guest>
      {passwordChanged && (
        <p role="status">
          Password changed. All sessions have ended. Sign in with your new password.
        </p>
      )}
      {!context ? (
        <Pending error={loadError} retry={load} />
      ) : (
        <div className="login-grid">
          <section className="intro">
            <p className="eyebrow">Learning with purpose</p>
            <h1>
              Make progress.
              <br />
              Keep the evidence.
            </h1>
            <p className="lead">
              One place for focused training, thoughtful review, and a clear view of what comes
              next.
            </p>
            <div className="steps">
              <div>
                <b>01</b>
                <span>Set a meaningful goal</span>
              </div>
              <div>
                <b>02</b>
                <span>Learn and practise</span>
              </div>
              <div>
                <b>03</b>
                <span>Review demonstrated skills</span>
              </div>
            </div>
          </section>
          <section className="panel login-panel">
            <h2>Sign in</h2>
            {!options ? (
              <Pending error={optionsError} retry={loadOptions} />
            ) : options.mode === 'unavailable' ? (
              <>
                <p>Sign-in is unavailable. Contact your administrator to configure access.</p>
                <button type="button" className="secondary" onClick={loadOptions}>
                  Check again
                </button>
              </>
            ) : options.mode === 'mock' ? (
              <div aria-busy={busy}>
                <h3>Choose a test identity</h3>
                <p>
                  Each synthetic identity has a different view of the application. This simulates
                  sign-in; live SSO and MFA are not connected.
                </p>
                <Feedback error={error} />
                {options.identities.length ? (
                  options.identities.map((identity) => (
                    <p key={identity.id}>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => signInAs(identity.id)}
                      >
                        {selectedIdentity === identity.id
                          ? `Signing in as ${identity.name}...`
                          : `Sign in as ${identity.name}`}
                      </button>
                    </p>
                  ))
                ) : (
                  <>
                    <p>
                      No synthetic identities are available. Ask your administrator to prepare test
                      accounts, then refresh this list.
                    </p>
                    <button type="button" className="secondary" onClick={loadOptions}>
                      Refresh identities
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <form onSubmit={submit} aria-busy={busy}>
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    maxLength={200}
                    required
                  />
                  <Password name="password" label="Password" />
                  {mfa && (
                    <>
                      <label htmlFor="code">Authenticator or recovery code</label>
                      <input
                        id="code"
                        name="code"
                        autoComplete="one-time-code"
                        maxLength={64}
                        required
                      />
                      <p>
                        Authenticator verification is enabled on your account. Recovery codes can be
                        used once.
                      </p>
                    </>
                  )}
                  <Feedback error={error} />
                  <button className="primary" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
                <p>
                  For first-time access or a forgotten password, contact your administrator for a
                  private setup or recovery link.
                </p>
                <p>
                  If you received a client invitation, sign in first, then reopen the invitation
                  link.
                </p>
              </>
            )}
          </section>
        </div>
      )}
    </Guest>
  );
}

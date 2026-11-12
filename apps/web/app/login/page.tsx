'use client';
import { useState, useEffect, type FormEvent } from 'react';
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
export default function Login() {
  const { context, error: loadError, load } = useContext(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [mfa, setMfa] = useState(false);
  useEffect(() => {
    if (context && !context.installed) router.replace('/setup');
    else if (context?.user) router.replace('/dashboard');
  }, [context, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = values(event);
    if (!context || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('login', { ...data, csrf: context.csrf });
      router.replace('/dashboard');
    } catch (e) {
      const problem = e as ApiError;
      setError(problem.message);
      if (problem.code === 'mfa_required') setMfa(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Guest>
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
              If you received a client invitation, sign in first, then reopen the invitation link.
            </p>
          </section>
        </div>
      )}
    </Guest>
  );
}

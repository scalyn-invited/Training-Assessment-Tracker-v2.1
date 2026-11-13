'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, Password, Feedback, values } from '../components/auth-ui';
export default function Setup() {
  const { context, error: loadError, load } = useContext(),
    router = useRouter();
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [data, setData] = useState<Record<string, string>>({});
  useEffect(() => {
    if (context?.setupMode === 'hosted' || context?.setupMode === 'local')
      router.replace('/setup/' + context.setupMode);
    else if (context?.installed) router.replace('/login');
  }, [context, router]);
  async function install() {
    if (!context || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('setup', { ...data, csrf: context.csrf });
      setData({});
      setStep(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function review(event: FormEvent<HTMLFormElement>) {
    setData(values(event));
    setStep(3);
    setError('');
  }
  return (
    <Guest>
      <div className="login-grid">
        <section className="intro">
          <p className="eyebrow">Training Tracker</p>
          <h1>
            A workspace
            <br />
            ready for progress.
          </h1>
          <p className="lead">Create the first Global Admin and a fresh fictional workspace.</p>
          <ol className="journey-steps" aria-label="Installation steps">
            {['Check requirements', 'Create administrator', 'Review and install'].map(
              (label, i) => (
                <li key={label} aria-current={step === i + 1 ? 'step' : undefined}>
                  <span>{i + 1}</span>
                  <h2>{label}</h2>
                </li>
              ),
            )}
          </ol>
          <p>Setup closes after installation. Existing V2 records are never imported.</p>
        </section>
        <section className="panel login-panel">
          {!context ? (
            <Pending error={loadError} retry={load} />
          ) : step === 1 ? (
            <>
              <h2>Before we begin</h2>
              <p>
                The API and database connection are ready. Your local workspace uses a separate
                database and private storage.
              </p>
              <p>
                Setup creates your administrator and 30 fictional demo accounts across three
                clients. Training scenarios and role workflows are still being ported.
              </p>
              <button className="primary" onClick={() => setStep(2)}>
                Continue to administrator
              </button>
            </>
          ) : step === 2 ? (
            <>
              <h2>Your Global Admin account</h2>
              <form onSubmit={review}>
                <label htmlFor="name">Your name</label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  maxLength={120}
                  defaultValue={data.name}
                  required
                />
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  maxLength={200}
                  defaultValue={data.email}
                  required
                />
                <Password name="password" label="Administrator password" creation />
                <Password name="demoPassword" label="Demo account password" creation />
                <p>Use a different password for the fictional accounts.</p>
                <button type="button" className="secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="primary">Review installation</button>
              </form>
            </>
          ) : step === 3 ? (
            <>
              <h2>Review and install</h2>
              <dl>
                <dt>Administrator</dt>
                <dd>{data.name}</dd>
                <dt>Email</dt>
                <dd>{data.email}</dd>
                <dt>Workspace</dt>
                <dd>Fresh local database, three fictional clients and 30 demo accounts.</dd>
              </dl>
              <Feedback error={error} />
              <button className="secondary" disabled={busy} onClick={() => setStep(2)}>
                Back
              </button>
              <button className="primary" disabled={busy} aria-busy={busy} onClick={install}>
                {busy ? 'Installing…' : 'Install workspace'}
              </button>
            </>
          ) : (
            <>
              <h2>Workspace installed</h2>
              <p role="status">
                Your administrator and demo accounts are ready. Sign in with the password you chose.
              </p>
              <a className="primary" href="/login">
                Continue to sign in
              </a>
            </>
          )}
        </section>
      </div>
    </Guest>
  );
}

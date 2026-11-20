'use client';
import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, values } from '../components/auth-ui';
import { GuestPending } from '../components/guest-shell';
import { Button, Input, Feedback } from '../components/ui/controls';
import { PasswordField } from '../components/ui/password';
import { SetupFrame, SetupNotice, SetupSignIn } from '../components/setup-frame';
import { useWorkGuard } from '../components/use-work-guard';
import { confirmWorkLeave } from '../components/work-guard';
import styles from '../components/ui/setup.module.css';
const steps = ['Requirements', 'Administrator', 'Review and install', 'Done'];
const titles = [
  'Before we begin',
  'Your Global Admin account',
  'Review and install',
  'Workspace installed',
];
export default function Setup() {
  const { context, error: loadError, load } = useContext(),
    router = useRouter();
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [data, setData] = useState<Record<string, string>>({}),
    [dirty, setDirty] = useState(false);
  useWorkGuard({ dirty: dirty && step !== 4, pending: busy });
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
      setDirty(false);
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
      <SetupFrame
        label="Workspace installation"
        steps={steps}
        step={step - 1}
        title={!context ? 'Loading setup' : titles[step - 1]}
        complete={step === 4}
        busy={busy}
      >
        {!context ? (
          <GuestPending error={loadError} retry={load} />
        ) : step === 1 ? (
          <>
            <p>
              The API and database connection are ready. Your local workspace uses a separate
              database and private storage.
            </p>
            <p>
              Setup creates your administrator and 30 fictional demo accounts across three clients.
              Training scenarios and role workflows are still being ported.
            </p>
            <SetupNotice>
              Setup closes after installation. Existing V2 records are never imported.
            </SetupNotice>
            <Button variant="primary" onClick={() => setStep(2)}>
              Continue to administrator
            </Button>
          </>
        ) : step === 2 ? (
          <form onSubmit={review} onInput={() => setDirty(true)}>
            <div className={styles.field}>
              <label htmlFor="name">Your name</label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                maxLength={120}
                defaultValue={data.name}
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="email">Email address</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                maxLength={200}
                defaultValue={data.email}
                required
              />
            </div>
            <PasswordField name="password" label="Administrator password" creation />
            <PasswordField name="demoPassword" label="Demo account password" creation />
            <p>Use a different password for the fictional accounts.</p>
            <SetupNotice shield>
              Global Admin does not automatically give access to private training records.
            </SetupNotice>
            <div className={styles.actions}>
              <Button
                onClick={() => {
                  if (confirmWorkLeave()) {
                    setDirty(false);
                    setStep(1);
                  }
                }}
              >
                Back
              </Button>
              <Button type="submit" variant="primary">
                Review installation
              </Button>
            </div>
          </form>
        ) : step === 3 ? (
          <>
            <dl className={styles.summary}>
              <div>
                <dt>Administrator</dt>
                <dd>{data.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{data.email}</dd>
              </div>
              <div>
                <dt>Workspace</dt>
                <dd>Fresh local database, three fictional clients and 30 demo accounts.</dd>
              </div>
            </dl>
            <Feedback error={error} />
            <div className={styles.actions}>
              <Button disabled={busy} onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="primary" disabled={busy} aria-busy={busy} onClick={install}>
                {busy ? 'Installing…' : 'Install workspace'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p role="status">
              Your administrator and demo accounts are ready. Sign in with the password you chose.
            </p>
            <SetupSignIn />
          </>
        )}
      </SetupFrame>
    </Guest>
  );
}

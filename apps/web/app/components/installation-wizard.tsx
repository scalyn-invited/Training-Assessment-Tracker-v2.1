'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, Guest, values, type ApiError } from './auth-ui';
import { Button, Input, Feedback, Badge } from './ui/controls';
import { PasswordField as Password } from './ui/password';
import { SetupFrame, SetupNotice, SetupSignIn } from './setup-frame';
import { useWorkGuard } from './use-work-guard';
import { confirmWorkLeave } from './work-guard';
import styles from './ui/setup.module.css';
type View = {
  csrf: string;
  mode: 'hosted' | 'local';
  upgrade?: boolean;
  localDatabaseAvailable?: boolean;
  fixtureProgress?: number;
  step: 'token' | 'requirements' | 'database' | 'administrator' | 'review' | 'progress';
  stage?: string;
  started: boolean;
  requirements: Record<string, boolean>;
  database: {
    engine?: 'pglite' | 'postgresql';
    host: string;
    port: number;
    database: string;
    username: string;
  } | null;
  administrator: { name: string; email: string } | null;
};
const titles = {
  token: 'Unlock hosted setup',
  requirements: 'Check installation requirements',
  database: 'Connect your database',
  administrator: 'Create your administrator',
  review: 'Review installation',
  progress: 'Installing your workspace',
};
const stages = [
  ['migrated', 'Database schema ready'],
  ['seeded', 'Hosted profile prepared'],
  ['administrator', 'Administrator created'],
  ['complete', 'Configuration saved'],
];
export default function InstallationWizard({ mode }: { mode: 'hosted' | 'local' }) {
  const local = mode === 'local';
  const [engine, setEngine] = useState<'pglite' | 'postgresql'>('postgresql');
  const [fixtureProgress, setFixtureProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const pause = useRef(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState(false),
    [stage, setStage] = useState('');
  const [dirty, setDirty] = useState(false);
  const edited = useRef(false);
  const request = useRef(0);
  useWorkGuard({ dirty: dirty && !complete, pending: busy });
  function changed(value: boolean) {
    edited.current = value;
    setDirty(value);
  }
  const load = useCallback(async () => {
    const current = ++request.current;
    setError('');
    try {
      const result = await api<View>('/installation/context');
      if (current === request.current) {
        setView(result);
        if (!edited.current)
          setEngine(
            result.database?.engine ?? (result.localDatabaseAvailable ? 'pglite' : 'postgresql'),
          );
        setFixtureProgress(result.fixtureProgress ?? 0);
        setStage(result.stage ?? '');
      }
    } catch (e) {
      if (current === request.current) {
        try {
          if ((await api<{ complete: boolean }>('/installation/completion')).complete) {
            setComplete(true);
            return;
          }
        } catch {}
        if (mode === 'local') {
          try {
            if ((await api<{ installed: boolean }>('context')).installed) {
              setComplete(true);
              return;
            }
          } catch {}
        }
        setError((e as Error).message);
      }
    }
  }, [mode]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [load]);
  useEffect(() => {
    if (!complete || !local) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const context = await api<{ installed: boolean }>('context');
        if (!cancelled && context.installed) {
          setReady(true);
          return;
        }
      } catch {}
      if (!cancelled) timer = setTimeout(() => void check(), 1500);
    }
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [complete, local]);
  async function action(action: string, data?: Record<string, unknown>) {
    if (!view || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/installation/action', { csrf: view.csrf, action, data });
      changed(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      if (
        ['setup_owner_required', 'setup_session_invalid', 'setup_token_invalid'].includes(
          (e as ApiError).code ?? '',
        )
      )
        setView({ ...view, step: 'token' });
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>, actionName: string) {
    const data: Record<string, unknown> = values(event);
    if (actionName === 'database') {
      if (local && engine === 'pglite') {
        void action(actionName, { engine });
        return;
      }
      data.port = Number(data.port);
      if (local) data.engine = 'postgresql';
    }
    void action(actionName, data);
  }
  async function install() {
    if (!view || busy) return;
    setBusy(true);
    setError('');
    pause.current = false;
    setPauseRequested(false);
    setView({ ...view, step: 'progress', started: true });
    try {
      for (let step = 0; step < (local ? 28 : 4); step++) {
        const result = await api<{ stage: string; complete: boolean; fixtureProgress?: number }>(
          '/installation/action',
          {
            csrf: view.csrf,
            action: 'install',
          },
        );
        setStage(result.stage);
        setFixtureProgress(result.fixtureProgress ?? 0);
        if (result.complete) {
          setComplete(true);
          setView(null);
          return;
        }
        if (pause.current) break;
      }
      await load();
    } catch (e) {
      try {
        if ((await api<{ complete: boolean }>('/installation/completion')).complete) {
          setComplete(true);
          setView(null);
          return;
        }
      } catch {}
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const back =
    view && !view.started ? (
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirmWorkLeave()) void action('back');
        }}
      >
        Back
      </Button>
    ) : null;
  return (
    <Guest>
      <SetupFrame
        label={local ? 'Local installation' : 'Hosted installation'}
        busy={busy}
        complete={complete}
        step={
          complete
            ? 5
            : ['requirements', 'database', 'administrator', 'review', 'progress'].indexOf(
                view?.step ?? '',
              )
        }
        title={
          complete
            ? 'Workspace installed'
            : view
              ? local && view.step === 'token'
                ? 'Unlock local upgrade'
                : titles[view.step]
              : 'Loading setup'
        }
      >
        <Feedback error={error} />
        {error && view && !complete && (
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            Reload saved step
          </Button>
        )}
        {complete ? (
          <>
            <p>
              {local
                ? 'Your personal administrator and fictional training workspace are saved.'
                : 'Your production administrator and configuration are saved. No fictional accounts or training records were created.'}
            </p>
            <p>
              {local
                ? ready
                  ? 'Your workspace is ready. Live AI and email remain disabled.'
                  : 'Starting your workspace. This page will show a sign-in link when it is ready.'
                : 'Restart the API and worker with the generated configuration, then sign in. Live AI and email remain disabled.'}
            </p>
            {(!local || ready) && <SetupSignIn />}
          </>
        ) : !view ? (
          <>
            <p role="status">
              {error
                ? 'Setup is unavailable. Check the configured address and console preparation, then try again.'
                : 'Checking the private setup session...'}
            </p>
            {error && (
              <Button variant="secondary" onClick={() => void load()}>
                Reload setup
              </Button>
            )}
          </>
        ) : (
          <>
            <p>Complete one step at a time. Credentials stay out of review summaries.</p>
            {view.step === 'token' && (
              <form onInput={() => changed(true)} onSubmit={(e) => submit(e, 'token')}>
                <p>
                  Enter the one-time token issued by your server console. It expires after one hour;
                  issuing another token replaces the previous setup owner.
                </p>
                <div className={styles.field}>
                  <label htmlFor="setup-token">Setup token</label>
                  <Input
                    id="setup-token"
                    name="token"
                    type="password"
                    autoComplete="off"
                    minLength={64}
                    maxLength={64}
                    required
                  />
                </div>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? 'Checking token...' : 'Unlock setup'}
                </Button>
              </form>
            )}
            {view.step === 'requirements' && (
              <>
                <ul className={styles.requirements}>
                  {Object.entries(view.requirements).map(([name, passed]) => (
                    <li key={name}>
                      {passed && (
                        <img src="/setup/check-circle.svg" width={20} height={20} alt="" />
                      )}
                      <span>{name}</span>
                      <Badge tone={passed ? 'success' : 'warning'}>
                        {passed ? 'Ready' : 'Needs attention'}
                      </Badge>
                    </li>
                  ))}
                </ul>
                <p>
                  Resolve any failed requirement before continuing. PostgreSQL ownership is checked
                  in the next step.
                </p>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => void action('requirements')}
                >
                  {busy ? 'Checking requirements...' : 'Continue to database'}
                </Button>
              </>
            )}
            {view.step === 'database' && (
              <form
                onInput={() => changed(true)}
                key="database"
                onSubmit={(e) => submit(e, 'database')}
              >
                {local && view.localDatabaseAvailable && (
                  <fieldset disabled={busy}>
                    <legend>Where should this workspace be stored?</legend>
                    <div className={styles.choices}>
                      <label>
                        <Input
                          type="radio"
                          name="engine"
                          checked={engine === 'pglite'}
                          onChange={() => {
                            setEngine('pglite');
                            changed(true);
                          }}
                        />{' '}
                        Local PGlite workspace
                      </label>
                      <label>
                        <Input
                          type="radio"
                          name="engine"
                          checked={engine === 'postgresql'}
                          onChange={() => {
                            setEngine('postgresql');
                            changed(true);
                          }}
                        />{' '}
                        PostgreSQL database
                      </label>
                    </div>
                  </fieldset>
                )}
                {local && engine === 'pglite' && (
                  <p>
                    Store this new workspace privately on this computer. No database credentials are
                    needed.
                  </p>
                )}
                <fieldset
                  hidden={local && engine === 'pglite'}
                  disabled={local && engine === 'pglite'}
                >
                  <legend>PostgreSQL connection</legend>
                  <p>
                    Use an existing empty PostgreSQL database. An interrupted installation can
                    resume only its own database.
                  </p>
                  <div className={`${styles.pair} ${styles.host}`}>
                    <div className={styles.field}>
                      <label htmlFor="setup-host">Database host</label>
                      <Input
                        id="setup-host"
                        name="host"
                        defaultValue={view.database?.host ?? '127.0.0.1'}
                        maxLength={253}
                        autoComplete="off"
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="setup-port">Database port</label>
                      <Input
                        id="setup-port"
                        name="port"
                        type="number"
                        min={1}
                        max={65535}
                        defaultValue={view.database?.port ?? 5432}
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.pair}>
                    <div className={styles.field}>
                      <label htmlFor="setup-database">Database name</label>
                      <Input
                        id="setup-database"
                        name="database"
                        defaultValue={view.database?.database ?? ''}
                        maxLength={64}
                        autoComplete="off"
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="setup-username">Database username</label>
                      <Input
                        id="setup-username"
                        name="username"
                        defaultValue={view.database?.username ?? ''}
                        maxLength={128}
                        autoComplete="off"
                        required
                      />
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="setup-db-password">
                      Database password (optional if allowed by your server)
                    </label>
                    <Input
                      id="setup-db-password"
                      name="password"
                      type="password"
                      maxLength={1024}
                      autoComplete="off"
                    />
                  </div>
                  <p>
                    The setup account needs schema and restricted-role creation privileges.
                    Connection failures preserve your entries for retry.
                  </p>
                </fieldset>
                <div className={styles.actions}>
                  {back}
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy ? 'Checking database...' : 'Check database and continue'}
                  </Button>
                </div>
              </form>
            )}
            {view.step === 'administrator' && (
              <form
                onInput={() => changed(true)}
                key="administrator"
                onSubmit={(e) => submit(e, 'administrator')}
              >
                <p>
                  {local
                    ? 'Create your personal Global Admin account and choose a separate password for the fictional accounts.'
                    : 'Create your personal Global Admin account. Hosted installation does not create demo accounts.'}
                </p>
                <div className={styles.field}>
                  <label htmlFor="setup-name">Your name</label>
                  <Input
                    id="setup-name"
                    name="name"
                    defaultValue={view.administrator?.name ?? ''}
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="setup-email">Email address</label>
                  <Input
                    id="setup-email"
                    name="email"
                    type="email"
                    defaultValue={view.administrator?.email ?? ''}
                    autoComplete="email"
                    maxLength={200}
                    required
                  />
                </div>
                <div className={styles.pair}>
                  <Password name="password" label="Administrator password" creation />
                  <Password name="confirmation" label="Confirm administrator password" creation />
                </div>
                {local && (
                  <fieldset>
                    <legend>Fictional training accounts</legend>
                    <p>
                      The 30 demo accounts share this password. It must differ from your
                      administrator password.
                    </p>
                    <div className={styles.pair}>
                      <Password name="demoPassword" label="Demo account password" creation />
                      <Password
                        name="demoConfirmation"
                        label="Confirm demo account password"
                        creation
                      />
                    </div>
                  </fieldset>
                )}
                <SetupNotice shield>
                  Global Admin does not automatically give access to private training records.
                </SetupNotice>
                <div className={styles.actions}>
                  {back}
                  <Button type="submit" variant="primary" disabled={busy}>
                    {busy ? 'Checking administrator...' : 'Review installation'}
                  </Button>
                </div>
              </form>
            )}
            {view.step === 'review' && (
              <>
                <dl className={styles.summary}>
                  <div>
                    <dt>Database</dt>
                    <dd>
                      {view.database?.engine === 'pglite'
                        ? 'Local PGlite workspace on this computer'
                        : `${view.database?.database} on ${view.database?.host}:${view.database?.port}`}
                    </dd>
                  </div>
                  {view.database?.engine !== 'pglite' && (
                    <>
                      <div>
                        <dt>Database account</dt>
                        <dd>{view.database?.username}</dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>Administrator</dt>
                    <dd>
                      {view.administrator?.name} ({view.administrator?.email})
                    </dd>
                  </div>
                </dl>
                <p>
                  {local
                    ? 'This creates your personal administrator, three fictional clients, 30 demo accounts and 21 training scenarios in the selected empty workspace.'
                    : 'This creates the schema and your administrator in the selected empty database.'}{' '}
                  Once started, retries preserve the same database and administrator credentials.
                  Live AI, SMTP and mock sign-in stay disabled.
                </p>
                <div className={styles.actions}>
                  {back}
                  <Button variant="primary" disabled={busy} onClick={() => void install()}>
                    {busy
                      ? 'Starting installation...'
                      : local
                        ? 'Install local workspace'
                        : 'Install hosted workspace'}
                  </Button>
                </div>
              </>
            )}
            {view.step === 'progress' && (
              <>
                <ol className={styles.stages} aria-label="Installation stages">
                  {stages.map(([value, label], index) => (
                    <li key={value}>
                      <img
                        src={
                          index <= stages.findIndex(([value]) => value === stage)
                            ? '/setup/check-circle.svg'
                            : '/setup/schedule.svg'
                        }
                        width={20}
                        height={20}
                        alt=""
                      />
                      <span>
                        {index <= stages.findIndex(([value]) => value === stage)
                          ? 'Completed'
                          : 'Pending'}
                        :{' '}
                        {local && value === 'seeded'
                          ? 'Fictional training workspace prepared'
                          : label}
                      </span>
                    </li>
                  ))}
                </ol>
                {local && (
                  <p role="status">Demo preparation: {fixtureProgress} of 25 steps saved.</p>
                )}
                {local && busy && (
                  <Button
                    variant="secondary"
                    disabled={pauseRequested}
                    onClick={() => {
                      pause.current = true;
                      setPauseRequested(true);
                    }}
                  >
                    {pauseRequested ? 'Pausing after current step...' : 'Pause after current step'}
                  </Button>
                )}
                <p role="status">
                  {busy
                    ? 'Completing the current stage. Keep this page open.'
                    : 'The last completed stage is saved. Continue to resume safely.'}
                </p>
                {!busy && (
                  <Button variant="primary" onClick={() => void install()}>
                    {error ? 'Retry current stage' : 'Continue installation'}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </SetupFrame>
    </Guest>
  );
}

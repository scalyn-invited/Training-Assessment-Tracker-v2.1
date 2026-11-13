'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, Guest, Feedback, Password, values, type ApiError } from './auth-ui';
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
  const heading = useRef<HTMLHeadingElement>(null),
    request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setError('');
    try {
      const result = await api<View>('/installation/context');
      if (current === request.current) {
        setView(result);
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
    heading.current?.focus();
  }, [view?.step, complete]);
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
  return (
    <Guest>
      <section className="panel" aria-busy={busy}>
        <p className="eyebrow">{local ? 'Local installation' : 'Hosted installation'}</p>
        <h1 ref={heading} tabIndex={-1}>
          {complete
            ? 'Workspace installed'
            : view
              ? local && view.step === 'token'
                ? 'Unlock local upgrade'
                : titles[view.step]
              : 'Loading setup'}
        </h1>
        <Feedback error={error} />
        {error && view && !complete && (
          <button className="secondary" disabled={busy} onClick={() => void load()}>
            Reload saved step
          </button>
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
            {(!local || ready) && <Link href="/login">Continue to sign in</Link>}
          </>
        ) : !view ? (
          <>
            <p role="status">
              {error
                ? 'Setup is unavailable. Check the configured address and console preparation, then try again.'
                : 'Checking the private setup session...'}
            </p>
            {error && (
              <button className="secondary" onClick={() => void load()}>
                Reload setup
              </button>
            )}
          </>
        ) : (
          <>
            <p>Complete one step at a time. Credentials stay out of review summaries.</p>
            {view.step === 'token' && (
              <form onSubmit={(e) => submit(e, 'token')}>
                <p>
                  Enter the one-time token issued by your server console. It expires after one hour;
                  issuing another token replaces the previous setup owner.
                </p>
                <label htmlFor="setup-token">Setup token</label>
                <input
                  id="setup-token"
                  name="token"
                  type="password"
                  autoComplete="off"
                  minLength={64}
                  maxLength={64}
                  required
                />
                <button className="primary" disabled={busy}>
                  {busy ? 'Checking token...' : 'Unlock setup'}
                </button>
              </form>
            )}
            {view.step === 'requirements' && (
              <>
                <ul>
                  {Object.entries(view.requirements).map(([name, passed]) => (
                    <li key={name}>
                      {passed ? 'Ready' : 'Needs attention'}: {name}
                    </li>
                  ))}
                </ul>
                <p>
                  Resolve any failed requirement before continuing. PostgreSQL ownership is checked
                  in the next step.
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void action('requirements')}
                >
                  {busy ? 'Checking requirements...' : 'Continue to database'}
                </button>
              </>
            )}
            {view.step === 'database' && (
              <form key="database" onSubmit={(e) => submit(e, 'database')}>
                {local && view.localDatabaseAvailable && (
                  <fieldset disabled={busy}>
                    <legend>Where should this workspace be stored?</legend>
                    <label>
                      <input
                        type="radio"
                        name="engine"
                        checked={engine === 'pglite'}
                        onChange={() => setEngine('pglite')}
                      />{' '}
                      Local PGlite workspace
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="engine"
                        checked={engine === 'postgresql'}
                        onChange={() => setEngine('postgresql')}
                      />{' '}
                      PostgreSQL database
                    </label>
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
                  <label htmlFor="setup-host">Database host</label>
                  <input
                    id="setup-host"
                    name="host"
                    defaultValue={view.database?.host ?? '127.0.0.1'}
                    maxLength={253}
                    autoComplete="off"
                    required
                  />
                  <label htmlFor="setup-port">Database port</label>
                  <input
                    id="setup-port"
                    name="port"
                    type="number"
                    min={1}
                    max={65535}
                    defaultValue={view.database?.port ?? 5432}
                    required
                  />
                  <label htmlFor="setup-database">Database name</label>
                  <input
                    id="setup-database"
                    name="database"
                    defaultValue={view.database?.database ?? ''}
                    maxLength={64}
                    autoComplete="off"
                    required
                  />
                  <label htmlFor="setup-username">Database username</label>
                  <input
                    id="setup-username"
                    name="username"
                    defaultValue={view.database?.username ?? ''}
                    maxLength={128}
                    autoComplete="off"
                    required
                  />
                  <label htmlFor="setup-db-password">
                    Database password (optional if allowed by your server)
                  </label>
                  <input
                    id="setup-db-password"
                    name="password"
                    type="password"
                    maxLength={1024}
                    autoComplete="off"
                  />
                  <p>
                    The setup account needs schema and restricted-role creation privileges.
                    Connection failures preserve your entries for retry.
                  </p>
                </fieldset>
                <button className="primary" disabled={busy}>
                  {busy ? 'Checking database...' : 'Check database and continue'}
                </button>
              </form>
            )}
            {view.step === 'administrator' && (
              <form key="administrator" onSubmit={(e) => submit(e, 'administrator')}>
                <p>
                  {local
                    ? 'Create your personal Global Admin account and choose a separate password for the fictional accounts.'
                    : 'Create your personal Global Admin account. Hosted installation does not create demo accounts.'}
                </p>
                <label htmlFor="setup-name">Your name</label>
                <input
                  id="setup-name"
                  name="name"
                  defaultValue={view.administrator?.name ?? ''}
                  autoComplete="name"
                  maxLength={120}
                  required
                />
                <label htmlFor="setup-email">Email address</label>
                <input
                  id="setup-email"
                  name="email"
                  type="email"
                  defaultValue={view.administrator?.email ?? ''}
                  autoComplete="email"
                  maxLength={200}
                  required
                />
                <Password name="password" label="Administrator password" creation />
                <Password name="confirmation" label="Confirm administrator password" creation />
                {local && (
                  <fieldset>
                    <legend>Fictional training accounts</legend>
                    <p>
                      The 30 demo accounts share this password. It must differ from your
                      administrator password.
                    </p>
                    <Password name="demoPassword" label="Demo account password" creation />
                    <Password
                      name="demoConfirmation"
                      label="Confirm demo account password"
                      creation
                    />
                  </fieldset>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? 'Checking administrator...' : 'Review installation'}
                </button>
              </form>
            )}
            {view.step === 'review' && (
              <>
                <dl>
                  <dt>Database</dt>
                  <dd>
                    {view.database?.engine === 'pglite'
                      ? 'Local PGlite workspace on this computer'
                      : `${view.database?.database} on ${view.database?.host}:${view.database?.port}`}
                  </dd>
                  {view.database?.engine !== 'pglite' && (
                    <>
                      <dt>Database account</dt>
                      <dd>{view.database?.username}</dd>
                    </>
                  )}
                  <dt>Administrator</dt>
                  <dd>
                    {view.administrator?.name} ({view.administrator?.email})
                  </dd>
                </dl>
                <p>
                  {local
                    ? 'This creates your personal administrator, three fictional clients, 30 demo accounts and 21 training scenarios in the selected empty workspace.'
                    : 'This creates the schema and your administrator in the selected empty database.'}{' '}
                  Once started, retries preserve the same database and administrator credentials.
                  Live AI, SMTP and mock sign-in stay disabled.
                </p>
                <button className="primary" disabled={busy} onClick={() => void install()}>
                  {busy
                    ? 'Starting installation...'
                    : local
                      ? 'Install local workspace'
                      : 'Install hosted workspace'}
                </button>
              </>
            )}
            {view.step === 'progress' && (
              <>
                <ol aria-label="Installation stages">
                  {stages.map(([value, label], index) => (
                    <li key={value}>
                      {index <= stages.findIndex(([value]) => value === stage)
                        ? 'Completed'
                        : 'Pending'}
                      :{' '}
                      {local && value === 'seeded'
                        ? 'Fictional training workspace prepared'
                        : label}
                    </li>
                  ))}
                </ol>
                {local && (
                  <p role="status">Demo preparation: {fixtureProgress} of 25 steps saved.</p>
                )}
                {local && busy && (
                  <button
                    className="secondary"
                    disabled={pauseRequested}
                    onClick={() => {
                      pause.current = true;
                      setPauseRequested(true);
                    }}
                  >
                    {pauseRequested ? 'Pausing after current step...' : 'Pause after current step'}
                  </button>
                )}
                <p role="status">
                  {busy
                    ? 'Completing the current stage. Keep this page open.'
                    : 'The last completed stage is saved. Continue to resume safely.'}
                </p>
                {!busy && (
                  <button className="primary" onClick={() => void install()}>
                    {error ? 'Retry current stage' : 'Continue installation'}
                  </button>
                )}
              </>
            )}
            {!view.started && ['database', 'administrator', 'review'].includes(view.step) && (
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => void action('back')}
              >
                Back
              </button>
            )}
          </>
        )}
      </section>
    </Guest>
  );
}

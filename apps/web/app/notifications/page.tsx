'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest } from '../components/auth-ui';
import { useRouter } from 'next/navigation';
import { Button, Input, Panel, PageHeader, Feedback } from '../components/ui/controls';
import { Pagination } from '../components/ui/directory';
import layout from '../components/ui/form-layout.module.css';
import styles from '../components/ui/notifications.module.css';
import { registerWorkGuard } from '../components/work-guard';
import type { LearningNotices } from '../../../../packages/domain/src/learning-notices';
type View = Awaited<ReturnType<LearningNotices['read']>>;
export default function Updates() {
  const ctx = useContext(),
    client = ctx.context?.client?.id;
  const router = useRouter();
  useEffect(() => {
    if (ctx.context && !ctx.context.user) router.replace('/login');
  }, [ctx.context, router]);
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<View | null>(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const sequence = useRef(0);
  async function load() {
    if (!client) return;
    const request = ++sequence.current;
    setLoading(true);
    try {
      const next = await api<View>(`/notifications?clientId=${client}&page=${page}`);
      if (request === sequence.current) {
        setView(next);
        setError('');
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    setView(null);
    setPage(1);
  }, [client]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [client, page, retry]);
  return (
    <Guest>
      <div className={layout.page}>
        {!ctx.context?.user ? (
          <>
            <PageHeader title="Training updates" />
            <Feedback error={ctx.error} />
            {ctx.error ? (
              <Button onClick={() => void ctx.load()}>Try loading your session again</Button>
            ) : (
              <p role="status">Loading your session...</p>
            )}
          </>
        ) : !client ? (
          <>
            <PageHeader title="Choose a client" />
            <Link href="/clients">Choose your client</Link>
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">{ctx.context.client?.name}</p>
              <PageHeader title="Training updates" />
            </div>
            <Link href="/dashboard">Workspace</Link>
            {!view ? (
              <>
                <Feedback error={error} />
                {error ? (
                  <Button disabled={loading} onClick={() => void load()}>
                    Try loading updates again
                  </Button>
                ) : null}
                {loading && <p role="status">Loading your updates...</p>}
              </>
            ) : (
              <>
                <Preference key={client} initial={view.trainingEmail} csrf={ctx.context.csrf} />
                <Panel className={`${layout.panel} ${styles.panel}`} aria-label="Your updates">
                  <h2>Your updates</h2>
                  <Feedback error={error} />
                  <Button disabled={loading} aria-busy={loading} onClick={() => void load()}>
                    {loading ? 'Refreshing updates...' : 'Refresh updates'}
                  </Button>
                  {loading && <p role="status">Loading your updates...</p>}
                  {!view.notices.length ? (
                    <p>
                      No updates are available for your current permissions. Your training events
                      will appear here when recorded.
                    </p>
                  ) : (
                    <ul className={styles.list}>
                      {view.notices.map((n) => (
                        <li key={n.id}>
                          <p>
                            <Link href={n.href}>{n.kind.replaceAll('_', ' ')}</Link>
                          </p>
                          <p>
                            <time
                              dateTime={new Date(n.createdAt).toISOString()}
                              className={styles.time}
                            >
                              {new Date(n.createdAt).toLocaleString()}
                            </time>{' '}
                            / {n.status.replaceAll('_', ' ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Pagination aria-label="Updates pages">
                    <Button
                      disabled={loading || view.page === 1}
                      onClick={() => {
                        setPage(view.page - 1);
                        setRetry((n) => n + 1);
                      }}
                    >
                      Previous page
                    </Button>
                    <span>
                      Page {view.page} / {view.total} updates
                    </span>
                    <Button
                      disabled={loading || view.page * 20 >= view.total}
                      onClick={() => {
                        setPage(view.page + 1);
                        setRetry((n) => n + 1);
                      }}
                    >
                      Next page
                    </Button>
                  </Pagination>
                </Panel>
              </>
            )}
          </>
        )}
      </div>
    </Guest>
  );
}
function Preference({ initial, csrf }: { initial: boolean; csrf: string }) {
  const [value, setValue] = useState(initial),
    [saved, setSaved] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const pending = useRef(false);
  const dirty = useRef(false);
  dirty.current = value !== saved;
  useEffect(
    () => registerWorkGuard(() => ({ dirty: dirty.current, pending: pending.current })),
    [],
  );
  return (
    <Panel className={`${layout.panel} ${styles.panel}`}>
      <h2>Email preference</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending.current) return;
          pending.current = true;
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await api('/notifications', { csrf, trainingEmail: value });
            setSaved(value);
            setMessage('Email preference saved. In-app updates remain available.');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend>Training emails</legend>
          <label className={styles.choice}>
            <Input
              type="radio"
              name="trainingEmail"
              checked={value}
              onChange={() => {
                setValue(true);
                setMessage('');
              }}
            />
            Enabled when a live sender is configured
          </label>
          <label className={styles.choice}>
            <Input
              type="radio"
              name="trainingEmail"
              checked={!value}
              onChange={() => {
                setValue(false);
                setMessage('');
              }}
            />
            In-app updates only
          </label>
        </fieldset>
        <Feedback error={error} success={message} />
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving preference...' : 'Save preference'}
        </Button>
      </form>
      <p>
        Synthetic accounts use a non-delivering sink. Relay acceptance does not prove email
        delivery.
      </p>
    </Panel>
  );
}

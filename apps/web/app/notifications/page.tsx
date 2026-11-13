'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
import { useLeaveGuard } from '../components/learning-controls';
import type { LearningNotices } from '../../../../packages/domain/src/learning-notices';
type View = Awaited<ReturnType<LearningNotices['read']>>;
export default function Updates() {
  const ctx = useContext(),
    client = ctx.context?.client?.id;
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
  }, [client, page]);
  return (
    <Guest>
      {!ctx.context?.user ? (
        <Pending error={ctx.error} retry={ctx.load} />
      ) : !client ? (
        <>
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <>
          <p className="eyebrow">{ctx.context.client?.name}</p>
          <h1>Training updates</h1>
          <Link href="/dashboard">Workspace</Link>
          {!view ? (
            <Pending error={error} retry={load} />
          ) : (
            <>
              <Preference key={client} initial={view.trainingEmail} csrf={ctx.context.csrf} />
              <section className="panel" aria-label="Your updates">
                <h2>Your updates</h2>
                <Feedback error={error} />
                <button
                  className="secondary"
                  disabled={loading}
                  aria-busy={loading}
                  onClick={() => void load()}
                >
                  {loading ? 'Refreshing updates...' : 'Refresh updates'}
                </button>
                {loading && <p role="status">Loading your updates...</p>}
                {!view.notices.length ? (
                  <p>
                    No updates are available for your current permissions. Your training events will
                    appear here when recorded.
                  </p>
                ) : (
                  <ul>
                    {view.notices.map((n) => (
                      <li key={n.id}>
                        <p>
                          <Link href={n.href}>{n.kind.replaceAll('_', ' ')}</Link>
                        </p>
                        <p>
                          <time
                            dateTime={new Date(n.createdAt).toISOString()}
                            style={{ whiteSpace: 'nowrap' }}
                          >
                            {new Date(n.createdAt).toLocaleString()}
                          </time>{' '}
                          / {n.status.replaceAll('_', ' ')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="form-actions">
                  <button
                    className="secondary"
                    disabled={loading || page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous page
                  </button>
                  <span>
                    Page {view.page} / {view.total} updates
                  </span>
                  <button
                    className="secondary"
                    disabled={loading || page * 20 >= view.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next page
                  </button>
                </div>
              </section>
            </>
          )}
        </>
      )}
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
  useLeaveGuard(value !== saved || busy);
  return (
    <section className="panel">
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
          <label>
            <input
              type="radio"
              name="trainingEmail"
              checked={value}
              onChange={() => setValue(true)}
            />
            Enabled when a live sender is configured
          </label>
          <label>
            <input
              type="radio"
              name="trainingEmail"
              checked={!value}
              onChange={() => setValue(false)}
            />
            In-app updates only
          </label>
        </fieldset>
        <Feedback error={error} success={message} />
        <button className="secondary" disabled={busy} aria-busy={busy}>
          {busy ? 'Saving preference...' : 'Save preference'}
        </button>
      </form>
      <p>
        Synthetic accounts use a non-delivering sink. Relay acceptance does not prove email
        delivery.
      </p>
    </section>
  );
}

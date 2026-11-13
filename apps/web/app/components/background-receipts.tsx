'use client';
import { useEffect, useState } from 'react';
import { api, Feedback } from './auth-ui';
type Receipt = {
  id: string;
  state: string;
  errorCode: string | null;
  createdAt: string;
  receiptAt: string | null;
};
export function BackgroundReceipts({
  client,
  revision = 0,
}: {
  client: string;
  revision?: number;
}) {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true,
      running = false;
    async function load() {
      if (running) return;
      running = true;
      setLoading(true);
      try {
        const rows = await api<Receipt[]>('/jobs?clientId=' + client);
        if (current) {
          setReceipts(rows);
          setError('');
        }
      } catch (e) {
        if (current) {
          setReceipts(null);
          setError((e as Error).message);
        }
      } finally {
        running = false;
        if (current) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [client, revision, retry]);
  return (
    <section className="panel receipts" aria-label="Background check receipts">
      <div className="section-heading">
        <h2>Background receipts</h2>
        <span>Refreshes every 5 seconds</span>
      </div>
      <p className="subtle">Local notification sink. No outbound email.</p>
      <Feedback error={error} />
      {error && (
        <button
          className="secondary"
          disabled={loading}
          aria-busy={loading}
          onClick={() => setRetry((n) => n + 1)}
        >
          {loading ? 'Loading receipts...' : 'Retry background receipts'}
        </button>
      )}
      {!receipts && !error && <p role="status">Loading your background receipts...</p>}
      {receipts && (
        <ul className="file-list" aria-live="polite">
          {receipts.length === 0 && (
            <li>No checks requested yet. Open a training record to check background processing.</li>
          )}
          {receipts.map((row) => (
            <li key={row.id}>
              <div>
                <strong>Foundation check</strong>
                <small>
                  <time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString()}</time> /{' '}
                  {row.id.slice(0, 8)}
                </small>
                {row.errorCode === 'authority_or_version_changed' && (
                  <p>Access or the enrolment version changed before this check ran.</p>
                )}
                {row.errorCode === 'retry_budget_exhausted' && (
                  <p>
                    This check exhausted its retries. Contact your administrator before requesting
                    another.
                  </p>
                )}
              </div>
              <span className="badge">
                {row.state.charAt(0).toUpperCase() + row.state.slice(1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

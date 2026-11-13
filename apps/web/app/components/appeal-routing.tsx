'use client';
import { useEffect, useState } from 'react';
import { api, Feedback } from './auth-ui';
type Case = {
  id: string;
  assignmentId: string;
  reviewerId: string | null;
  reviewers: { id: string; name: string }[];
};
export function AppealRouting({ client, csrf }: { client: string; csrf: string }) {
  const [data, setData] = useState<{ canRoute: boolean; appeals: Case[] } | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    api<{ canRoute: boolean; appeals: Case[] }>('/assessments/appeals?clientId=' + client)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [client, retry]);
  if (error)
    return (
      <section className="panel">
        <Feedback error={error} />
        <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
          Retry appeal routing
        </button>
      </section>
    );
  if (!data) return <p role="status">Loading appeal routing...</p>;
  if (!data.canRoute || !data.appeals.length) return null;
  return (
    <section className="panel">
      <h2>Assign alternate reviewers</h2>
      <p>
        Only a different eligible team coordinator can resolve an appeal. Assignment grants access
        to that case only.
      </p>
      {data.appeals.map((item) => (
        <RoutingForm
          key={item.id}
          item={item}
          client={client}
          csrf={csrf}
          refresh={() => setRetry((n) => n + 1)}
        />
      ))}
    </section>
  );
}
function RoutingForm({
  item,
  client,
  csrf,
  refresh,
}: {
  item: Case;
  client: string;
  csrf: string;
  refresh: () => void;
}) {
  const [reviewer, setReviewer] = useState(item.reviewerId ?? ''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  return (
    <details>
      <summary style={{ overflowWrap: 'anywhere' }}>Case {item.id}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !window.confirm('Assign this coordinator to review this assessment case?'))
            return;
          setBusy(true);
          setError('');
          setMessage('');
          try {
            await api('/assessments/appeals/' + item.id + '/route', {
              csrf,
              clientId: client,
              reviewer,
              reason,
            });
            setMessage('Alternate reviewer assigned.');
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Feedback error={error} success={message} />
        <label>
          Reviewer
          <select
            aria-label={'Reviewer for ' + item.id}
            required
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            disabled={busy}
          >
            <option value="">Choose an eligible coordinator</option>
            {item.reviewers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        {!item.reviewers.length && (
          <p>No eligible alternate coordinator is currently available for this team.</p>
        )}
        <label>
          Assignment reason
          <textarea
            aria-label={'Assignment reason for ' + item.id}
            required
            minLength={8}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        <button className="primary" disabled={busy || !item.reviewers.length} aria-busy={busy}>
          {busy ? 'Assigning reviewer...' : 'Assign alternate reviewer'}
        </button>
      </form>
    </details>
  );
}

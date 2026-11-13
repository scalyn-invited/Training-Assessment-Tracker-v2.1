'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from './auth-ui';
import { ReasonAction, useLeaveGuard } from './learning-controls';
import type { LearningGrading } from '../../../../packages/domain/src/learning-grading';
type Queue = Awaited<ReturnType<LearningGrading['queue']>>;
type Routing = Awaited<ReturnType<LearningGrading['routing']>>;
export function LearningQueue() {
  const { context, error: sessionError, load: loadContext } = useContext(),
    client = context?.client?.id;
  const [data, setData] = useState<Queue | null>(null),
    [error, setError] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!client) return;
    let active = true;
    setError('');
    api<Queue>(`/enrolments/learning-reviews?clientId=${client}&page=${page}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [client, page, retry]);
  return (
    <Guest>
      <Link href="/dashboard">Back to workspace</Link>
      <h1>Learning reviews</h1>
      {!context?.user ? (
        <Pending error={sessionError} retry={loadContext} />
      ) : !client ? (
        <p>
          <Link href="/clients">Choose your client</Link> to view its review queue.
        </p>
      ) : (
        <>
          <p>Review the oldest submitted work first. Provisional grades need a human decision.</p>
          <Feedback error={error} />
          <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
            Refresh review queue
          </button>
          {!data && !error && <p role="status">Loading learning reviews...</p>}
          {data && (
            <section className="panel">
              <h2>Work awaiting your review</h2>
              {!data.records.length ? (
                <p>
                  No work is awaiting your review under your current permissions. Assigned appeals
                  also appear here.
                </p>
              ) : (
                <ul className="file-list">
                  {data.records.map((r) => (
                    <li key={r.id}>
                      <div>
                        <Link href={`/enrolments/${r.enrolmentId}/submissions/${r.id}`}>
                          {r.memberName} / {r.title}
                        </Link>
                        <small>
                          Attempt {r.attempt} / {r.status.replaceAll('_', ' ')}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="form-actions">
                <button
                  className="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous reviews
                </button>
                <span>
                  Page {page} / {data.total} review items
                </span>
                <button
                  className="secondary"
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next reviews
                </button>
              </div>
            </section>
          )}
          <LearningAppealRouting client={client} csrf={context.csrf} />
        </>
      )}
    </Guest>
  );
}
function LearningAppealRouting({ client, csrf }: { client: string; csrf: string }) {
  const [data, setData] = useState<Routing | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    api<Routing>('/enrolments/learning-appeals?clientId=' + client)
      .then((v) => {
        if (active) setData(v);
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
          Retry learning appeal routing
        </button>
      </section>
    );
  if (!data) return <p role="status">Checking appeal routing access...</p>;
  if (!data.canRoute) return null;
  return (
    <section className="panel">
      <h2>Assign learning appeal reviewers</h2>
      <p>
        Routing shows case identifiers and eligible reviewers only. It does not grant access to
        private work or scores.
      </p>
      {!data.appeals.length ? (
        <p>No open learning appeals need routing.</p>
      ) : (
        data.appeals.map((item) => (
          <LearningRoute
            key={item.id}
            item={item}
            client={client}
            csrf={csrf}
            refresh={() => setRetry((n) => n + 1)}
          />
        ))
      )}
    </section>
  );
}
function LearningRoute({
  item,
  client,
  csrf,
  refresh,
}: {
  item: Routing['appeals'][number];
  client: string;
  csrf: string;
  refresh: () => void;
}) {
  const [reviewer, setReviewer] = useState(item.reviewerId ?? ''),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState('');
  useLeaveGuard(dirty);
  return (
    <details>
      <summary style={{ overflowWrap: 'anywhere' }}>Learning case {item.id}</summary>
      <Feedback success={message} />
      {!item.reviewers.length ? (
        <p>
          No eligible independent coordinator is available for this team. A Client Admin must
          arrange an appropriate team role first.
        </p>
      ) : (
        <>
          <label>
            Alternate reviewer
            <select
              aria-label={'Alternate reviewer for ' + item.id}
              value={reviewer}
              onChange={(e) => {
                setReviewer(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">Choose an independent reviewer</option>
              {item.reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <ReasonAction
            label="Assign learning reviewer"
            help="Choose a reviewer and explain the assignment. Access is limited to this case and ends on resolution or role revocation."
            confirm="Assign this independent coordinator to this learning appeal?"
            disabled={!reviewer}
            run={async (reason) => {
              await api(`/enrolments/learning-appeals/${item.id}/route`, {
                csrf,
                clientId: client,
                reviewerId: reviewer,
                reason,
              });
              setDirty(false);
              setMessage('Independent learning reviewer assigned.');
              refresh();
            }}
          />
        </>
      )}
    </details>
  );
}

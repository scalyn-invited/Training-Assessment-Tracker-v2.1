'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest } from './auth-ui';
import { useRouter } from 'next/navigation';
import { Button, Select, Panel, PageHeader, Feedback } from './ui/controls';
import { Pagination } from './ui/directory';
import { registerWorkGuard } from './work-guard';
import layout from './ui/form-layout.module.css';
import styles from './ui/learning-queue.module.css';
import { ReasonAction } from './learning-controls';
import type { LearningGrading } from '../../../../packages/domain/src/learning-grading';
type Queue = Awaited<ReturnType<LearningGrading['queue']>>;
type Routing = Awaited<ReturnType<LearningGrading['routing']>>;
export function LearningQueue() {
  const { context, error: sessionError, load: loadContext } = useContext(),
    client = context?.client?.id;
  const router = useRouter();
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Queue | null>(null),
    [error, setError] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!client) return;
    let active = true;
    setError('');
    setLoading(true);
    api<Queue>(`/enrolments/learning-reviews?clientId=${client}&page=${page}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, page, retry]);
  return (
    <Guest>
      <div className={layout.page}>
        <Link href="/dashboard">Back to workspace</Link>
        <PageHeader title="Learning reviews" />
        {!context?.user ? (
          <>
            <Feedback error={sessionError} />
            {sessionError ? (
              <Button onClick={() => void loadContext()}>Try loading your session again</Button>
            ) : (
              <p role="status">Loading your session...</p>
            )}
          </>
        ) : !client ? (
          <p>
            <Link href="/clients">Choose your client</Link> to view its review queue.
          </p>
        ) : (
          <>
            <p>Review the oldest submitted work first. Provisional grades need a human decision.</p>
            <Feedback error={error} />
            <Button
              className={styles.refresh}
              disabled={loading}
              onClick={() => setRetry((n) => n + 1)}
            >
              Refresh review queue
            </Button>
            {loading && <p role="status">Loading learning reviews...</p>}
            {data && (
              <Panel className={`${layout.panel} ${styles.panel}`}>
                <h2>Work awaiting your review</h2>
                {!data.records.length ? (
                  <p>
                    No work is awaiting your review under your current permissions. Assigned appeals
                    also appear here.
                  </p>
                ) : (
                  <ul className={styles.list}>
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
                <Pagination aria-label="Review queue pages">
                  <Button
                    disabled={loading || data.page === 1}
                    onClick={() => {
                      setPage(data.page - 1);
                      setRetry((n) => n + 1);
                    }}
                  >
                    Previous reviews
                  </Button>
                  <span>
                    Page {data.page} / {data.total} review items
                  </span>
                  <Button
                    disabled={loading || data.page * 20 >= data.total}
                    onClick={() => {
                      setPage(data.page + 1);
                      setRetry((n) => n + 1);
                    }}
                  >
                    Next reviews
                  </Button>
                </Pagination>
              </Panel>
            )}
            <LearningAppealRouting key={client} client={client} csrf={context.csrf} />
          </>
        )}
      </div>
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
  if (!data)
    return error ? (
      <Panel className={layout.panel}>
        <Feedback error={error} />
        <Button onClick={() => setRetry((n) => n + 1)}>Retry learning appeal routing</Button>
      </Panel>
    ) : (
      <p role="status">Checking appeal routing access...</p>
    );
  if (!data.canRoute) return null;
  return (
    <Panel className={`${layout.panel} ${styles.panel}`}>
      <h2>Assign learning appeal reviewers</h2>
      <Feedback error={error} />
      {error && (
        <Button onClick={() => setRetry((n) => n + 1)}>Retry learning appeal routing</Button>
      )}
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
    </Panel>
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
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const saved = useRef(item.reviewerId ?? '');
  useEffect(
    () => registerWorkGuard(() => ({ dirty: reviewer !== saved.current, pending: busy })),
    [reviewer, busy],
  );
  return (
    <details>
      <summary>Learning case {item.id}</summary>
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
            <Select
              disabled={busy}
              aria-label={'Alternate reviewer for ' + item.id}
              value={reviewer}
              onChange={(e) => {
                setReviewer(e.target.value);
                setMessage('');
              }}
            >
              <option value="">Choose an independent reviewer</option>
              {item.reviewers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </label>
          <ReasonAction
            shared
            label="Assign learning reviewer"
            help="Choose a reviewer and explain the assignment. Access is limited to this case and ends on resolution or role revocation."
            confirm="Assign this independent coordinator to this learning appeal?"
            disabled={!reviewer}
            run={async (reason) => {
              setBusy(true);
              try {
                await api(`/enrolments/learning-appeals/${item.id}/route`, {
                  csrf,
                  clientId: client,
                  reviewerId: reviewer,
                  reason,
                });
                saved.current = reviewer;
                setMessage('Independent learning reviewer assigned.');
                refresh();
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
    </details>
  );
}

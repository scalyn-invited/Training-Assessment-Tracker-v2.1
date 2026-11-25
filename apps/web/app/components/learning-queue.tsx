'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest } from './auth-ui';
import { useRouter } from 'next/navigation';
import { Button, Select, Panel, PageHeader, Feedback, Badge } from './ui/controls';
import { DirectoryTable, Pagination } from './ui/directory';
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
        <div className={styles.introduction}>
          <PageHeader title="Review Queue">
            {context?.client
              ? `${context.client.name} · Learning submissions`
              : 'Learning submissions'}
          </PageHeader>
          {context?.user && client && (
            <>
              <div className={styles.notice}>
                <span className={styles.infoIcon} aria-hidden="true" />
                <div>
                  <strong>Review the oldest submitted work first.</strong>
                  <p>Provisional grades need a human decision.</p>
                </div>
              </div>
              <Button
                className={styles.refresh}
                aria-label="Refresh review queue"
                disabled={loading}
                onClick={() => setRetry((n) => n + 1)}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </>
          )}
        </div>
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
            <Feedback error={error} />
            {loading && <p role="status">Loading learning reviews...</p>}
            {data && (
              <Panel
                className={styles.queue}
                aria-labelledby="review-queue-heading"
                aria-busy={loading}
              >
                <h2 id="review-queue-heading" className={styles.queueHeading}>
                  Work awaiting review
                </h2>
                {!data.records.length ? (
                  <p className={styles.empty}>
                    No work is awaiting your review under your current permissions. Assigned appeals
                    also appear here.
                  </p>
                ) : (
                  <DirectoryTable
                    className={styles.table}
                    role="table"
                    aria-label="Work awaiting review"
                  >
                    <thead role="rowgroup">
                      <tr role="row">
                        <th scope="col" role="columnheader">
                          Member
                        </th>
                        <th scope="col" role="columnheader">
                          Learning plan
                        </th>
                        <th scope="col" role="columnheader">
                          Attempt
                        </th>
                        <th scope="col" role="columnheader">
                          Status
                        </th>
                        <th scope="col" role="columnheader">
                          <span className={styles.srOnly}>Open submission</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {data.records.map((r) => (
                        <tr key={r.id} role="row">
                          <td className={styles.member} role="cell">
                            {r.memberName}
                          </td>
                          <td className={styles.plan} role="cell">
                            {r.title}
                          </td>
                          <td className={styles.attempt} role="cell">
                            Attempt {r.attempt}
                          </td>
                          <td className={styles.status} role="cell">
                            <QueueStatus status={r.status} />
                          </td>
                          <td className={styles.action} role="cell">
                            <Link
                              className={styles.open}
                              href={`/enrolments/${r.enrolmentId}/submissions/${r.id}`}
                              aria-label={`Open ${r.memberName} / ${r.title}`}
                            >
                              Open <span className={styles.arrow} aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DirectoryTable>
                )}
                <Pagination className={styles.pagination} aria-label="Review queue pages">
                  <Button
                    variant="ghost"
                    aria-label="Previous reviews"
                    disabled={loading || data.page === 1}
                    onClick={() => {
                      setPage(data.page - 1);
                      setRetry((n) => n + 1);
                    }}
                  >
                    Previous
                  </Button>
                  <div className={styles.pageInfo}>
                    <span>Oldest first · 20 per page</span>
                    <span>
                      Page {data.page} / {data.total} review items
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label="Next reviews"
                    disabled={loading || data.page * 20 >= data.total}
                    onClick={() => {
                      setPage(data.page + 1);
                      setRetry((n) => n + 1);
                    }}
                  >
                    Next
                  </Button>
                </Pagination>
              </Panel>
            )}
            <LearningAppealRouting key={client} client={client} csrf={context.csrf} />
          </>
        )}
        <Link className={styles.back} href="/dashboard">
          Back to workspace
        </Link>
      </div>
    </Guest>
  );
}
function QueueStatus({ status }: { status: string }) {
  const tone =
    status === 'review_pending' ? 'warning' : status === 'technical_failure' ? 'error' : undefined;
  const dot = tone ?? (status === 'submitted' ? 'info' : 'neutral');
  const label = status.replaceAll('_', ' ');
  return (
    <Badge
      tone={tone}
      className={`${styles.badge} ${status === 'submitted' ? styles.submitted : ''}`}
    >
      <span className={styles.dot} data-tone={dot} aria-hidden="true" />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
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

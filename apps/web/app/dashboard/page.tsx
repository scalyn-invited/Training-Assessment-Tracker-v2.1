'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending } from '../components/auth-ui';
import { PageHeader, Panel, Badge, Button, Feedback } from '../components/ui/controls';
import { Pagination } from '../components/ui/directory';
import styles from './overview.module.css';
import { BackgroundReceipts } from '../components/background-receipts';
import { Icon } from '../components/workspace-icon';
type Overview = {
  total: number;
  page: number;
  records: {
    id: string;
    title: string;
    status: string;
    memberName: string;
    groupName: string | null;
    durationWeeks: number;
    dailyMinutes: number;
  }[];
};
export default function Dashboard() {
  const { context, error, load } = useContext(),
    router = useRouter(),
    client = context?.client?.id;
  const [data, setData] = useState<Overview | null>(null),
    [failure, setFailure] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!client) return;
    let current = true;
    setData(null);
    setFailure('');
    api<Overview>('/enrolments?clientId=' + client + '&view=overview&page=' + page)
      .then((row) => {
        if (current) setData(row);
      })
      .catch((e) => {
        if (current) setFailure(e.message);
      });
    return () => {
      current = false;
    };
  }, [client, page, retry]);
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : (
        <div className={styles.page}>
          <div className={styles.welcome}>
            <div>
              <p className="eyebrow">Your development space</p>
              <PageHeader
                title={'Welcome back, ' + context.user.name.split('\u00b7')[0].trim() + '.'}
              >
                A little focus today. A meaningful step forward.
              </PageHeader>
            </div>
            <Badge tone="success">Signed in</Badge>
          </div>
          <Panel className={styles.hero} aria-labelledby="chapter-heading">
            <div>
              <p className="eyebrow">The big picture</p>
              <h2 id="chapter-heading">
                Your next chapter
                <br />
                starts with a baseline.
              </h2>
              <p>
                Understand your starting point, practise with purpose,
                <br className="hero-break" /> and make your progress visible.
              </p>
            </div>
          </Panel>
          <div className={styles.summary}>
            <Panel className={styles.panel} aria-labelledby="account-heading">
              <div className={styles.sectionHeading}>
                <h2 id="account-heading">Your account</h2>
                <span>Client workspace</span>
              </div>
              <dl>
                <div>
                  <dt>Name</dt>
                  <dd>{context.user.name}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>Scoped to the selected client</dd>
                </div>
                <div>
                  <dt>Learning plans</dt>
                  <dd>
                    {data ? data.total + ' ' + (data.total === 1 ? 'plan' : 'plans') : 'Loading...'}
                  </dd>
                </div>
                <div>
                  <dt>Workspace scope</dt>
                  <dd>Programmes in your scope</dd>
                </div>
              </dl>
              <a className={styles.textLink} href="#learning-plans">
                View learning plans <Icon name="arrow" />
              </a>
            </Panel>
            <Panel className={styles.panel} aria-labelledby="journey-heading">
              <div className={styles.sectionHeading}>
                <h2 id="journey-heading">A focused journey</h2>
                <span>01 / 03</span>
              </div>
              <ol className={styles.steps}>
                {[
                  ['Know your starting point', 'Capture a baseline for your chosen skills.'],
                  ['Put learning into practice', 'Turn weekly objectives into evidence.'],
                  ['Reflect on your growth', 'Review your progress with approved evidence.'],
                ].map(([title, copy], i) => (
                  <li key={title}>
                    <span>0{i + 1}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{copy}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>
          <div className={styles.sectionHeading} id="learning-plans">
            <h2>
              <Icon name="book" />
              Training plans in your scope
            </h2>
            {data && (
              <span>
                {data.total} {data.total === 1 ? 'plan' : 'plans'}
              </span>
            )}
          </div>
          <Feedback error={failure} />
          {failure && <Button onClick={() => setRetry((n) => n + 1)}>Retry learning plans</Button>}
          {!data && !failure && <p role="status">Loading your learning plans...</p>}
          {data && (
            <>
              <div className={styles.cards}>
                {data.records.map((record) => (
                  <Link
                    key={record.id}
                    className={styles.planCard}
                    href={'/enrolments/' + record.id}
                  >
                    <div className={styles.cardTop}>
                      <Badge>{record.groupName ?? 'No team'}</Badge>
                      <span className={styles.subtle}>{record.status.replaceAll('_', ' ')}</span>
                    </div>
                    <h3>{record.title}</h3>
                    <p>{record.memberName}</p>
                    <div className={styles.cardBottom}>
                      <span>
                        {record.durationWeeks} weeks / {record.dailyMinutes} min/day
                      </span>
                      <span>
                        View plan <Icon name="arrow" />
                      </span>
                    </div>
                  </Link>
                ))}
                {!data.records.length && (
                  <Panel className={styles.empty}>
                    <Icon name="book" />
                    <h3>No enrolments available</h3>
                    <p>
                      No training plans are currently available to you in this client. Contact your
                      client administrator if you expected access.
                    </p>
                    {page > 1 && <Button onClick={() => setPage(1)}>Return to first page</Button>}
                  </Panel>
                )}
              </div>
              {data.total > 12 && (
                <Pagination aria-label="Learning plan pages">
                  <Button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
                    Previous plans
                  </Button>
                  <span>
                    Page {page} of {Math.ceil(data.total / 12)}
                  </span>
                  <Button disabled={page * 12 >= data.total} onClick={() => setPage((n) => n + 1)}>
                    Next plans
                  </Button>
                </Pagination>
              )}
            </>
          )}
          <p>
            <Link href="/enrolments">Training records</Link>
          </p>
          {client && <BackgroundReceipts client={client} shared />}
        </div>
      )}
    </Guest>
  );
}

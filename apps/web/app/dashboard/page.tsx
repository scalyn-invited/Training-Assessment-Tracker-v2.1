'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
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
        <>
          <div className="page-heading workspace-welcome">
            <div>
              <p className="eyebrow">Your development space</p>
              <h1>
                Welcome back, {context.user.name.split('\u00b7')[0].trim()}
                <span className="welcome-period">.</span>
              </h1>
              <p className="lead">A little focus today. A meaningful step forward.</p>
            </div>
            <span className="signed-in">
              <span className="dot" /> Signed in
            </span>
          </div>
          <section className="workspace-hero" aria-labelledby="chapter-heading">
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
            <div className="growth-orbit" aria-hidden="true">
              <span>&#8599;</span>
            </div>
          </section>
          <div className="workspace-summary">
            <section className="panel account-panel" aria-labelledby="account-heading">
              <div className="section-heading">
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
              <a className="workspace-text-link" href="#learning-plans">
                View learning plans <Icon name="arrow" />
              </a>
            </section>
            <section className="panel journey-panel" aria-labelledby="journey-heading">
              <div className="section-heading">
                <h2 id="journey-heading">A focused journey</h2>
                <span>01 / 03</span>
              </div>
              <ol className="journey-steps">
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
            </section>
          </div>
          <div className="section-heading" id="learning-plans">
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
          {failure && (
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry learning plans
            </button>
          )}
          {!data && !failure && <p role="status">Loading your learning plans...</p>}
          {data && (
            <>
              <div className="cards">
                {data.records.map((record) => (
                  <Link key={record.id} className="plan-card" href={'/enrolments/' + record.id}>
                    <div className="card-top">
                      <span className="badge">{record.groupName ?? 'No team'}</span>
                      <span className="subtle">{record.status.replaceAll('_', ' ')}</span>
                    </div>
                    <h3>{record.title}</h3>
                    <p>{record.memberName}</p>
                    <div className="card-bottom">
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
                  <section className="panel empty-state">
                    <Icon name="book" />
                    <h3>No enrolments available</h3>
                    <p>
                      No training plans are currently available to you in this client. Contact your
                      client administrator if you expected access.
                    </p>
                    {page > 1 && (
                      <button className="secondary" onClick={() => setPage(1)}>
                        Return to first page
                      </button>
                    )}
                  </section>
                )}
              </div>
              {data.total > 12 && (
                <nav className="form-actions" aria-label="Learning plan pages">
                  <button
                    className="secondary"
                    disabled={page === 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Previous plans
                  </button>
                  <span>
                    Page {page} of {Math.ceil(data.total / 12)}
                  </span>
                  <button
                    className="secondary"
                    disabled={page * 12 >= data.total}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next plans
                  </button>
                </nav>
              )}
            </>
          )}
          <p>
            <Link href="/enrolments">Training records</Link>
          </p>
          {client && <BackgroundReceipts client={client} />}
        </>
      )}
    </Guest>
  );
}

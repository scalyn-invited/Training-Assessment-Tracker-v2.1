'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
import { OverviewIcon, type OverviewIconName } from '../components/overview-icon';
import { OverviewDialog } from '../components/overview-dialog';
import styles from './overview.module.css';

type Overview = {
  clients: number;
  activeAdmins: number;
  assignments: number;
  identityMode: string;
  emailConfigured: boolean;
  aiConfigured: boolean;
};
type AuditEvent = {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  operator_reference: string | null;
};
type History = { events: AuditEvent[] };
type Accounts = { total: number };

// A failed audit or account request must not hide the rest of the overview.
function useOverviewResource<T>(route: string, userId?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setData(null);
    setError('');
    if (!userId) return;
    let current = true;
    api<T>(route)
      .then((value) => {
        if (current) setData(value);
      })
      .catch((failure: Error) => {
        if (current) setError(failure.message);
      });
    return () => {
      current = false;
    };
  }, [route, userId, revision]);
  return { data, error, retry: () => setRevision((n) => n + 1) };
}
function Action({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <OverviewIcon name="arrow" />
    </>
  );
}
function Stat({
  title,
  value,
  href,
  icon,
  description,
}: {
  title: string;
  value: ReactNode;
  href: string;
  icon: OverviewIconName;
  description?: string;
}) {
  return (
    <Link href={href} className={styles.stat} aria-label={description ?? title}>
      <span>
        <span className={styles.statLabel}>{title}</span>
        <strong>{value}</strong>
      </span>
      <span className={styles.statIcon}>
        <OverviewIcon name={icon} />
      </span>
    </Link>
  );
}
function Attention({
  icon,
  title,
  children,
  action,
}: {
  icon: OverviewIconName;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className={styles.attentionRow}>
      <span className={styles.warningIcon}>
        <OverviewIcon name={icon} />
      </span>
      <div className={styles.attentionCopy}>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      {action}
    </li>
  );
}
function eventTitle(action: string) {
  const title = action.replace(/[._]/g, ' ');
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export default function PlatformOverview() {
  const { context, error, load } = useContext();
  const router = useRouter();
  const userId = context?.user?.global_admin ? context.user.id : undefined;
  const overview = useOverviewResource<Overview>('/platform/overview', userId);
  const accounts = useOverviewResource<Accounts>('/platform/client-accounts', userId);
  const history = useOverviewResource<History>('/platform/audit', userId);
  const system = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  const data = overview.data;
  const attentionCount = data
    ? Number(data.activeAdmins === 1) + Number(!data.emailConfigured) + Number(!data.aiConfigured)
    : 0;
  const systemAction = (
    <button
      type="button"
      className={styles.textAction}
      onClick={() => system.current?.showModal()}
      aria-haspopup="dialog"
    >
      <Action>View system status</Action>
    </button>
  );
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !context.user.global_admin ? (
        <>
          <h1>Global Admin access required</h1>
          <Link href="/dashboard">Return to workspace</Link>
        </>
      ) : (
        <div className={styles.page}>
          <header className={styles.pageHeader}>
            <h1 aria-label="Platform overview">Overview</h1>
            <p>What needs attention across the platform.</p>
          </header>
          <Feedback error={overview.error} />
          {overview.error && (
            <button className="secondary" onClick={overview.retry}>
              Retry platform overview
            </button>
          )}
          {!data && !overview.error && <p role="status">Loading platform overview...</p>}
          {data && (
            <>
              <div className={styles.metrics} aria-label="Platform summary">
                <Stat
                  title="Clients"
                  value={data.clients}
                  href="/platform/clients"
                  icon="clients-stat"
                  description="Manage clients"
                />
                <Stat
                  title="Global admins"
                  value={data.activeAdmins}
                  href="/platform/admins"
                  icon="admins-stat"
                  description="Review Global Admin access"
                />
                <div className={styles.accountMetric}>
                  <Stat
                    title="Accounts"
                    value={accounts.data ? accounts.data.total : '—'}
                    href="/platform/clients#client-account-access"
                    icon="accounts-stat"
                    description="Accounts — active accounts with active sign-in identities"
                  />
                  {!accounts.data && !accounts.error && (
                    <span className="sr-only" role="status">
                      Loading account count...
                    </span>
                  )}
                  {accounts.error && (
                    <div className={styles.sectionFeedback}>
                      <Feedback error={accounts.error} />
                      <button className="secondary" onClick={accounts.retry}>
                        Retry account count
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {data.clients === 0 && (
                <section className={styles.emptyPanel}>
                  <h2>Create your first client</h2>
                  <p>Add an organisation before inviting people into a learning workspace.</p>
                  <Link className="button primary" href="/platform/clients">
                    Create first client
                  </Link>
                </section>
              )}
              <section className={styles.panel} aria-labelledby="attention-title">
                <div className={styles.panelHeader}>
                  <h2 id="attention-title">Needs attention</h2>
                  <span className={styles.attentionCount}>{attentionCount}</span>
                </div>
                {attentionCount ? (
                  <ul className={styles.attentionList}>
                    {data.activeAdmins === 1 && (
                      <Attention
                        icon="warning"
                        title="Only one active Global Admin"
                        action={
                          <Link className={styles.textAction} href="/platform/admins">
                            <Action>Review access</Action>
                          </Link>
                        }
                      >
                        Add another trusted administrator to maintain access continuity.
                      </Attention>
                    )}
                    {!data.emailConfigured && (
                      <Attention
                        icon="mail"
                        title="Email delivery is not configured"
                        action={systemAction}
                      >
                        Configure the approved mail service and verify a test inbox before enabling
                        delivery.
                      </Attention>
                    )}
                    {!data.aiConfigured && (
                      <Attention
                        icon="ai"
                        title="AI generation is not configured"
                        action={systemAction}
                      >
                        Confirm the approved AI provider and verify a sample request before enabling
                        generation.
                      </Attention>
                    )}
                  </ul>
                ) : (
                  <div className={styles.sectionFeedback}>
                    <p>
                      No configuration notices. Provider delivery and access are not verified here.
                    </p>
                    <button
                      className={styles.textAction}
                      onClick={() => system.current?.showModal()}
                      aria-haspopup="dialog"
                    >
                      <Action>View system status</Action>
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
          <section
            className={styles.panel}
            aria-labelledby="activity-title"
            aria-busy={!history.data && !history.error}
          >
            <div className={`${styles.panelHeader} ${styles.activityHeader}`}>
              <h2 id="activity-title">Recent administrative activity</h2>
              <Link className={styles.textAction} href="/platform/audit">
                <Action>View audit log</Action>
              </Link>
            </div>
            {history.error && (
              <div className={styles.sectionFeedback}>
                <Feedback error={history.error} />
                <button className="secondary" onClick={history.retry}>
                  Retry recent activity
                </button>
              </div>
            )}
            {!history.data && !history.error && (
              <p className={styles.sectionFeedback} role="status">
                Loading recent activity...
              </p>
            )}
            {history.data &&
              (history.data.events.length ? (
                <ul className={styles.activityList}>
                  {history.data.events.slice(0, 3).map((event) => {
                    const date = new Date(event.created_at);
                    const valid = !Number.isNaN(date.valueOf());
                    return (
                      <li className={styles.activityRow} key={event.id}>
                        <time
                          dateTime={valid ? date.toISOString() : undefined}
                          title={valid ? date.toUTCString() : undefined}
                        >
                          {valid ? (
                            <>
                              <span className="sr-only">{date.toISOString().slice(0, 10)} </span>
                              {date.toISOString().slice(11, 19)} UTC
                            </>
                          ) : (
                            'Time unavailable'
                          )}
                        </time>
                        <span>{eventTitle(event.action)}</span>
                        <span className={styles.actor}>
                          {event.actor_name ??
                            (event.operator_reference
                              ? `Operator: ${event.operator_reference}`
                              : 'System')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.sectionFeedback}>No administrative activity recorded yet.</p>
              ))}
          </section>
          <OverviewDialog dialogRef={system} titleId="system-status-title">
            <div className={styles.dialogHeader}>
              <h2 id="system-status-title">System overview</h2>
              <button type="button" className="secondary" onClick={() => system.current?.close()}>
                Close
              </button>
            </div>
            {data && (
              <>
                <p>
                  {data.clients} clients / {data.assignments} current Global Admin assignments
                </p>
                <dl>
                  <div>
                    <dt>Identity connection</dt>
                    <dd>
                      {data.identityMode === 'local_password'
                        ? 'Password sign-in'
                        : data.identityMode === 'mock'
                          ? 'Local mock sign-in'
                          : 'External identity configuration required'}
                    </dd>
                  </div>
                  <div>
                    <dt>External email delivery</dt>
                    <dd>
                      {data.emailConfigured
                        ? 'Configured; delivery not verified here'
                        : 'Email is not configured'}
                    </dd>
                  </div>
                  <div>
                    <dt>Live AI</dt>
                    <dd>
                      {data.aiConfigured
                        ? 'Configured; provider access not verified here'
                        : 'AI generation is not configured'}
                    </dd>
                  </div>
                </dl>
                <p>Owner: Technical administrator. Credentials are managed outside this screen.</p>
              </>
            )}
          </OverviewDialog>
        </div>
      )}
    </Guest>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending } from './auth-ui';
import { Button, Panel, PageHeader, Badge, Feedback } from './ui/controls';
import controls from './ui/controls.module.css';
import layout from './ui/form-layout.module.css';
import styles from './ui/training-record.module.css';
import { BackgroundReceipts } from './background-receipts';
import { EnrolmentEvidence } from './enrolment-evidence';
type RecordView =
  | { id: string; title: string; status: string; canDetails: false }
  | {
      id: string;
      title: string;
      status: string;
      canDetails: true;
      version: number;
      memberName: string;
      coordinatorName: string | null;
      groupName: string | null;
      durationWeeks: number;
      dailyMinutes: number;
      timezone: string;
      syncPolicy: string;
      canManage: boolean;
      canUpload: boolean;
      hasCurriculum: boolean;
    };
export function EnrolmentRecord({ id }: { id: string }) {
  const { context, error, load } = useContext(),
    router = useRouter(),
    client = context?.client?.id;
  const [record, setRecord] = useState<RecordView | null>(null),
    [failure, setFailure] = useState(''),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState(''),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0),
    [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!client) return;
    let current = true;
    setRecord(null);
    setFailure('');
    api<RecordView>(`/enrolments/${id}?clientId=${client}`)
      .then((row) => {
        if (current) setRecord(row);
      })
      .catch((e) => {
        if (current) setFailure(e.message);
      });
    return () => {
      current = false;
    };
  }, [id, client, retry]);
  async function check() {
    if (!context || !client || !record?.canDetails || busy) return;
    setBusy(true);
    setActionError('');
    setMessage('');
    try {
      await api(`/enrolments/${id}/check`, {
        csrf: context.csrf,
        clientId: client,
        version: record.version,
        key,
      });
      setKey(crypto.randomUUID());
      setMessage('Check queued. Its receipt will appear below when the worker completes it.');
      setRevision((n) => n + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !client ? (
        <>
          <PageHeader title="Choose a client" />
          <Link href="/clients">Choose your client</Link>
        </>
      ) : !record ? (
        <>
          <Feedback error={failure} />
          {failure ? (
            <Button onClick={() => setRetry((n) => n + 1)}>Retry training record</Button>
          ) : (
            <p role="status">Loading training record...</p>
          )}
        </>
      ) : !record.canDetails ? (
        <Panel className={layout.panel}>
          <PageHeader title={record.title} />
          <p>Status: {record.status}</p>
          <p>
            Your team access permits this training summary. Detailed records and review actions
            require separate authority.
          </p>
          <Link href="/dashboard">Back to workspace</Link>
        </Panel>
      ) : (
        <div className={layout.page}>
          <Link href="/dashboard">Back to workspace</Link>
          <nav className={layout.actions} aria-label="Training record actions">
            <Link
              className={controls.button + ' ' + controls.primary}
              href={`/enrolments/${id}/delivery`}
            >
              Today and learning plan
            </Link>
            {record.canUpload && (
              <Link
                className={controls.button + ' ' + controls.secondary}
                href={`/enrolments/${id}/onboarding`}
              >
                Onboarding and plan setup
              </Link>
            )}
            {record.hasCurriculum && (
              <Link href={`/enrolments/${id}/plan`}>View curriculum and versions</Link>
            )}
          </nav>
          <div className={styles.heading}>
            <div>
              <p className="eyebrow">{record.groupName ?? 'No team'}</p>
              <PageHeader title={record.title}>
                {record.memberName} / Coordinator: {record.coordinatorName ?? 'Not assigned'}
              </PageHeader>
            </div>
            <Badge>{record.status}</Badge>
          </div>
          <div className={styles.grid}>
            <Panel className={layout.panel} aria-label="Plan foundation">
              <h2>Plan foundation</h2>
              <dl className={styles.facts}>
                <div>
                  <dt>Duration</dt>
                  <dd>{record.durationWeeks} weeks</dd>
                </div>
                <div>
                  <dt>Daily capacity</dt>
                  <dd>{record.dailyMinutes} minutes</dd>
                </div>
                <div>
                  <dt>Calendar timezone</dt>
                  <dd>{record.timezone}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{record.version}</dd>
                </div>
                <div>
                  <dt>Primary-platform sync</dt>
                  <dd>{record.syncPolicy.replaceAll('_', ' ')}</dd>
                </div>
              </dl>
              <div className={styles.notice}>
                Open Today and learning plan for lessons, saved work and reviewed results.
                Provisional AI output requires a coordinator decision.
              </div>
              <h3>Check background processing</h3>
              <p>
                Queue a local check to verify that your access is rechecked before a receipt is
                recorded. No email is sent.
              </p>
              <Feedback error={actionError} success={message} />
              <div className={layout.actions}>
                <Button disabled={busy} aria-busy={busy} onClick={() => void check()}>
                  {busy ? 'Queuing check...' : 'Queue foundation check'}
                </Button>
                {actionError && (
                  <Button disabled={busy} onClick={() => setRetry((n) => n + 1)}>
                    Reload training record
                  </Button>
                )}
              </div>
            </Panel>
            <EnrolmentEvidence
              key={client + id}
              id={id}
              client={client}
              csrf={context.csrf}
              canUpload={record.canUpload}
              canManage={record.canManage}
            />
          </div>
          <BackgroundReceipts key={client} client={client} revision={revision} />
        </div>
      )}
    </Guest>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from './auth-ui';
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
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : !record ? (
        <>
          <Feedback error={failure} />
          {failure ? (
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry training record
            </button>
          ) : (
            <p role="status">Loading training record...</p>
          )}
        </>
      ) : !record.canDetails ? (
        <section className="panel">
          <h1>{record.title}</h1>
          <p>Status: {record.status}</p>
          <p>
            Your team access permits this training summary. Detailed records and review actions
            require separate authority.
          </p>
          <Link href="/dashboard">Back to workspace</Link>
        </section>
      ) : (
        <>
          <Link className="back" href="/dashboard">
            Back to workspace
          </Link>
          <nav className="form-actions" aria-label="Training record actions">
            <Link className="button primary" href={`/enrolments/${id}/delivery`}>
              Today and learning plan
            </Link>
            {record.canUpload && (
              <Link className="button secondary" href={`/enrolments/${id}/onboarding`}>
                Onboarding and plan setup
              </Link>
            )}
            {record.hasCurriculum && (
              <Link href={`/enrolments/${id}/plan`}>View curriculum and versions</Link>
            )}
          </nav>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{record.groupName ?? 'No team'}</p>
              <h1>{record.title}</h1>
              <p className="lead">
                {record.memberName} / Coordinator: {record.coordinatorName ?? 'Not assigned'}
              </p>
            </div>
            <span className="badge">{record.status}</span>
          </div>
          <div className="detail-grid">
            <section className="panel">
              <h2>Plan foundation</h2>
              <dl>
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
              <div className="notice">
                Open Today and learning plan for lessons, saved work and reviewed results.
                Provisional AI output requires a coordinator decision.
              </div>
              <h3>Check background processing</h3>
              <p>
                Queue a local check to verify that your access is rechecked before a receipt is
                recorded. No email is sent.
              </p>
              <Feedback error={actionError} success={message} />
              <div className="form-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() => void check()}
                >
                  {busy ? 'Queuing check...' : 'Queue foundation check'}
                </button>
                {actionError && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRetry((n) => n + 1)}
                  >
                    Reload training record
                  </button>
                )}
              </div>
            </section>
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
        </>
      )}
    </Guest>
  );
}

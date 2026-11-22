'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './auth-ui';
import { Button, Select, Textarea, Panel, Feedback } from './ui/controls';
import { registerWorkGuard } from './work-guard';
import layout from './ui/form-layout.module.css';
import styles from './ui/assessment-directory.module.css';
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
  if (error && !data)
    return (
      <Panel className={`${layout.panel} ${styles.panel}`}>
        <Feedback error={error} />
        <Button onClick={() => setRetry((n) => n + 1)}>Retry appeal routing</Button>
      </Panel>
    );
  if (!data) return <p role="status">Loading appeal routing...</p>;
  if (!data.canRoute || !data.appeals.length) return null;
  return (
    <Panel className={`${layout.panel} ${styles.panel}`}>
      <h2>Assign alternate reviewers</h2>
      <Feedback error={error} />
      {error && <Button onClick={() => setRetry((n) => n + 1)}>Retry appeal routing</Button>}
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
    </Panel>
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
  const pending = useRef(false);
  const saved = useRef({ reviewer: item.reviewerId ?? '', reason: '' });
  const dirty = useRef(false);
  dirty.current = reviewer !== saved.current.reviewer || reason !== saved.current.reason;
  useEffect(
    () => registerWorkGuard(() => ({ dirty: dirty.current, pending: pending.current })),
    [],
  );
  return (
    <details>
      <summary>Case {item.id}</summary>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            pending.current ||
            !window.confirm('Assign this coordinator to review this assessment case?')
          )
            return;
          pending.current = true;
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
            saved.current = { reviewer, reason };
            setMessage('Alternate reviewer assigned.');
            refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      >
        <Feedback error={error} success={message} />
        <label>
          Reviewer
          <Select
            aria-label={'Reviewer for ' + item.id}
            required
            value={reviewer}
            onChange={(e) => {
              setReviewer(e.target.value);
              setMessage('');
            }}
            disabled={busy}
          >
            <option value="">Choose an eligible coordinator</option>
            {item.reviewers.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </label>
        {!item.reviewers.length && (
          <p>No eligible alternate coordinator is currently available for this team.</p>
        )}
        <label>
          Assignment reason
          <Textarea
            aria-label={'Assignment reason for ' + item.id}
            required
            minLength={8}
            maxLength={2000}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setMessage('');
            }}
            disabled={busy}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !item.reviewers.length}
          aria-busy={busy}
        >
          {busy ? 'Assigning reviewer...' : 'Assign alternate reviewer'}
        </Button>
      </form>
    </details>
  );
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from './auth-ui';
type Rule = {
  id: string;
  group_id: string;
  active: boolean;
  version: number;
  result: string | null;
  checked_at: string | null;
};
type Data = {
  definition: { id: string; title: string; revision: number };
  members: { id: string; name: string; title: string }[];
  teams: { id: string; name: string; eligibleCount: number }[];
  rules: Rule[];
};
export function AssignmentForm({ definition }: { definition: string }) {
  const { context, error, load } = useContext();
  const [data, setData] = useState<Data | null>(null),
    [failure, setFailure] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<'member' | 'team'>('member'),
    [search, setSearch] = useState(''),
    [target, setTarget] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [retry, setRetry] = useState(0);
  const client = context?.client?.id;
  useEffect(() => {
    if (!client) return;
    let active = true;
    setFailure('');
    setData(null);
    api<Data>(
      '/assessments/assignment-options?' + new URLSearchParams({ clientId: client, definition }),
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setFailure(e.message);
      });
    return () => {
      active = false;
    };
  }, [client, definition, retry]);
  async function refresh() {
    setData(
      await api<Data>(
        '/assessments/assignment-options?' + new URLSearchParams({ clientId: client!, definition }),
      ),
    );
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || !client || busy) return;
    setBusy(true);
    setFailure('');
    setMessage('');
    try {
      await api('/assessments/assignments', {
        csrf: context.csrf,
        clientId: client,
        definition,
        mode,
        target,
        confirmed,
      });
      setMessage(
        mode === 'team'
          ? 'Team assignment rule is active. Existing work is preserved.'
          : 'Assessment assigned to the selected member record.',
      );
      setConfirmed(false);
      await refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(rule: Rule, action: 'stop' | 'resume' | 'retry') {
    if (!context || busy) return;
    setBusy(true);
    setFailure('');
    setMessage('');
    try {
      await api('/assessments/team-rules', {
        csrf: context.csrf,
        clientId: client,
        id: rule.id,
        version: rule.version,
        action,
      });
      setMessage(
        action === 'stop'
          ? 'Future assignments stopped. Existing assignments are preserved.'
          : action === 'resume'
            ? 'Future assignments resumed.'
            : 'Assignment processing checked.',
      );
      await refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const matches = data
    ? (mode === 'member'
        ? data.members.map((m) => ({ id: m.id, label: m.name + ' · ' + m.title }))
        : data.teams.map((t) => ({
            id: t.id,
            label: t.name + ' · ' + t.eligibleCount + ' eligible member records now',
          }))
      ).filter((r) => r.label.toLowerCase().includes(search.toLowerCase()))
    : [];
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !client ? (
        <>
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <>
          <Link href="/assessments">Back to assessments</Link>
          <h1>Assign assessment</h1>
          <Feedback error={failure} success={message} />
          {!data ? (
            failure ? (
              <button className="secondary" onClick={() => setRetry((r) => r + 1)}>
                Retry assignment options
              </button>
            ) : (
              <p role="status">Loading eligible recipients…</p>
            )
          ) : (
            <>
              <p>
                <strong>{data.definition.title}</strong> · Published revision{' '}
                {data.definition.revision}
              </p>
              <form className="panel" onSubmit={assign}>
                <fieldset disabled={busy}>
                  <legend>Choose recipients</legend>
                  <label htmlFor="assignment-mode">Assign to</label>
                  <select
                    id="assignment-mode"
                    value={mode}
                    onChange={(e) => {
                      setMode(e.target.value as 'member' | 'team');
                      setTarget('');
                      setConfirmed(false);
                      setSearch('');
                    }}
                  >
                    <option value="member">Individual member</option>
                    <option value="team">Team — current and future eligible members</option>
                  </select>
                  <label htmlFor="recipient-search">Search recipients</label>
                  <input
                    id="recipient-search"
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setTarget('');
                      setConfirmed(false);
                    }}
                  />
                  <label htmlFor="assignment-target">
                    {mode === 'member' ? 'Member record' : 'Team'}
                  </label>
                  <select
                    id="assignment-target"
                    required
                    value={target}
                    onChange={(e) => {
                      setTarget(e.target.value);
                      setConfirmed(false);
                    }}
                  >
                    <option value="">
                      Choose a {mode === 'member' ? 'member record' : 'team'}
                    </option>
                    {matches.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <p role="status">{matches.length} matching recipients.</p>
                  {mode === 'member' ? (
                    <p>
                      A member needs an eligible enrolment, a primary coordinator allocation and
                      that coordinator&apos;s sensitive-assessment grant. Ask your client
                      administrator to check these settings if the member is missing.
                    </p>
                  ) : (
                    <p>
                      Current eligible members are assigned now. Future eligible members receive
                      this same revision on the next scheduler run. A newer published revision will
                      not change this rule or existing assignments.
                    </p>
                  )}
                  <label className="correct-choice">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      required
                    />
                    I confirm assignment of revision {data.definition.revision} to the selected
                    recipient. For a team, this includes future eligible members.
                  </label>
                  <button className="primary" disabled={busy || !target}>
                    {busy ? 'Assigning…' : 'Assign assessment'}
                  </button>
                </fieldset>
              </form>
              <section className="panel">
                <h2>Your team assignment rules</h2>
                <p>
                  Stopping future assignments keeps existing work intact. Active rules are checked
                  every minute.
                </p>
                {!data.rules.length ? (
                  <p>
                    No team rules yet. Choose Team above to assign this revision to current and
                    future eligible members.
                  </p>
                ) : (
                  data.rules.map((rule) => (
                    <article key={rule.id}>
                      <h3>
                        {data.teams.find((t) => t.id === rule.group_id)?.name ??
                          'Team no longer available'}
                      </h3>
                      <p>
                        {rule.active ? 'Active' : 'Stopped'} · Revision {data.definition.revision}
                      </p>
                      <p>{rule.result ?? 'Waiting for processing.'}</p>
                      <p>
                        Last checked:{' '}
                        {rule.checked_at
                          ? new Date(rule.checked_at).toLocaleString()
                          : 'Not yet checked'}
                      </p>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => change(rule, rule.active ? 'stop' : 'resume')}
                      >
                        {rule.active ? 'Stop future assignments' : 'Resume future assignments'}
                      </button>{' '}
                      {rule.active && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => change(rule, 'retry')}
                        >
                          Retry processing
                        </button>
                      )}
                    </article>
                  ))
                )}
              </section>
            </>
          )}
        </>
      )}
    </Guest>
  );
}

'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest } from './auth-ui';
import { useWorkGuard } from './use-work-guard';
import { Button, Input, Select, PageHeader, Feedback, Badge } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/assignment-form.module.css';
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
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null),
    [failure, setFailure] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState<string | null>(null),
    [savedSelection, setSavedSelection] = useState(''),
    [refreshFailure, setRefreshFailure] = useState(''),
    [refreshing, setRefreshing] = useState(false),
    [mode, setMode] = useState<'member' | 'team'>('member'),
    [search, setSearch] = useState(''),
    [target, setTarget] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [retry, setRetry] = useState(0);
  const client = context?.client?.id;
  const selection = mode + ':' + target;
  useWorkGuard({
    dirty: confirmed || Boolean(target && selection !== savedSelection),
    pending: Boolean(busy),
  });
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user || !client) return;
    let active = true;
    setFailure('');
    setData(null);
    setTarget('');
    setConfirmed(false);
    setSearch('');
    setSavedSelection('');
    setMessage('');
    setRefreshFailure('');
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
  }, [context?.user?.id, client, definition, retry]);
  async function refresh() {
    setRefreshing(true);
    setRefreshFailure('');
    try {
      const next = await api<Data>(
        '/assessments/assignment-options?' + new URLSearchParams({ clientId: client!, definition }),
      );
      setData(next);
      setFailure('');
    } catch (e) {
      setRefreshFailure((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!context || !client || busy || refreshing) return;
    setBusy('assign');
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
      setSavedSelection(selection);
      await refresh();
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function change(rule: Rule, action: 'stop' | 'resume' | 'retry') {
    if (!context || !client || busy || refreshing) return;
    setBusy(rule.id + action);
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
      setBusy(null);
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
      <div className={layout.page}>
        {!context?.user ? (
          <>
            <PageHeader title="Assign assessment" />
            <Feedback error={error} />
            {error ? (
              <Button onClick={() => void load()}>Try loading your session again</Button>
            ) : (
              <p role="status">Loading your session...</p>
            )}
          </>
        ) : !client ? (
          <>
            <PageHeader title="Choose a client" />
            <Link href="/clients">Choose your client</Link>
          </>
        ) : (
          <>
            <Link href="/assessments">Back to assessments</Link>
            <PageHeader title="Assign assessment" />
            <Feedback error={failure} success={message} />
            <Feedback error={refreshFailure} />
            {data && (failure || refreshFailure) && (
              <div>
                <Button disabled={Boolean(busy) || refreshing} onClick={() => void refresh()}>
                  {refreshing ? 'Refreshing options…' : 'Retry assignment options'}
                </Button>
              </div>
            )}
            {!data ? (
              failure ? (
                <Button variant="secondary" onClick={() => setRetry((r) => r + 1)}>
                  Retry assignment options
                </Button>
              ) : (
                <p role="status">Loading eligible recipients…</p>
              )
            ) : (
              <>
                <p>
                  <strong>{data.definition.title}</strong> · Published revision{' '}
                  {data.definition.revision}
                </p>
                <form className={`${layout.panel} ${styles.form}`} onSubmit={assign}>
                  <fieldset disabled={Boolean(busy) || refreshing}>
                    <legend>Choose recipients</legend>
                    <label htmlFor="assignment-mode">Assign to</label>
                    <Select
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
                    </Select>
                    <label htmlFor="recipient-search">Search recipients</label>
                    <Input
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
                    <Select
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
                    </Select>
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
                        this same revision on the next scheduler run. A newer published revision
                        will not change this rule or existing assignments.
                      </p>
                    )}
                    <label className={styles.confirmation}>
                      <Input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                        required
                      />
                      I confirm assignment of revision {data.definition.revision} to the selected
                      recipient. For a team, this includes future eligible members.
                    </label>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={Boolean(busy) || refreshing || !target}
                    >
                      {busy === 'assign' ? 'Assigning…' : 'Assign assessment'}
                    </Button>
                  </fieldset>
                </form>
                <section className={layout.panel}>
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
                      <article key={rule.id} className={styles.rule}>
                        <h3>
                          {data.teams.find((t) => t.id === rule.group_id)?.name ??
                            'Team no longer available'}
                        </h3>
                        <p>
                          <Badge tone={rule.active ? 'success' : undefined}>
                            {rule.active ? 'Active' : 'Stopped'}
                          </Badge>{' '}
                          · Revision {data.definition.revision}
                        </p>
                        <p>{rule.result ?? 'Waiting for processing.'}</p>
                        <p>
                          Last checked:{' '}
                          {rule.checked_at
                            ? new Date(rule.checked_at).toLocaleString()
                            : 'Not yet checked'}
                        </p>
                        <div className={layout.actions}>
                          <Button
                            variant="secondary"
                            disabled={Boolean(busy) || refreshing}
                            onClick={() => change(rule, rule.active ? 'stop' : 'resume')}
                          >
                            {busy === rule.id + 'stop'
                              ? 'Stopping future assignments…'
                              : busy === rule.id + 'resume'
                                ? 'Resuming future assignments…'
                                : rule.active
                                  ? 'Stop future assignments'
                                  : 'Resume future assignments'}
                          </Button>
                          {rule.active && (
                            <Button
                              variant="secondary"
                              disabled={Boolean(busy) || refreshing}
                              onClick={() => change(rule, 'retry')}
                            >
                              {busy === rule.id + 'retry'
                                ? 'Checking assignment processing…'
                                : 'Retry processing'}
                            </Button>
                          )}
                        </div>
                      </article>
                    ))
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </Guest>
  );
}

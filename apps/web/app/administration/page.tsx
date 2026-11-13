'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  PromotionPerson,
  PromotionLedger,
  type PromotionPersonData,
} from '../components/promotions';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
type Person = PromotionPersonData & {
  id: string;
  version: number;
  permission_version: number;
  user_id: string;
  name: string;
  email: string;
  active: boolean;
  origin: string;
  sync_policy: string;
};
type Group = { id: string; name: string; kind: string; origin: string };
type Role = {
  id: string;
  client_membership_id: string;
  role: string;
  group_id: string | null;
  scope_type: string;
};
type Team = { id: string; client_membership_id: string; group_id: string };
import { EnrolmentForm } from '../components/enrolment-form';
import { Allocations, type AllocationData } from '../components/allocations';
type Data = AllocationData & {
  people: Person[];
  groups: Group[];
  roles: Role[];
  teams: Team[];
  total: number;
  page: number;
};
export default function Administration() {
  const { context, error, load } = useContext(),
    router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Data | null>(null),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [failure, setFailure] = useState(''),
    [actionError, setActionError] = useState(''),
    [stale, setStale] = useState(false),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [person, setPerson] = useState<Person | null>(null),
    [ending, setEnding] = useState(false);
  const client = context?.client?.id;
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!client || !context?.canAdmin) return;
    let cancelled = false;
    setFailure('');
    setData(null);
    api<Data>(
      '/clients/administration?' +
        new URLSearchParams({ clientId: client, search, page: String(page) }),
    )
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [client, context?.canAdmin, search, page, revision]);
  useEffect(() => {
    if (person) dialog.current?.showModal();
  }, [person]);
  function close() {
    dialog.current?.close();
    setPerson(null);
    setEnding(false);
    setActionError('');
    setStale(false);
  }
  async function act(
    event: FormEvent<HTMLFormElement>,
    route: string,
    fields: Record<string, unknown> = {},
    inside = true,
  ) {
    event.preventDefault();
    if (!client || !context || busy || (inside && stale)) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setActionError('');
    setFailure('');
    setSuccess('');
    const payload: Record<string, unknown> = {
      csrf: context.csrf,
      clientId: client,
      reason: String(values.get('reason')),
      ...fields,
      ...(inside && person ? { expectedAccountVersion: person.permission_version } : {}),
    };
    if (route === 'groups') {
      payload.name = String(values.get('name'));
      payload.kind = 'team';
    }
    if (route === 'teams/membership') {
      payload.teamId = String(values.get('team'));
      payload.join = values.get('change') === 'join';
    }
    if (route === 'roles/grant') {
      payload.role = String(values.get('role'));
      payload.teamId = String(values.get('team')) || null;
    }
    try {
      await api('/clients/' + route, payload);
      setSuccess('Client administration updated. Affected sessions have ended.');
      if (inside) close();
      else form.reset();
      setRevision((n) => n + 1);
      load();
    } catch (e) {
      if (inside && (e as Error & {code?: string}).code === 'account_version_conflict') setStale(true);
      if (inside) setActionError((e as Error).message);
      else setFailure((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const reason = (
    <label>
      Reason
      <input name="reason" required minLength={8} maxLength={2000} />
    </label>
  );
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !client ? (
        <>
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : !context.canAdmin ? (
        <>
          <h1>Client administration permission required</h1>
          <Link href="/dashboard">Return to workspace</Link>
        </>
      ) : (
        <>
          <p className="eyebrow">{context.client?.name}</p>
          <h1>People and programme administration</h1>
          <p>
            Create internal teams and assign responsibility. Administrative access does not reveal
            submission bodies.
          </p>
          <p>
            <Link href="/dashboard">Workspace</Link> ·{' '}
            <Link href="/accounts">Add account or invite an existing member</Link> |{' '}
            <Link href="/settings/ai">AI provider settings</Link>
          </p>
          <Feedback error={failure} success={success} />
          {failure && (
            <button className="secondary" onClick={() => setRevision((n) => n + 1)}>
              Retry directory
            </button>
          )}
          {context.authMode === 'mock' && <LocalPersonForm key={'local-person:' + client} client={client} csrf={context.csrf}
            onCreated={() => { setPage(1); setSearch(''); setRevision(n => n + 1); }} />}
          <section className="panel">
            <h2>Create internal team</h2>
            <form onSubmit={(e) => act(e, 'groups', {}, false)}>
              <label>
                Team name
                <input name="name" required maxLength={160} />
              </label>
              {reason}
              <button className="secondary" disabled={busy}>
                {busy ? 'Saving…' : 'Create internal team'}
              </button>
            </form>
          </section>
          <section className="panel directory-panel">
            <h2>People and assignments</h2>
            <form
              className="directory-filters directory-search-filters"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(String(new FormData(e.currentTarget).get('search')));
                setPage(1);
                setRevision((n) => n + 1);
              }}
            >
              <label>
                Search name or email
                <input name="search" type="search" maxLength={120} />
              </label>
              <button className="primary" disabled={!data}>
                Search people
              </button>
            </form>
            {!data && !failure && <p role="status">Loading client people and assignments…</p>}
            {data && (
              <>
                <p role="status">{data.total} matching people</p>
                <div className="directory-table-wrap">
                  <table className="directory-table">
                    <caption className="sr-only">People and assignments</caption>
                    <thead>
                      <tr>
                        {['Person', 'Status', 'Profile', 'Actions'].map((label) => (
                          <th scope="col" key={label}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.people.map((p) => (
                        <tr key={p.id}>
                          <td data-label="Person">
                            <strong>{p.name}</strong>
                            <small>{p.email}</small>
                          </td>
                          <td data-label="Status">{p.active ? 'Active' : 'Inactive'}</td>
                          <td data-label="Profile">{p.sync_policy.replaceAll('_', ' ')}</td>
                          <td data-label="Actions">
                            <button
                              className="secondary"
                              onClick={() => {
                                setActionError('');
                                setEnding(false);
                                setPerson(p);
                              }}
                            >
                              Manage assignments
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!data.people.length && (
                        <tr>
                          <td colSpan={4}>No people match this search.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="People pages">
                  <button
                    className="secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Previous people
                  </button>
                  <span> Page {page} </span>
                  <button
                    className="secondary"
                    disabled={page * 20 >= data.total}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next people
                  </button>
                </nav>
              </>
            )}
          </section>
          {data && (
            <Allocations
              data={data}
              clientId={client}
              csrf={context.csrf}
              refresh={() => {
                setRevision((n) => n + 1);
                load();
              }}
            />
          )}
          <EnrolmentForm key={client} client={client!} csrf={context.csrf} />
          <PromotionLedger key={client + String(revision)} client={client!} csrf={context.csrf} />
          <dialog
            ref={dialog}
            className="workspace-dialog"
            aria-labelledby="person-title"
            onCancel={(event) => {
              if (busy) event.preventDefault();
              else close();
            }}
          >
            {person && data && (
              <>
                <h2 id="person-title">{person.name}</h2>
                <p>
                  {person.email} · {context.client?.name}
                </p>
                <button type="button" className="secondary" onClick={close} disabled={busy}>
                  Close
                </button>
                <Feedback error={actionError} />
                {stale && <button type="button" className="secondary" onClick={() => { close(); setRevision(n => n + 1); }}>Refresh directory and review again</button>}
                <h3>Team membership</h3>
                <p>
                  Current teams:{' '}
                  {data.teams
                    .filter((t) => t.client_membership_id === person.id)
                    .map(
                      (t) =>
                        data.groups.find((g) => g.id === t.group_id)?.name ?? 'Unavailable team',
                    )
                    .join(', ') || 'None'}
                </p>
                {data.groups.some(g => g.kind === 'team' && g.origin === 'manual') ? (
                  <form onSubmit={(e) => act(e, 'teams/membership', { memberId: person.id })}>
                    <label>
                      Team
                      <select name="team" required>
                        {data.groups
                          .filter((g) => g.kind === 'team' && g.origin === 'manual')
                          .map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Change
                      <select name="change">
                        <option value="join">Assign</option>
                        <option value="leave">Remove</option>
                      </select>
                    </label>
                    {reason}
                    <button className="secondary" disabled={busy || stale}>
                      Update team membership
                    </button>
                  </form>
                ) : (
                  <p>Create an internal team first.</p>
                )}
                <details>
                  <summary>Roles and coordinator responsibility</summary>
                  <form onSubmit={(e) => act(e, 'roles/grant', { memberId: person.id })}>
                    <label>
                      Role
                      <select name="role">
                        <option value="member">Member</option>
                        <option value="coordinator">Coordinator</option>
                        {context.user?.global_admin && <option value="admin">Client Admin</option>}
                      </select>
                    </label>
                    <label>
                      Role scope
                      <select name="team">
                        <option value="">Client</option>
                        {data.groups
                          .filter((g) => g.kind === 'team')
                          .map((g) => (
                            <option value={g.id} key={g.id}>
                              {g.name} — coordinator only
                            </option>
                          ))}
                      </select>
                    </label>
                    {reason}
                    <button className="secondary" disabled={busy || stale}>
                      Grant role
                    </button>
                  </form>
                  {data.roles
                    .filter((r) => r.client_membership_id === person.id)
                    .map((role) => (
                      <details key={role.id}>
                        <summary>
                          {role.role} —{' '}
                          {role.group_id
                            ? data.groups.find((g) => g.id === role.group_id)?.name
                            : 'Client'}
                        </summary>
                        <p>Revocation ends this role and dependent coordinator authority.</p>
                        <form onSubmit={(e) => act(e, 'roles/revoke', { id: role.id })}>
                          {reason}
                          <button
                            className="danger"
                            disabled={
                              busy || stale || (role.role === 'admin' && !context.user?.global_admin)
                            }
                          >
                            Revoke role
                          </button>
                        </form>
                      </details>
                    ))}
                </details>
                <PromotionPerson
                  key={person.user_id}
                  person={person}
                  client={client!}
                  csrf={context.csrf}
                  onSaved={(message) => {
                    close();
                    setSuccess(message);
                    setRevision((value) => value + 1);
                  }}
                />
                {person.origin === 'manual' && person.user_id !== context.user?.id && (
                  <>
                    <button className="danger" disabled={busy || stale} onClick={() => setEnding(true)}>
                      End client membership
                    </button>
                    {ending && (
                      <form
                        onSubmit={(e) =>
                          act(e, 'membership/end', { memberId: person.id, version: person.version })
                        }
                      >
                        <h3>End membership for {person.name}?</h3>
                        <p>
                          This ends client roles, team membership and dependent access. Rejoining
                          will not restore historical permissions.
                        </p>
                        {reason}
                        <button className="danger" disabled={busy || stale}>
                          Confirm membership end
                        </button>{' '}
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy || stale}
                          onClick={() => setEnding(false)}
                        >
                          Keep membership
                        </button>
                      </form>
                    )}
                  </>
                )}
              </>
            )}
          </dialog>
        </>
      )}
    </Guest>
  );
}

function LocalPersonForm({ client, csrf, onCreated }: { client: string; csrf: string; onCreated: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget, values = new FormData(form);
    setBusy(true); setError(''); setSuccess('');
    try {
      await api('/clients/people', { csrf, clientId: client, name: String(values.get('name')),
        email: String(values.get('email')), role: String(values.get('role')),
        synthetic: values.get('synthetic') === 'yes', reason: String(values.get('reason')) });
      setSuccess(`${String(values.get('name'))} was added to this client.`);
      form.reset(); onCreated();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="panel">
    <summary>Add a local person</summary>
    <p>Create a Member or Coordinator in this client. Real local-only people receive no sign-in identity.
      Synthetic test people can use simulated sign-in and must use an example.invalid email.</p>
    <form aria-label="Add a local person" onSubmit={create} aria-busy={busy}>
      <fieldset disabled={busy}>
        <label>Name<input name="name" autoComplete="name" required maxLength={120} /></label>
        <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={200} /></label>
        <fieldset><legend>Client role</legend><div className="choices">
          <label><input type="radio" name="role" value="member" defaultChecked /> Member</label>
          <label><input type="radio" name="role" value="coordinator" /> Coordinator</label>
        </div></fieldset>
        <fieldset><legend>Person type</legend><div className="choices">
          <label><input type="radio" name="synthetic" value="no" defaultChecked /> Real local-only person</label>
          <label><input type="radio" name="synthetic" value="yes" /> Synthetic test person</label>
        </div></fieldset>
        <label>Reason<input name="reason" required minLength={8} maxLength={2000} /></label>
        <Feedback error={error} success={success} />
        <button className="primary" disabled={busy}>{busy ? 'Adding person...' : 'Add person'}</button>
      </fieldset>
    </form>
  </details>;
}

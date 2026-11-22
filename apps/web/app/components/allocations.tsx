'use client';
import { Select, Input, Button, Panel, Feedback } from './ui/controls';
import styles from './ui/form-layout.module.css';
import { DirectoryTable } from './ui/directory';

import { useState, type FormEvent } from 'react';
import { api } from './auth-ui';
export type AllocationData = {
  candidates: { id: string; name: string; email: string; coordinator: boolean; member: boolean }[];
  allocations: {
    id: string;
    kind: string;
    member_name: string;
    coordinator_name: string;
    sensitive: boolean;
  }[];
  canGrantSensitive: boolean;
};
export function Allocations({
  data,
  clientId,
  csrf,
  refresh,
}: {
  data: AllocationData;
  clientId: string;
  csrf: string;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  async function submit(
    event: FormEvent<HTMLFormElement>,
    route: string,
    fields: Record<string, unknown> = {},
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api('/clients/' + route, {
        clientId,
        csrf,
        reason: String(values.get('reason')),
        ...(route === 'allocations'
          ? {
              memberId: String(values.get('member')),
              coordinatorId: String(values.get('coordinator')),
              kind: String(values.get('kind')),
            }
          : fields),
      });
      form.reset();
      setSuccess('Allocation access updated. Affected sessions have ended.');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel className={styles.panel}>
      <h2>Coordinator allocations and sensitive access</h2>
      <p>
        A coordinator allocation establishes responsibility. Sensitive access requires a separate
        grant from a different Client Admin and does not grant approval authority.
      </p>
      <Feedback error={error} success={success} />
      <details>
        <summary>Allocate a coordinator</summary>
        <form onSubmit={(e) => submit(e, 'allocations')}>
          <label>
            Member
            <Select name="member" required defaultValue="">
              <option value="" disabled>
                Choose a member
              </option>
              {data.candidates
                .filter((p) => p.member)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.email}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            Coordinator
            <Select name="coordinator" required defaultValue="">
              <option value="" disabled>
                Choose a coordinator
              </option>
              {data.candidates
                .filter((p) => p.coordinator)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.email}
                  </option>
                ))}
            </Select>
          </label>
          <label>
            Responsibility
            <Select name="kind">
              <option value="primary">Primary</option>
              <option value="backup">Backup</option>
            </Select>
          </label>
          <label>
            Allocation reason
            <Input name="reason" required minLength={8} maxLength={2000} />
          </label>
          <Button type="submit" variant="secondary" disabled={busy} aria-busy={busy}>
            {busy ? 'Saving allocation…' : 'Create allocation'}
          </Button>
        </form>
      </details>
      {!data.canGrantSensitive && (
        <p>An explicit Client Admin role is required to change sensitive access.</p>
      )}
      {!data.allocations.length ? (
        <p>
          No current coordinator allocations. Allocate a coordinator to establish responsibility.
        </p>
      ) : (
        <div className={styles.tableWrap}>
          <DirectoryTable stacked className={styles.table}>
            <caption className="sr-only">Current coordinator allocations</caption>
            <thead>
              <tr>
                {['Member', 'Coordinator', 'Responsibility', 'Sensitive access', 'Actions'].map(
                  (s) => (
                    <th scope="col" key={s}>
                      {s}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.allocations.map((a) => (
                <tr key={a.id}>
                  <td data-label="Member">{a.member_name}</td>
                  <td data-label="Coordinator">{a.coordinator_name}</td>
                  <td data-label="Responsibility">{a.kind}</td>
                  <td data-label="Sensitive access">{a.sensitive ? 'Granted' : 'Not granted'}</td>
                  <td data-label="Actions">
                    <details>
                      <summary>Review allocation</summary>
                      <p>
                        {a.coordinator_name} → {a.member_name}
                      </p>
                      {data.canGrantSensitive && (
                        <form
                          onSubmit={(e) =>
                            submit(e, 'sensitive', { allocationId: a.id, grant: !a.sensitive })
                          }
                        >
                          <label>
                            Sensitive access reason
                            <Input name="reason" required minLength={8} maxLength={2000} />
                          </label>
                          <label>
                            <Input type="checkbox" required /> I have checked the coordinator and
                            member.
                          </label>
                          <Button
                            type="submit"
                            variant={a.sensitive ? 'danger' : 'secondary'}
                            disabled={busy}
                          >
                            {a.sensitive ? 'Revoke sensitive access' : 'Grant sensitive access'}
                          </Button>
                        </form>
                      )}
                      <form onSubmit={(e) => submit(e, 'allocations/end', { id: a.id })}>
                        <p>Ending this allocation also ends its sensitive-access grant.</p>
                        <label>
                          End allocation reason
                          <Input name="reason" required minLength={8} maxLength={2000} />
                        </label>
                        <label>
                          <Input type="checkbox" required /> End responsibility for this member.
                        </label>
                        <Button type="submit" variant="danger" disabled={busy}>
                          Confirm allocation end
                        </Button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </DirectoryTable>
        </div>
      )}
    </Panel>
  );
}

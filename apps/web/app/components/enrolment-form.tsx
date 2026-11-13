'use client';
import { useEffect, useState, useRef, type FormEvent } from 'react';
import { api, Feedback } from './auth-ui';
type Person = { id: string; name: string };
type Choices = { members: Person[]; coordinators: Person[]; teams: Person[] };
type Draft = {
  memberId: string;
  coordinatorId: string;
  groupId: string | null;
  title: string;
  reason: string;
};
export function EnrolmentForm({ client, csrf }: { client: string; csrf: string }) {
  const [choices, setChoices] = useState<Choices | null>(null),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [revision, setRevision] = useState(0);
  const form = useRef<HTMLFormElement>(null),
    review = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let current = true;
    setChoices(null);
    setError('');
    api<Choices>('/enrolments/choices?clientId=' + client)
      .then((d) => {
        if (current) setChoices(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [client, revision]);
  useEffect(() => {
    if (draft) review.current?.focus();
  }, [draft]);
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError('');
    setSuccess('');
    setDraft({
      memberId: String(fields.get('memberId')),
      coordinatorId: String(fields.get('coordinatorId')),
      groupId: fields.get('groupId') === 'none' ? null : String(fields.get('groupId')),
      title: String(fields.get('title')).trim(),
      reason: String(fields.get('reason')).trim(),
    });
  }
  async function create() {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/enrolments', { ...draft, clientId: client, csrf });
      setSuccess(
        'Training record created for ' +
          choices?.members.find((m) => m.id === draft.memberId)?.name +
          '. Status: onboarding.',
      );
      setDraft(null);
      form.current?.reset();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-labelledby="enrolment-heading">
      <h2 id="enrolment-heading">Create a training record</h2>
      <p>
        Select the member, their primary coordinator and team. Sensitive assessment access is
        granted separately.
      </p>
      <Feedback error={error} success={success} />
      {!choices ? (
        error ? (
          <button type="button" className="secondary" onClick={() => setRevision((r) => r + 1)}>
            Retry enrolment choices
          </button>
        ) : (
          <p role="status">Loading eligible people and teams…</p>
        )
      ) : choices.members.length === 0 || choices.coordinators.length === 0 ? (
        <p>Add an active member and coordinator before creating a training record.</p>
      ) : (
        <>
          <form ref={form} onSubmit={prepare} hidden={Boolean(draft)}>
            <label htmlFor="enrolment-member">Training member</label>
            <select id="enrolment-member" name="memberId" required defaultValue="">
              <option value="" disabled>
                Choose a member
              </option>
              {choices.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <label htmlFor="enrolment-coordinator">Primary coordinator</label>
            <select id="enrolment-coordinator" name="coordinatorId" required defaultValue="">
              <option value="" disabled>
                Choose a coordinator
              </option>
              {choices.coordinators.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <label htmlFor="enrolment-team">Team</label>
            <select id="enrolment-team" name="groupId" required defaultValue="">
              <option value="" disabled>
                Choose a team or no team
              </option>
              <option value="none">No team</option>
              {choices.teams.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <label htmlFor="enrolment-title">Training title</label>
            <input id="enrolment-title" name="title" required maxLength={160} />
            <label htmlFor="enrolment-reason">Reason for creating this record</label>
            <textarea id="enrolment-reason" name="reason" required minLength={8} maxLength={2000} />
            <button className="primary">Review training record</button>
          </form>
          {draft && (
            <div>
              <h3 ref={review} tabIndex={-1}>
                Review training record
              </h3>
              <dl>
                <dt>Member</dt>
                <dd>{choices.members.find((m) => m.id === draft.memberId)?.name}</dd>
                <dt>Primary coordinator</dt>
                <dd>{choices.coordinators.find((m) => m.id === draft.coordinatorId)?.name}</dd>
                <dt>Team</dt>
                <dd>
                  {draft.groupId
                    ? choices.teams.find((m) => m.id === draft.groupId)?.name
                    : 'No team'}
                </dd>
                <dt>Training title</dt>
                <dd>{draft.title}</dd>
                <dt>Reason</dt>
                <dd>{draft.reason}</dd>
              </dl>
              <p>
                This creates an onboarding record. If the member has a different primary
                coordinator, replace that allocation explicitly first.
              </p>
              <button type="button" className="primary" onClick={create} disabled={busy}>
                {busy ? 'Creating record…' : 'Create training record'}
              </button>{' '}
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(null);
                  setError('');
                  requestAnimationFrame(() => form.current?.querySelector('select')?.focus());
                }}
              >
                Back to edit
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

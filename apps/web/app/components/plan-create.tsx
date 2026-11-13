'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, Feedback } from './auth-ui';
export function PlanCreate({
  id,
  client,
  csrf,
  version,
  plan,
  canManage,
  preview,
  onDirty,
}: {
  onDirty: (dirty: boolean) => void;
  id: string;
  client: string;
  csrf: string;
  version: number;
  plan: { version: number; state: string } | null;
  canManage: boolean;
  preview: { days: number; minutes: number } | null;
}) {
  const router = useRouter(),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const dirty = useRef(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  async function create() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ version: number }>(`/enrolments/${id}/plan/create`, {
        clientId: client,
        csrf,
        version: plan?.version ?? 0,
        onboardingVersion: version,
        reason,
      });
      dirty.current = false;
      onDirty(false);
      router.push(`/enrolments/${id}/plan?version=${result.version}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <hr />
      <h3>Create a curriculum draft</h3>
      {preview && (
        <p className="notice">
          Budget estimate using the confirmed shared calendar: {preview.days} scheduled days ·{' '}
          {preview.minutes} minutes ({(preview.minutes / 60).toFixed(1)} hours). All reading,
          practice, assessment and revision must fit this budget.
        </p>
      )}
      <p>
        Refreshing uses the saved inputs and confirmed calendar. Existing lessons are copied by
        block/day position for explicit review; approved history remains preserved.
      </p>
      <Feedback error={error} />
      {canManage && version > 0 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label>
            Draft creation or rescheduling reason
            <input
              required
              minLength={8}
              maxLength={2000}
              value={reason}
              disabled={busy}
              onChange={(e) => {
                dirty.current = Boolean(e.target.value);
                onDirty(dirty.current);
                setReason(e.target.value);
              }}
            />
          </label>
          <button className="primary" disabled={busy} aria-busy={busy}>
            {busy
              ? 'Creating curriculum draft…'
              : plan
                ? 'Create refreshed draft'
                : 'Create curriculum draft'}
          </button>
        </form>
      )}
      {plan && (
        <p>
          <Link href={`/enrolments/${id}/plan`}>Open curriculum · version {plan.version}</Link>
        </p>
      )}
    </>
  );
}

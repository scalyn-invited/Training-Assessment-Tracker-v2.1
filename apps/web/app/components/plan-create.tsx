'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from './auth-ui';
import { Button, Input, Feedback } from './ui/controls';
import styles from './ui/onboarding.module.css';
import recordStyles from './ui/training-record.module.css';
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
  // Onboarding owns the shared leave guard through onDirty.
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
      <hr className={styles.divider} />
      <h3>Create a curriculum draft</h3>
      {preview && (
        <p className={recordStyles.notice}>
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
            <Input
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
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
            {busy
              ? 'Creating curriculum draft…'
              : plan
                ? 'Create refreshed draft'
                : 'Create curriculum draft'}
          </Button>
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

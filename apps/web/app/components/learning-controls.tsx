'use client';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Feedback } from './ui/controls';
import { registerWorkGuard } from './work-guard';
export function ReasonAction({
  label,
  help,
  confirm,
  run,
  primary = false,
  disabled = false,
}: {
  label: string;
  help: string;
  confirm: string;
  run: (reason: string) => Promise<void>;
  primary?: boolean;
  disabled?: boolean;
}) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  const dirty = useRef(false);
  dirty.current = !!reason;
  useEffect(
    () => registerWorkGuard(() => ({ dirty: dirty.current, pending: pending.current })),
    [],
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (disabled || pending.current || !window.confirm(confirm)) return;
        pending.current = true;
        setBusy(true);
        setError('');
        try {
          await run(reason);
          setReason('');
        } catch (e) {
          setError((e as Error).message);
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <p>{help}</p>
      <label>
        {label} reason
        <Input
          required
          minLength={8}
          maxLength={2000}
          value={reason}
          disabled={busy || disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Feedback error={error} />
      <Button
        type="submit"
        variant={primary ? 'primary' : 'secondary'}
        disabled={busy || disabled}
        aria-busy={busy}
      >
        {busy ? 'Saving decision...' : label}
      </Button>
    </form>
  );
}

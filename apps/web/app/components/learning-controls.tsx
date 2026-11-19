'use client';
import { useEffect, useRef, useState } from 'react';
import { Feedback } from './auth-ui';
import { Button, Input, Feedback as SharedFeedback } from './ui/controls';
import { registerWorkGuard } from './work-guard';
export function useLeaveGuard(changed: boolean, enabled = true) {
  const dirty = useRef(changed);
  dirty.current = changed;
  useEffect(() => {
    if (!enabled) return;
    let leaving = false;
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current && !leaving) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a');
      if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || !dirty.current)
        return;
      if (!window.confirm('Leave with unsaved changes? Save or copy your work first.')) {
        e.preventDefault();
        e.stopPropagation();
      } else leaving = true;
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', click, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', click, true);
    };
  }, [enabled]);
  return dirty;
}
export function ReasonAction({
  label,
  help,
  confirm,
  run,
  primary = false,
  disabled = false,
  shared = false,
}: {
  label: string;
  help: string;
  confirm: string;
  run: (reason: string) => Promise<void>;
  primary?: boolean;
  disabled?: boolean;
  shared?: boolean;
}) {
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef(false);
  useLeaveGuard(!!reason || busy, !shared);
  const dirty = useRef(false);
  dirty.current = !!reason;
  useEffect(
    () =>
      shared
        ? registerWorkGuard(() => ({ dirty: dirty.current, pending: pending.current }))
        : undefined,
    [shared],
  );
  const Field = shared ? Input : 'input';
  const Action = shared ? Button : 'button';
  const Message = shared ? SharedFeedback : Feedback;
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
        <Field
          required
          minLength={8}
          maxLength={2000}
          value={reason}
          disabled={busy || disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Message error={error} />
      <Action
        type="submit"
        {...(shared
          ? { variant: primary ? ('primary' as const) : ('secondary' as const) }
          : { className: primary ? 'primary' : 'secondary' })}
        disabled={busy || disabled}
        aria-busy={busy}
      >
        {busy ? 'Saving decision...' : label}
      </Action>
    </form>
  );
}

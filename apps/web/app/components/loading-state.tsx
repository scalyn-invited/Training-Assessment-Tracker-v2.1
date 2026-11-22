'use client';
import { useEffect, useState } from 'react';
import styles from './ui/loading-state.module.css';

/** Presentation only: callers retain authority, request lifetime and recovery. */
export function LoadingState({
  label = 'Loading your session',
  message = 'Checking your session. This is taking longer than usual.',
}: {
  label?: string;
  message?: string;
}) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className={styles.loading} data-loading-state>
      <div role="status" aria-label={label} aria-live="polite">
        <span className={styles.spinner} data-loading-spinner aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </div>
      <p className={styles.context} data-loading-context hidden={!slow}>
        {message}
      </p>
    </div>
  );
}

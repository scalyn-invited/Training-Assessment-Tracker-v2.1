'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { PageHeader } from './ui/controls';
import tokens from './ui/tokens.module.css';
import styles from './ui/recovery.module.css';

// A fallback must render without the session, navigation or branding requests that may have failed.
// Inherit the document's resolved theme/palette without changing personal or client preferences.
export function RecoveryFrame({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children: ReactNode;
}) {
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus();
  }, []);
  return (
    <main
      id="main"
      ref={main}
      tabIndex={-1}
      className={`${tokens.theme} ${styles.page}`}
      data-recovery-page
    >
      <div className={styles.content}>
        <PageHeader title={title}>{message}</PageHeader>
        <div className={styles.actions}>{children}</div>
      </div>
    </main>
  );
}

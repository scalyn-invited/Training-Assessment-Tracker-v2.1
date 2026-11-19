'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemePicker, type Brand } from './brand-header';
import { Button, Feedback } from './ui/controls';
import tokens from './ui/tokens.module.css';
import styles from './ui/guest.module.css';

export function GuestShell({
  children,
  signIn,
  brand,
  error,
  storageKey,
  reload,
}: {
  children: ReactNode;
  signIn: boolean;
  brand: Brand | null;
  error: string;
  storageKey: string;
  reload: () => void;
}) {
  const name = brand?.mode === 'cerebru' ? 'Cerebru' : (brand?.displayName ?? 'Training Tracker');
  return (
    <div
      className={`${tokens.theme} ${styles.shell} ${signIn ? styles.signIn : styles.linkShell}`}
      data-guest-shell={signIn ? 'sign-in' : 'account-link'}
    >
      <header className={styles.brandPanel}>
        <Link href="/login" className={styles.brand}>
          {brand?.logo ? (
            <img src={brand.logo} alt="" width={36} height={36} />
          ) : (
            <span className={styles.monogram} aria-hidden="true">
              {name.slice(0, 1)}
            </span>
          )}
          <span>
            <strong>{name}</strong>
            <small>{brand?.appName ?? 'Assessment Training Tracker'}</small>
          </span>
        </Link>
        {signIn && (
          <div className={styles.intro}>
            <p>Learning with purpose.</p>
            <p>Progress with evidence.</p>
            <span>Sign in to continue to your workspace.</span>
          </div>
        )}
      </header>
      <div className={styles.content}>
        <div className={styles.toolbar}>
          <ThemePicker brand={brand} storageKey={storageKey} reload={reload} />
        </div>
        {error && (
          <div className={styles.brandError}>
            <Feedback error={error} />
            <Button onClick={reload}>Retry appearance</Button>
          </div>
        )}
        <main id="main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
        <footer className={styles.footer}>
          {signIn
            ? (brand?.appName ?? 'Assessment Training Tracker')
            : 'Learning with purpose. Progress with evidence.'}
        </footer>
      </div>
    </div>
  );
}

export function GuestPending({
  error,
  retry,
  message = 'Loading your session...',
}: {
  error?: string;
  retry: () => void;
  message?: string;
}) {
  return error ? (
    <div className={styles.stack}>
      <Feedback error={error} />
      <Button onClick={retry}>Try loading again</Button>
    </div>
  ) : (
    <p role="status">{message}</p>
  );
}

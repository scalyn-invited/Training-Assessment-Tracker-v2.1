'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { Panel } from './ui/controls';
import controls from './ui/controls.module.css';
import styles from './ui/setup.module.css';

export const installationSteps = [
  'Requirements',
  'Database',
  'Administrator',
  'Review',
  'Install',
  'Done',
];

export function SetupFrame({
  title,
  label,
  step,
  steps = installationSteps,
  complete = false,
  busy = false,
  children,
}: {
  title: string;
  label: string;
  step: number;
  steps?: readonly string[];
  complete?: boolean;
  busy?: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <div className={styles.page} data-setup-page>
      <ol className={styles.stepper} aria-label="Installation steps">
        {steps.map((name, index) => (
          <li
            key={name}
            aria-current={index === step ? 'step' : undefined}
            data-completed={index < step || complete}
          >
            <span className={styles.stepNumber} aria-hidden="true">
              {index < step || complete ? (
                <img src="/setup/step-check.svg" width={16} height={16} alt="" />
              ) : (
                index + 1
              )}
            </span>
            <span>{name}</span>
          </li>
        ))}
      </ol>
      <Panel className={`${styles.card} ${complete ? styles.complete : ''}`} aria-busy={busy}>
        <header className={styles.heading}>
          {complete && (
            <span className={styles.completeIcon}>
              <img src="/setup/complete.svg" alt="" width={26} height={26} />
            </span>
          )}
          <p className={styles.eyebrow}>{label}</p>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
        </header>
        {children}
      </Panel>
    </div>
  );
}

export function SetupNotice({
  children,
  shield = false,
}: {
  children: ReactNode;
  shield?: boolean;
}) {
  return (
    <div className={styles.callout}>
      <img src={shield ? '/setup/shield.svg' : '/auth/info.svg'} width={18} height={18} alt="" />
      <p>{children}</p>
    </div>
  );
}

export function SetupSignIn() {
  return (
    <Link className={`${controls.button} ${controls.primary} ${styles.signIn}`} href="/login">
      Continue to sign in
      <img src="/setup/arrow.svg" width={18} height={18} alt="" />
    </Link>
  );
}

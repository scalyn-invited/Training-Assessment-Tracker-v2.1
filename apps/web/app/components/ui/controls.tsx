import Link from 'next/link';
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import styles from './controls.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
function classes(...names: (string | undefined)[]) {
  return names.filter(Boolean).join(' ');
}

// Native attributes (including type, disabled, aria-busy and ref) remain caller-owned.
export function Button({
  variant = 'secondary',
  type = 'button',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button {...props} type={type} className={classes(styles.button, styles[variant], className)} />
  );
}

export function PageHeader({
  title,
  titleLabel,
  children,
}: {
  title: string;
  titleLabel?: string;
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <h1 aria-label={titleLabel}>{title}</h1>
      {children && <p>{children}</p>}
    </header>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={classes(styles.panel, className)} />;
}

export function Badge({
  tone,
  className,
  ...props
}: ComponentProps<'span'> & { tone?: 'warning' | 'success' | 'error' }) {
  return <span {...props} className={classes(styles.badge, tone && styles[tone], className)} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={classes(styles.input, className)} />;
}
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={classes(styles.input, className)} />;
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea {...props} className={classes(styles.input, className)} />;
}

export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p className={classes(styles.feedback, styles.error)} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={classes(styles.feedback, styles.success)} role="status">
          {success}
        </p>
      )}
    </>
  );
}

// These are route links, not in-page ARIA tabpanels. Preserve browser history and native navigation.
export function RouteTabs({
  label,
  items,
}: {
  label: string;
  items: readonly { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

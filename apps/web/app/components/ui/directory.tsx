import type { ComponentProps } from 'react';
import styles from './directory.module.css';

// Native table markup is supplied by each feature, including caption, headers,
// sort state and labeled cells. No data projection or column is hidden by this component.
export function DirectoryTable({
  className,
  stacked = false,
  ...props
}: ComponentProps<'table'> & { stacked?: boolean }) {
  return (
    <table
      {...props}
      className={[styles.table, stacked && styles.stacked, className].filter(Boolean).join(' ')}
    />
  );
}

// Callers keep their own paging conditions, URL transitions, numbers and pending controls.
export function Pagination({ className, ...props }: ComponentProps<'nav'>) {
  return <nav {...props} className={[styles.pagination, className].filter(Boolean).join(' ')} />;
}

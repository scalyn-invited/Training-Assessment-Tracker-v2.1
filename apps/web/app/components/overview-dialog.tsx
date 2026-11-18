'use client';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import styles from '../platform/overview.module.css';

export function OverviewDialog({
  dialogRef,
  titleId,
  children,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  titleId: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  function keepFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href],button:not(:disabled),summary,[tabindex="0"]',
      ),
    ).filter(
      (element) =>
        element.getClientRects().length &&
        (!element.closest('details:not([open])') || element.tagName === 'SUMMARY'),
    );
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onKeyDown={keepFocus}
      onClose={onClose}
    >
      {children}
    </dialog>
  );
}

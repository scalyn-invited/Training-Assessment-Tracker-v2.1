'use client';
import type { ComponentProps, KeyboardEvent, RefObject } from 'react';
import styles from './controls.module.css';

export function Dialog({
  dialogRef,
  titleId,
  className,
  onKeyDown,
  children,
  ...props
}: Omit<ComponentProps<'dialog'>, 'ref' | 'aria-labelledby'> & {
  dialogRef: RefObject<HTMLDialogElement | null>;
  titleId: string;
}) {
  function keepFocus(event: KeyboardEvent<HTMLDialogElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Tab') return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href],button,input,select,textarea,summary,[tabindex], [contenteditable="true"]',
      ),
    ).filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(':disabled') &&
        !element.closest('[inert]') &&
        element.getClientRects().length &&
        (!element.closest('details:not([open])') || element.tagName === 'SUMMARY'),
    );
    const first = items[0];
    const last = items.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <dialog
      {...props}
      ref={dialogRef}
      className={[styles.dialog, className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onKeyDown={keepFocus}
    >
      {children}
    </dialog>
  );
}

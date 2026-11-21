'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from '../platform/overview.module.css';

/** Non-modal navigation: native links keep their normal Tab and guarded-click behaviour. */
export function WorkspacePopover({
  triggerContent,
  children,
}: {
  triggerContent: ReactNode;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const pointerOpened = useRef(false);
  const id = useId();
  const [open, setOpen] = useState(false);
  function position() {
    if (!panel.current || !trigger.current) return;
    if (!trigger.current.getClientRects().length) {
      panel.current.hidePopover();
      return;
    }
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth,
      height = viewport?.height ?? window.innerHeight;
    const gap = 8;
    const panelWidth = Math.min(Math.max(rect.width, 224), width - gap * 2);
    const above = Math.max(0, rect.top - top - gap * 2);
    const below = Math.max(0, top + height - rect.bottom - gap * 2);
    const useAbove = above > below;
    panel.current.style.width = `${panelWidth}px`;
    panel.current.style.maxHeight = `${useAbove ? above : below}px`;
    panel.current.style.left = `${Math.max(left + gap, Math.min(rect.left, left + width - panelWidth - gap))}px`;
    const panelHeight = panel.current.getBoundingClientRect().height;
    panel.current.style.top = `${Math.max(top + gap, Math.min(useAbove ? rect.top - gap - panelHeight : rect.bottom + gap, top + height - panelHeight - gap))}px`;
  }
  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    viewport?.addEventListener('resize', position);
    viewport?.addEventListener('scroll', position);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      viewport?.removeEventListener('resize', position);
      viewport?.removeEventListener('scroll', position);
    };
  }, [open]);
  return (
    <div className={styles.workspace}>
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={id}
        onPointerDown={() => {
          pointerOpened.current = Boolean(panel.current?.matches(':popover-open'));
        }}
        onClick={(event) => {
          const wasOpen =
            event.detail > 0 ? pointerOpened.current : panel.current?.matches(':popover-open');
          if (wasOpen) close();
          else {
            panel.current?.showPopover();
            position();
            panel.current?.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
          }
        }}
      >
        {triggerContent}
      </button>
      <nav
        ref={panel}
        id={id}
        popover="auto"
        className={styles.workspaceMenu}
        aria-label="Choose workspace"
        onToggle={(event) => {
          setOpen(event.newState === 'open');
          const focused = document.activeElement as HTMLElement | null;
          if (
            event.newState === 'closed' &&
            (!focused ||
              focused === document.body ||
              (focused.tabIndex < 0 &&
                !focused.isContentEditable &&
                !focused.matches('input,textarea,select,button,a[href]')))
          )
            trigger.current?.focus({ preventScroll: true });
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) panel.current?.hidePopover();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        {children}
      </nav>
    </div>
  );
}

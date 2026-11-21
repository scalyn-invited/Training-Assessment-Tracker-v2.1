'use client';
import { useEffect, useLayoutEffect, useState, useRef, useId, type ReactNode } from 'react';
import pickerStyles from './ui/theme-picker.module.css';
import { usePathname } from 'next/navigation';
import { themes } from '../../../../packages/domain/src/theme';
import { Icon } from './workspace-icon';
import {
  appearanceKey,
  paletteProperties,
  savedTheme,
  sharedAppearance,
  type Brand,
} from './appearance-state';
import { useInitialAppearance } from './appearance-provider';
export type { Brand } from './appearance-state';
export function useBrand(account: string | null = 'guest', clientId: string | null = null) {
  const pathname = usePathname();
  const initial = useInitialAppearance();
  const initialMatches =
    initial?.pathname === pathname && (account === null || initial.account === account);
  const shared = sharedAppearance(
    pathname,
    account === null && initialMatches ? initial.clientId : clientId,
  );
  const identity = account ?? (initialMatches ? initial.account : null);
  const key = JSON.stringify([pathname, identity, shared ? null : clientId]);
  const [state, setState] = useState(() => ({
    key,
    brand: initialMatches ? initial.brand : null,
    error:
      initialMatches && initial?.brandingUnavailable
        ? 'Appearance is unavailable. Retry appearance.'
        : '',
  }));
  const [retry, setRetry] = useState(0);
  const bootstrap = useRef(true);
  const storageKey = appearanceKey(identity ?? 'guest');
  // Forget authority on the render that changes scope, including A -> B -> A
  // before B resolves. Matching an older key is not a new authority generation.
  if (state.key !== key) setState({ key, brand: null, error: '' });
  // Never render authority belonging to a previous route, account or client.
  const brand = state.key === key ? state.brand : null;
  const error = state.key === key ? state.error : '';
  useLayoutEffect(() => {
    let current = true,
      sequence = 0;
    function apply(data: Brand) {
      setState({ key, brand: savedTheme(data, identity!, shared), error: '' });
    }
    async function refresh() {
      const request = ++sequence;
      try {
        const response = await fetch('/api/branding/current?shared=' + (shared ? '1' : '0'), {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('Appearance could not be loaded. Retry appearance.');
        const data = (await response.json()) as Brand;
        if (current && request === sequence) apply(data);
      } catch (e) {
        if (current && request === sequence)
          setState((previous) => ({
            key,
            brand: previous.key === key ? previous.brand : null,
            error:
              document.documentElement.dataset.appearanceFallback === 'platform-dark'
                ? 'Appearance is unavailable. Retry appearance.'
                : 'Appearance could not be loaded. Retry appearance.',
          }));
      }
    }
    if (bootstrap.current && initialMatches && initial?.brand && retry === 0) {
      bootstrap.current = false;
      apply(initial.brand);
    } else if (account !== null) {
      bootstrap.current = false;
      void refresh();
    }
    window.addEventListener('brandingchanged', refresh);
    return () => {
      current = false;
      window.removeEventListener('brandingchanged', refresh);
    };
  }, [key, account, retry]);
  // Async responses only publish tagged state. Palette and content commit before paint.
  useLayoutEffect(() => {
    if (!brand) return;
    const root = document.documentElement;
    for (const [property, value] of Object.entries(paletteProperties(brand)))
      root.style.setProperty(property, value);
    root.dataset.theme = brand.selectedTheme;
    delete root.dataset.appearanceFallback;
  }, [brand]);
  return {
    brand,
    error,
    shared,
    storageKey,
    documentRecovery: Boolean(initialMatches && !initial?.brand),
    reload: () => setRetry((n) => n + 1),
  };
}
export function ThemePicker({
  brand,
  client,
  csrf,
  storageKey,
  reload,
  icon,
}: {
  brand: Brand | null;
  client?: string;
  csrf?: string;
  storageKey: string;
  reload: () => void;
  icon?: ReactNode;
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pointerOpened = useRef(false);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  function positionMenu() {
    if (!menu.current || !trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0,
      top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const gap = 8;
    const panelWidth = Math.min(Math.max(rect.width, 224), width - gap * 2);
    const above = Math.max(0, rect.top - top - gap * 2);
    const below = Math.max(0, top + height - rect.bottom - gap * 2);
    const useAbove = above > below;
    const panel = menu.current;
    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = `${Math.max(0, useAbove ? above : below)}px`;
    panel.style.left = `${Math.max(left + gap, Math.min(rect.left, left + width - panelWidth - gap))}px`;
    const panelHeight = panel.getBoundingClientRect().height;
    panel.style.top = `${Math.max(top + gap, Math.min(useAbove ? rect.top - gap - panelHeight : rect.bottom + gap, top + height - panelHeight - gap))}px`;
  }
  function closeMenu() {
    menu.current?.hidePopover();
    trigger.current?.focus({ preventScroll: true });
  }
  function openMenu() {
    menu.current?.showPopover();
    positionMenu();
    (
      menu.current?.querySelector<HTMLElement>('button[aria-pressed="true"]:not(:disabled)') ??
      menu.current?.querySelector<HTMLElement>('button:not(:disabled)')
    )?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (!open) return;
    const viewport = window.visualViewport;
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    viewport?.addEventListener('resize', positionMenu);
    viewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      viewport?.removeEventListener('resize', positionMenu);
      viewport?.removeEventListener('scroll', positionMenu);
    };
  }, [open]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  useLayoutEffect(() => {
    if (open) positionMenu();
  }, [open, busy, error]);
  async function choose(theme: string | null) {
    if (!brand || busy) return;
    // Retain focus in the overlay while its option buttons are disabled.
    menu.current?.focus({ preventScroll: true });
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (client && csrf) {
        const response = await fetch('/api/branding/preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            csrf,
            clientId: client,
            version: brand.preferenceVersion ?? 0,
            theme,
          }),
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.message ?? 'Theme could not be saved. Reload appearance and try again.',
          );
      } else {
        try {
          theme === null
            ? localStorage.removeItem(storageKey)
            : localStorage.setItem(storageKey, theme);
        } catch {
          throw new Error(
            'This browser could not save your theme. Allow browser storage and try again.',
          );
        }
      }
      window.dispatchEvent(new Event('brandingchanged'));
      setMessage('Theme preference saved.');
      closeMenu();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="theme-picker">
        <button
          type="button"
          className={pickerStyles.trigger}
          ref={trigger}
          aria-expanded={open}
          aria-controls={menuId}
          onPointerDown={() => {
            pointerOpened.current = Boolean(menu.current?.matches(':popover-open'));
          }}
          onClick={(event) => {
            // Pointer focus/light-dismiss can close the panel before click fires.
            const wasOpen =
              event.detail > 0 ? pointerOpened.current : menu.current?.matches(':popover-open');
            wasOpen ? closeMenu() : openMenu();
          }}
        >
          {icon ?? <Icon name="moon" />}
          <span>Theme</span>
          <span className="theme-current">
            {brand && hydrated
              ? ((brand.themes ?? themes) as Record<string, string>)[brand.selectedTheme]
              : 'Loading...'}
          </span>
        </button>
        <div
          className={'theme-options ' + pickerStyles.options}
          ref={menu}
          id={menuId}
          popover="auto"
          role="group"
          aria-label="Colour theme"
          tabIndex={-1}
          onToggle={(event) => {
            const isOpen = event.newState === 'open';
            setOpen(isOpen);
            // Light-dismiss on non-focusable content must not strand focus on body.
            // Keep deliberate focus on another control (including Tab navigation).
            const focused = document.activeElement as HTMLElement | null;
            if (
              !isOpen &&
              (!focused ||
                focused === document.body ||
                (focused.tabIndex < 0 &&
                  !focused.isContentEditable &&
                  !focused.matches('input,textarea,select,button,a[href]')))
            )
              trigger.current?.focus({ preventScroll: true });
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) menu.current?.hidePopover();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              closeMenu();
              return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
            );
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {Object.entries(brand?.themes ?? themes).map(([value, label]) => (
            <button
              type="button"
              key={value}
              disabled={!brand || !hydrated || busy}
              aria-pressed={hydrated && brand?.selectedTheme === value}
              onClick={() => void choose(value)}
            >
              <span className={'theme-dot theme-dot-' + value} aria-hidden="true" />
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={!brand || !hydrated || busy}
            onClick={() => void choose(null)}
          >
            Use {client ? 'client' : 'platform'} default
          </button>
          {busy && <p role="status">Saving theme...</p>}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button
                className="secondary"
                onClick={() => {
                  menu.current?.focus({ preventScroll: true });
                  setError('');
                  reload();
                }}
              >
                Reload appearance
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="sr-only" role="status">
        {message}
      </p>
    </div>
  );
}

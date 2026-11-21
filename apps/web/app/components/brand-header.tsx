'use client';
import { useEffect, useLayoutEffect, useState, useRef, type ReactNode } from 'react';
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
  const menu = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function choose(theme: string | null) {
    if (!brand || busy) return;
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
      if (menu.current) {
        menu.current.open = false;
        menu.current.querySelector('summary')?.focus();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <details
        className="theme-picker"
        ref={menu}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && e.currentTarget.open) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.open = false;
            e.currentTarget.querySelector('summary')?.focus();
          }
        }}
      >
        <summary>
          {icon ?? <Icon name="moon" />}
          <span>Theme</span>
          <span className="theme-current">
            {brand && hydrated
              ? ((brand.themes ?? themes) as Record<string, string>)[brand.selectedTheme]
              : 'Loading...'}
          </span>
        </summary>
        <div className="theme-options" role="group" aria-label="Colour theme">
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
        </div>
      </details>
      {busy && <p role="status">Saving theme...</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="secondary"
            onClick={() => {
              setError('');
              reload();
            }}
          >
            Reload appearance
          </button>
        </div>
      )}
      <p className="sr-only" role="status">
        {message}
      </p>
    </div>
  );
}

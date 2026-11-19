'use client';
import { useEffect, useState, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { themes } from '../../../../packages/domain/src/theme';
import { Icon } from './workspace-icon';
export type Brand = {
  displayName: string;
  appName: string;
  mode: string;
  selectedTheme: string;
  logo: string | null;
  palettes: Record<string, Record<string, string>>;
  platformPalettes: Record<string, Record<string, string>>;
  themes?: Record<string, string>;
  preferenceVersion?: number;
  theme?: string;
};
export function useBrand(account = 'guest') {
  const pathname = usePathname(),
    shared = /^\/(platform|login|setup|clients|account|accounts)(\/|$)/.test(pathname);
  const [brand, setBrand] = useState<Brand | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const storageKey = 'training.v21.appearance.platform.' + account;
  useEffect(() => {
    let current = true;
    async function refresh() {
      try {
        const response = await fetch('/api/branding/current?shared=' + (shared ? '1' : '0'), {
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Appearance could not be loaded. Retry appearance.');
        const data = (await response.json()) as Brand;
        if (!current) return;
        const root = document.documentElement;
        for (const [prefix, palettes] of [
          ['client', data.palettes],
          ['platform', data.platformPalettes],
        ] as const)
          for (const [variant, tokens] of Object.entries(palettes))
            for (const [key, value] of Object.entries(tokens))
              root.style.setProperty('--' + prefix + '-' + variant + '-' + key, value);
        if (shared || account === 'guest')
          try {
            const saved = localStorage.getItem(storageKey);
            if (saved && Object.hasOwn(themes, saved)) data.selectedTheme = saved;
          } catch {}
        root.dataset.theme = data.selectedTheme;
        setBrand(data);
        setError('');
      } catch (e) {
        if (current) setError((e as Error).message);
      }
    }
    void refresh();
    window.addEventListener('brandingchanged', refresh);
    return () => {
      current = false;
      window.removeEventListener('brandingchanged', refresh);
    };
  }, [pathname, shared, account, storageKey, retry]);
  return { brand, error, shared, storageKey, reload: () => setRetry((n) => n + 1) };
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
            {brand
              ? ((brand.themes ?? themes) as Record<string, string>)[brand.selectedTheme]
              : 'Loading...'}
          </span>
        </summary>
        <div className="theme-options" role="group" aria-label="Colour theme">
          {Object.entries(brand?.themes ?? themes).map(([value, label]) => (
            <button
              type="button"
              key={value}
              disabled={!brand || busy}
              aria-pressed={brand?.selectedTheme === value}
              onClick={() => void choose(value)}
            >
              <span className={'theme-dot theme-dot-' + value} aria-hidden="true" />
              {label}
            </button>
          ))}
          <button type="button" disabled={!brand || busy} onClick={() => void choose(null)}>
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

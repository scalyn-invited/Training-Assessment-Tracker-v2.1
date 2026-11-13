'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Feedback } from './auth-ui';
import { BrandHeader, ThemePicker, useBrand } from './brand-header';
import { Icon } from './workspace-icon';
type Client = { id: string; name: string };
export function AppShell({ children }: { children: React.ReactNode }) {
  const { context } = useContext(),
    pathname = usePathname(),
    router = useRouter();
  const guest = !context?.user || /^\/(login|setup|account\/link)(\/|$)/.test(pathname);
  const platform = pathname === '/platform' || pathname.startsWith('/platform/');
  const {
    brand,
    error: brandError,
    shared,
    storageKey,
    reload,
  } = useBrand(context?.user ? context.user.environment + '.' + context.user.id : 'guest');
  const [clients, setClients] = useState<Client[] | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<'client' | 'logout' | null>(null),
    [retry, setRetry] = useState(0);
  const [mobile, setMobile] = useState(false),
    [open, setOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null),
    toggle = useRef<HTMLButtonElement>(null),
    close = useRef<HTMLButtonElement>(null);
  const clientRequired =
    !guest && !platform && !/^\/(clients|accounts|account)(\/|$)/.test(pathname);
  useEffect(() => {
    document.body.classList.toggle('app-layout', !guest);
    document.body.classList.toggle('guest-layout', guest);
    document.body.classList.add('navigation-ready');
    return () =>
      document.body.classList.remove('app-layout', 'guest-layout', 'navigation-ready', 'nav-open');
  }, [guest]);
  useEffect(() => {
    const query = matchMedia('(max-width:800px)');
    function resize() {
      const focused = sidebar.current?.contains(document.activeElement);
      setMobile(query.matches);
      setOpen(false);
      if (focused && query.matches) toggle.current?.focus();
      else if (!query.matches && document.activeElement === close.current)
        sidebar.current?.querySelector<HTMLAnchorElement>('nav a')?.focus();
    }
    resize();
    query.addEventListener('change', resize);
    return () => query.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('nav-open', open);
    if (open) close.current?.focus();
    return () => document.body.classList.remove('nav-open');
  }, [open]);
  useEffect(() => {
    if (guest) return;
    let current = true;
    setError('');
    setClients(null);
    setSelected(context?.client?.id ?? '');
    api<Client[]>('/clients')
      .then(async (rows) => {
        if (!current) return;
        setClients(rows);
        if (clientRequired && !context?.client) {
          if (rows.length === 1) {
            await api('/clients/select', { csrf: context!.csrf, clientId: rows[0].id });
            if (current) window.location.replace(pathname);
          } else router.replace('/clients');
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [guest, context?.user?.id, context?.client?.id, clientRequired, pathname, retry, router]);
  function dismiss() {
    setOpen(false);
    toggle.current?.focus();
  }
  async function switchClient(e: React.FormEvent) {
    e.preventDefault();
    if (!context || busy || !selected) return;
    setBusy('client');
    setError('');
    try {
      await api('/clients/select', { csrf: context.csrf, clientId: selected });
      window.location.assign('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  async function logout() {
    if (!context || busy) return;
    setBusy('logout');
    setError('');
    try {
      await api('logout', { csrf: context.csrf });
      window.location.assign('/login');
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  function trap(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(
      sidebar.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not(:disabled),summary,select',
      ) ?? [],
    ).filter(
      (item) =>
        item.getClientRects().length &&
        (!item.closest('details:not([open])') || item.tagName === 'SUMMARY'),
    );
    const first = items[0],
      last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
  function nav(href: string, label: string, icon: string, active = pathname === href) {
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          if (mobile) {
            setOpen(false);
            document.getElementById('main')?.focus();
          }
        }}
      >
        <Icon name={icon} />
        <span>{label}</span>
      </Link>
    );
  }
  if (guest)
    return (
      <>
        <BrandHeader />
        <main id="main" className="container" tabIndex={-1}>
          {children}
        </main>
      </>
    );
  return (
    <>
      <header className="mobile-bar">
        <button
          ref={toggle}
          type="button"
          className="icon-button menu-toggle"
          aria-controls="app-sidebar"
          aria-expanded={open}
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <span>{brand?.appName ?? 'Assessment Training Tracker'}</span>
      </header>
      {open && <div className="nav-backdrop menu-backdrop" onClick={dismiss} aria-hidden="true" />}
      <aside
        ref={sidebar}
        id="app-sidebar"
        className="app-sidebar"
        aria-label="Workspace menu"
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        inert={mobile && !open}
        onKeyDown={trap}
      >
        <div className="sidebar-top">
          <Link className="brand" href="/dashboard" onClick={() => setOpen(false)}>
            <span className="brand-symbol">
              {brand?.logo && <img className="brand-logo" src={brand.logo} alt="" />}
            </span>
            <span className="brand-copy">
              <strong>
                {brand?.mode === 'cerebru' ? 'Cerebru' : (brand?.displayName ?? 'Training Tracker')}
              </strong>
              <span>{brand?.appName ?? 'Assessment Training Tracker'}</span>
            </span>
          </Link>
          <button
            ref={close}
            className="icon-button nav-close menu-close"
            aria-label="Close navigation"
            onClick={dismiss}
          >
            <Icon name="close" />
          </button>
        </div>
        {brand?.mode === 'co-branded' && <p className="co-brand">Part of Cerebru</p>}
        <p className="workspace-nav-label">
          {platform ? 'Platform workspace' : 'Learning workspace'}
        </p>
        <nav className="sidebar-nav" aria-label="Main navigation">
          {!platform &&
            context?.user?.global_admin &&
            nav('/platform', 'Platform administration', 'grid')}
          {platform ? (
            <>
              {nav('/platform', 'Platform overview', 'grid')}
              {nav('/platform/clients', 'Clients', 'building')}
              {nav('/platform/admins', 'Global admins', 'shield')}
              {nav('/platform/appearance', 'Platform appearance', 'palette')}
              {nav('/platform/audit', 'Administrative audit', 'clipboard')}
              <span className="nav-section">Learning workspace</span>
              {nav('/dashboard', 'Learning workspace', 'home')}
            </>
          ) : (
            <>
              {nav('/dashboard', 'Overview', 'home')}
              {nav(
                '/dashboard#learning-plans',
                'Learning plans',
                'book',
                pathname.startsWith('/enrolments'),
              )}
              {context?.canCoordinate && nav('/learning-reviews', 'Review queue', 'check')}
              {nav('/assessments', 'Assessments', 'check', pathname.startsWith('/assessments'))}
              {nav('/notifications', 'Updates', 'bell')}
              <span className="nav-section">Manage</span>
              {context?.canAdmin && (
                <>
                  {nav('/people', 'People', 'users')}
                  {nav('/administration', 'Administration', 'grid')}
                  {nav('/accounts', 'Account access', 'shield')}
                  {nav('/settings/ai', 'AI settings', 'spark')}
                </>
              )}
              {nav('/settings/appearance', 'Appearance', 'settings')}
            </>
          )}
          {context?.authMode === 'local_password' &&
            nav('/account/security', 'Account security', 'settings')}
        </nav>
        <div className="sidebar-bottom">
          {brand && brand.mode !== 'white-label' && (
            <a className="parent-link" href="https://opsbrain-eosin.vercel.app/home">
              <Icon name="external" />
              Back to Cerebru
            </a>
          )}
          <p className="sidebar-message">
            <span>One step at a time</span>Progress starts
            <br />
            with showing up.
          </p>
          <ThemePicker
            brand={brand}
            client={!shared ? context?.client?.id : undefined}
            csrf={context?.csrf}
            storageKey={storageKey}
            reload={reload}
          />
        </div>
      </aside>
      <div className="app-content" id="app-content" inert={open}>
        <header className="workspace-header">
          {platform ? (
            <div>
              <strong>Platform-wide</strong>
              <br />
              <span>All clients</span>
            </div>
          ) : (
            <form className="client-switcher" aria-label="Active client" onSubmit={switchClient}>
              <label htmlFor="active-client">Active client</label>
              <div className="client-controls">
                <select
                  id="active-client"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  required
                  disabled={Boolean(busy) || !clients}
                >
                  <option value="">{clients ? 'Choose client' : 'Loading clients...'}</option>
                  {clients?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button className="secondary" disabled={Boolean(busy) || !selected}>
                  {busy === 'client' ? 'Opening client...' : 'Switch client'}
                </button>
              </div>
            </form>
          )}
          <div className="profile">
            <span className="avatar" aria-hidden="true">
              {context?.user?.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="profile-copy">
              <strong>{context?.user?.name}</strong>
              <small>{platform ? 'Global administration' : 'Current client access'}</small>
            </span>
            <button
              className="icon-button"
              aria-label={busy === 'logout' ? 'Signing out...' : 'Sign out'}
              disabled={Boolean(busy)}
              onClick={() => void logout()}
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        {context?.user?.environment === 'test' && (
          <div className="sandbox">
            <span className="dot" />
            <strong>LOCAL SANDBOX</strong>
            <span>
              Synthetic people /{' '}
              {context.authMode === 'mock' ? 'Mock sign-in' : 'Local password sign-in'} / No email
              delivery
            </span>
          </div>
        )}
        <main id="main" className="container" tabIndex={-1}>
          <Feedback error={error || brandError} />
          {error && (
            <button
              className="secondary"
              disabled={Boolean(busy)}
              onClick={() => setRetry((n) => n + 1)}
            >
              Retry workspace navigation
            </button>
          )}
          {brandError && (
            <button className="secondary" onClick={reload}>
              Retry appearance
            </button>
          )}
          {clientRequired && !context?.client ? (
            <p role="status">Opening your client workspace...</p>
          ) : (
            children
          )}
        </main>
        <footer>
          <span>{brand?.appName ?? 'Assessment Training Tracker'}</span>
          <span>Learning with purpose. Progress with evidence.</span>
        </footer>
      </div>
    </>
  );
}

'use client';
import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ThemePicker, type Brand } from './brand-header';
import { OverviewIcon } from './overview-icon';
import { ClientsIcon } from './clients-icon';
import { PeopleIcon } from './people-icon';
import { AuditIcon } from './audit-icon';
import { Dialog } from './ui/dialog';
import { WorkspacePopover } from './workspace-popover';
import type { Context } from './auth-ui';
import { Icon } from './workspace-icon';
import { Button } from './ui/controls';
import styles from '../platform/overview.module.css';
import shared from './ui/application-shell.module.css';
import loading from './ui/loading-state.module.css';

type Props = {
  context: Context;
  pathname: string;
  platform: boolean;
  clientSwitcher?: ReactNode;
  themeClientId?: string;
  navigationBusy: boolean;
  activePage?: 'overview' | 'clients' | 'people' | 'audit' | 'settings';
  children: ReactNode;
  name: string;
  environment?: string;
  authMode?: string | null;
  brand: Brand | null;
  storageKey: string;
  reload: () => void;
  logout: () => void;
  signingOut: boolean;
  /** Persistent layout keeps route children in one fixed div; pages own main. */
  frame?: 'ready' | 'neutral' | 'standalone';
  themePending?: boolean;
};

export function ApplicationShell({
  context,
  pathname,
  platform,
  clientSwitcher,
  themeClientId,
  navigationBusy,
  activePage,
  children,
  name,
  environment,
  authMode,
  brand,
  storageKey,
  reload,
  logout,
  signingOut,
  frame,
  themePending = false,
}: Props) {
  const decorated = !frame || frame === 'ready';
  const standalone = frame === 'standalone';
  const menu = useRef<HTMLDialogElement>(null);
  const workspaceName = platform ? 'Platform administration' : 'Learning workspace';
  const home = platform ? '/platform' : '/dashboard';
  const canManageAccounts = Boolean(context.user?.global_admin || context.canAdmin);
  const learningLinks = [
    ...(context.user?.global_admin
      ? [{ href: '/platform', label: 'Platform administration', icon: 'grid' }]
      : []),
    { href: '/dashboard', label: 'Overview', icon: 'home' },
    { href: '/dashboard#learning-plans', label: 'Learning plans', icon: 'book' },
    ...(context.canCoordinate
      ? [{ href: '/learning-reviews', label: 'Review queue', icon: 'check' }]
      : []),
    { href: '/assessments', label: 'Assessments', icon: 'check' },
    { href: '/notifications', label: 'Updates', icon: 'bell' },
    ...(context.canAdmin
      ? [
          { href: '/people', label: 'People', icon: 'users' },
          { href: '/administration', label: 'Administration', icon: 'grid' },
          { href: '/accounts', label: 'Account access', icon: 'shield' },
          { href: '/settings/ai', label: 'AI settings', icon: 'spark' },
        ]
      : []),
    { href: '/settings/appearance', label: 'Appearance', icon: 'settings' },
    ...(authMode === 'local_password'
      ? [{ href: '/account/security', label: 'Account security', icon: 'shield' }]
      : []),
  ];
  function learningNavigation(mobile = false) {
    return (
      <nav
        className={styles.navigation + (mobile ? ' ' + shared.menuLinks : '')}
        aria-label={mobile ? 'Mobile learning navigation' : 'Main navigation'}
      >
        {learningLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={
              (
                item.href === '/dashboard#learning-plans'
                  ? pathname === '/enrolments' || pathname.startsWith('/enrolments/')
                  : pathname === item.href
              )
                ? 'page'
                : undefined
            }
            onClick={() => menu.current?.close()}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  const settings = useRef<HTMLDialogElement>(null);
  const brandName = brand?.mode === 'cerebru' ? 'Cerebru' : (brand?.displayName ?? 'Scalyn');
  const customLogo = brand?.logo && brand.logo !== '/images/scalyn-opc-logo.png';

  function navigation(mobile = false) {
    return (
      <nav
        className={mobile ? styles.bottomNav : styles.navigation}
        aria-label={mobile ? 'Mobile platform navigation' : 'Main navigation'}
      >
        <Link href="/platform" aria-current={activePage === 'overview' ? 'page' : undefined}>
          {activePage === 'overview' ? (
            <OverviewIcon name="overview" />
          ) : (
            <ClientsIcon name="overview-inactive" />
          )}
          <span>Overview</span>
        </Link>
        <Link href="/platform/clients" aria-current={activePage === 'clients' ? 'page' : undefined}>
          {activePage === 'clients' ? (
            <ClientsIcon name="clients-active" />
          ) : (
            <OverviewIcon name="clients" />
          )}
          <span>Clients</span>
        </Link>
        <Link
          href="/platform/people"
          aria-label="People & access"
          aria-current={activePage === 'people' ? 'page' : undefined}
        >
          {activePage === 'people' ? (
            <PeopleIcon name="people-active" />
          ) : (
            <OverviewIcon name="people" />
          )}
          <span>{mobile ? 'People' : 'People & access'}</span>
        </Link>
        <Link
          href="/platform/audit"
          aria-label="Audit log"
          aria-current={activePage === 'audit' ? 'page' : undefined}
        >
          {activePage === 'audit' ? (
            <AuditIcon name="audit-active" />
          ) : (
            <OverviewIcon name="audit" />
          )}
          <span>{mobile ? 'Audit' : 'Audit log'}</span>
        </Link>
        <Link
          href="/platform/settings"
          aria-current={activePage === 'settings' ? 'page' : undefined}
        >
          {activePage === 'settings' ? (
            <img src="/images/settings/settings-active.svg" alt="" aria-hidden="true" />
          ) : (
            <OverviewIcon name="settings" />
          )}
          <span>Settings</span>
        </Link>
      </nav>
    );
  }
  function themePicker() {
    return (
      <ThemePicker
        brand={themePending ? null : brand}
        client={themeClientId}
        csrf={context.csrf}
        storageKey={storageKey}
        reload={reload}
        icon={<OverviewIcon name="moon" />}
      />
    );
  }
  return (
    <div
      className={standalone ? undefined : styles.shell}
      data-shell-frame={frame}
      data-application-shell={standalone ? undefined : platform ? 'platform' : 'learning'}
    >
      <aside
        className={styles.sidebar}
        style={standalone ? { display: 'none' } : undefined}
        aria-label={
          decorated ? (platform ? 'Platform workspace' : 'Learning workspace') : 'Workspace'
        }
      >
        {decorated && (
          <>
            <Link href={home} className={styles.brand} aria-label={`${brandName} — Overview`}>
              <span className={styles.brandMark}>
                {customLogo ? (
                  <img src={brand!.logo!} alt="" />
                ) : (
                  brandName.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className={styles.brandCopy}>
                <strong>{brandName}</strong>
                <small>{brand?.appName ?? 'Assessment Training Tracker'}</small>
              </span>
            </Link>
            {brand?.mode === 'co-branded' && <p className={shared.coBrand}>Part of Cerebru</p>}
            <WorkspacePopover
              triggerContent={
                <>
                  <span className={styles.workspaceIcon}>
                    <OverviewIcon name="workspace" />
                  </span>
                  <span className={styles.workspaceCopy}>
                    <small>Workspace</small>
                    <strong>{workspaceName}</strong>
                  </span>
                  <OverviewIcon name="switch" />
                </>
              }
            >
              {context.user?.global_admin && (
                <Link href="/platform" aria-current={platform ? 'page' : undefined}>
                  Platform administration
                </Link>
              )}
              <Link href="/dashboard">Learning workspace</Link>
              <Link href="/clients">Choose your client</Link>
              {canManageAccounts && <Link href="/accounts">Manage account access</Link>}
              {brand && brand.mode !== 'white-label' && (
                <a href="https://opsbrain-eosin.vercel.app/home">Back to Cerebru</a>
              )}
            </WorkspacePopover>
            <p className={styles.navLabel}>{workspaceName}</p>
            {platform ? navigation() : learningNavigation()}
            <div className={styles.desktopTheme}>{themePicker()}</div>
          </>
        )}
      </aside>
      <div
        className={
          standalone ? undefined : styles.main + (!platform ? ' ' + shared.learningMain : '')
        }
      >
        <header className={styles.topbar} style={standalone ? { display: 'none' } : undefined}>
          {decorated && (
            <>
              {environment === 'test' ? (
                <div className={styles.sandbox}>
                  <span className={styles.sandboxBadge}>
                    <OverviewIcon name="dot" />
                    Local sandbox
                  </span>
                  <span className={styles.sandboxDetail}>
                    Synthetic people ·{' '}
                    {authMode === 'mock' ? 'Mock sign-in' : 'Local password sign-in'} · No email
                    delivery
                  </span>
                </div>
              ) : (
                <span className={styles.platformLabel}>{workspaceName}</span>
              )}
              <div className={styles.profile}>
                <button
                  type="button"
                  className={styles.avatar}
                  aria-label="Personal settings"
                  aria-haspopup="dialog"
                  onClick={() => settings.current?.showModal()}
                >
                  {name.slice(0, 1).toUpperCase()}
                </button>
                <span className={styles.profileCopy}>
                  <strong title={name}>{name}</strong>
                  <small>{platform ? 'Global administration' : 'Current client access'}</small>
                </span>
                <button
                  type="button"
                  className={styles.logout}
                  onClick={logout}
                  disabled={navigationBusy}
                  aria-busy={signingOut}
                  aria-label={signingOut ? 'Signing out...' : 'Sign out'}
                >
                  <OverviewIcon name="logout" />
                </button>
              </div>
            </>
          )}
        </header>
        {decorated && !platform && (
          <div className={shared.clientBar}>
            <Button
              className={shared.menuToggle}
              aria-label="Open navigation"
              aria-haspopup="dialog"
              onClick={() => menu.current?.showModal()}
            >
              <Icon name="menu" />
              Menu
            </Button>
            {clientSwitcher}
          </div>
        )}
        <div data-route-slot className={loading.routeSlot}>
          {frame ? (
            children
          ) : (
            <main id="main" className={styles.content} tabIndex={-1}>
              {children}
            </main>
          )}
        </div>
        <footer className={styles.footer} style={!decorated ? { display: 'none' } : undefined}>
          {decorated && (
            <>
              <span>{brand?.appName ?? 'Assessment Training Tracker'}</span>
              <span>Learning with purpose. Progress with evidence.</span>
            </>
          )}
        </footer>
      </div>
      {decorated && platform && navigation(true)}
      {decorated && !platform && (
        <Dialog dialogRef={menu} titleId="workspace-menu-title">
          <div className={styles.dialogHeader}>
            <h2 id="workspace-menu-title">Workspace menu</h2>
            <Button onClick={() => menu.current?.close()}>Close navigation</Button>
          </div>
          {learningNavigation(true)}
        </Dialog>
      )}
      {decorated && (
        <Dialog dialogRef={settings} titleId="overview-settings-title">
          <div className={styles.dialogHeader}>
            <h2 id="overview-settings-title">Personal settings</h2>
            <button type="button" className="secondary" onClick={() => settings.current?.close()}>
              Close
            </button>
          </div>
          <nav className={styles.settingsLinks} aria-label="Account settings">
            {context.user?.global_admin && (
              <>
                <Link href="/platform/settings">Platform appearance</Link>
                <Link href="/platform/admins">Global admins</Link>
              </>
            )}
            {canManageAccounts && <Link href="/accounts">Manage account access</Link>}
            {authMode === 'local_password' && (
              <Link href="/account/security">Account security</Link>
            )}
          </nav>
          {themePicker()}
        </Dialog>
      )}
    </div>
  );
}

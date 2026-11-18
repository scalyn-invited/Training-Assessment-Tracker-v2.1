'use client';
import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ThemePicker, type Brand } from './brand-header';
import { OverviewIcon } from './overview-icon';
import { ClientsIcon } from './clients-icon';
import { PeopleIcon } from './people-icon';
import { AuditIcon } from './audit-icon';
import { Dialog } from './ui/dialog';
import styles from '../platform/overview.module.css';

type Props = {
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
};

export function OverviewShell({
  activePage = 'overview',
  children,
  name,
  environment,
  authMode,
  brand,
  storageKey,
  reload,
  logout,
  signingOut,
}: Props) {
  const workspace = useRef<HTMLDetailsElement>(null);
  const settings = useRef<HTMLDialogElement>(null);
  const brandName = brand?.mode === 'cerebru' ? 'Cerebru' : (brand?.displayName ?? 'Scalyn');
  const customLogo = brand?.logo && brand.logo !== '/images/scalyn-opc-logo.png';
  function closeWorkspace(event: React.KeyboardEvent<HTMLDetailsElement>) {
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.preventDefault();
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }
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
        brand={brand}
        storageKey={storageKey}
        reload={reload}
        icon={<OverviewIcon name="moon" />}
      />
    );
  }
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Platform workspace">
        <Link href="/platform" className={styles.brand} aria-label={`${brandName} — Overview`}>
          <span className={styles.brandMark}>
            {customLogo ? <img src={brand!.logo!} alt="" /> : brandName.slice(0, 1).toUpperCase()}
          </span>
          <span className={styles.brandCopy}>
            <strong>{brandName}</strong>
            <small>{brand?.appName ?? 'Assessment Training Tracker'}</small>
          </span>
        </Link>
        <details ref={workspace} className={styles.workspace} onKeyDown={closeWorkspace}>
          <summary>
            <span className={styles.workspaceIcon}>
              <OverviewIcon name="workspace" />
            </span>
            <span className={styles.workspaceCopy}>
              <small>Workspace</small>
              <strong>Platform administration</strong>
            </span>
            <OverviewIcon name="switch" />
          </summary>
          <nav className={styles.workspaceMenu} aria-label="Choose workspace">
            <Link
              href="/platform"
              aria-current="page"
              onClick={() => {
                if (workspace.current) workspace.current.open = false;
              }}
            >
              Platform administration
            </Link>
            <Link href="/dashboard">Learning workspace</Link>
            <Link href="/clients">Choose your client</Link>
            <Link href="/accounts">Manage account access</Link>
            {brand && brand.mode !== 'white-label' && (
              <a href="https://opsbrain-eosin.vercel.app/home">Back to Cerebru</a>
            )}
          </nav>
        </details>
        <p className={styles.navLabel}>Platform administration</p>
        {navigation()}
        <div className={styles.desktopTheme}>{themePicker()}</div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          {environment === 'test' ? (
            <div className={styles.sandbox}>
              <span className={styles.sandboxBadge}>
                <OverviewIcon name="dot" />
                Local sandbox
              </span>
              <span className={styles.sandboxDetail}>
                Synthetic people · {authMode === 'mock' ? 'Mock sign-in' : 'Local password sign-in'}{' '}
                · No email delivery
              </span>
            </div>
          ) : (
            <span className={styles.platformLabel}>Platform administration</span>
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
              <small>Global administration</small>
            </span>
            <button
              type="button"
              className={styles.logout}
              onClick={logout}
              disabled={signingOut}
              aria-busy={signingOut}
              aria-label={signingOut ? 'Signing out...' : 'Sign out'}
            >
              <OverviewIcon name="logout" />
            </button>
          </div>
        </header>
        <main id="main" className={styles.content} tabIndex={-1}>
          {children}
        </main>
        <footer className={styles.footer}>
          <span>{brand?.appName ?? 'Assessment Training Tracker'}</span>
          <span>Learning with purpose. Progress with evidence.</span>
        </footer>
      </div>
      {navigation(true)}
      <Dialog dialogRef={settings} titleId="overview-settings-title">
        <div className={styles.dialogHeader}>
          <h2 id="overview-settings-title">Personal settings</h2>
          <button type="button" className="secondary" onClick={() => settings.current?.close()}>
            Close
          </button>
        </div>
        <nav className={styles.settingsLinks} aria-label="Platform settings">
          <Link href="/platform/settings">Platform appearance</Link>
          <Link href="/platform/admins">Global admins</Link>
          <Link href="/accounts">Manage account access</Link>
          {authMode === 'local_password' && <Link href="/account/security">Account security</Link>}
        </nav>
        {themePicker()}
      </Dialog>
    </div>
  );
}

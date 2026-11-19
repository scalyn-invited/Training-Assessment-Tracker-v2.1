'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, useContext } from './auth-ui';
import { useBrand } from './brand-header';
import { ApplicationShell } from './application-shell';
import { GuestShell } from './guest-shell';
import { Button, Select, Feedback as SharedFeedback } from './ui/controls';
import sharedStyles from './ui/application-shell.module.css';
import { confirmWorkLeave, leaveAfterConfirmedMutation } from './work-guard';
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
  } = useBrand(
    !guest && context?.user ? context.user.environment + '.' + context.user.id : 'guest',
  );
  const [clients, setClients] = useState<Client[] | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<'client' | 'logout' | null>(null),
    [retry, setRetry] = useState(0);
  const clientRequired =
    !guest && !platform && !/^\/(clients|accounts|account)(\/|$)/.test(pathname);
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
  async function switchClient(e: React.FormEvent) {
    e.preventDefault();
    if (!context || busy || !selected) return;
    if (!confirmWorkLeave()) return;
    setBusy('client');
    setError('');
    try {
      await api('/clients/select', { csrf: context.csrf, clientId: selected });
      leaveAfterConfirmedMutation('/dashboard');
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  async function logout() {
    if (!context || busy) return;
    if (!confirmWorkLeave()) return;
    setBusy('logout');
    setError('');
    try {
      await api('logout', { csrf: context.csrf });
      leaveAfterConfirmedMutation('/login');
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }
  if (guest || !context?.user)
    return (
      <GuestShell
        signIn={pathname === '/login'}
        session={!/^\/(login|setup|account\/link)(\/|$)/.test(pathname)}
        setup={pathname === '/setup' || pathname.startsWith('/setup/')}
        brand={brand}
        error={brandError}
        storageKey={storageKey}
        reload={reload}
      >
        {children}
      </GuestShell>
    );
  return (
    <ApplicationShell
      context={context}
      pathname={pathname}
      platform={platform && context.user.global_admin}
      themeClientId={!shared ? context.client?.id : undefined}
      navigationBusy={Boolean(busy)}
      clientSwitcher={
        <form
          className={sharedStyles.clientSwitcher}
          aria-label="Active client"
          onSubmit={switchClient}
        >
          <label htmlFor="active-client">Active client</label>
          <div>
            <Select
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
            </Select>
            <Button type="submit" disabled={Boolean(busy) || !selected}>
              {busy === 'client' ? 'Opening client...' : 'Switch client'}
            </Button>
          </div>
        </form>
      }
      activePage={
        pathname === '/platform/appearance' || pathname.startsWith('/platform/settings')
          ? 'settings'
          : pathname === '/platform/audit'
            ? 'audit'
            : pathname === '/platform/people' || pathname === '/platform/admins'
              ? 'people'
              : pathname === '/platform/clients'
                ? 'clients'
                : pathname === '/platform'
                  ? 'overview'
                  : undefined
      }
      name={context.user.name}
      environment={context.user.environment}
      authMode={context.authMode}
      brand={brand}
      storageKey={storageKey}
      reload={reload}
      logout={() => void logout()}
      signingOut={busy === 'logout'}
    >
      <SharedFeedback error={error || brandError} />
      {error && <Button onClick={() => setRetry((n) => n + 1)}>Retry workspace navigation</Button>}
      {brandError && <Button onClick={reload}>Retry appearance</Button>}
      {clientRequired && !context.client ? (
        <p role="status">Opening your client workspace...</p>
      ) : (
        children
      )}
    </ApplicationShell>
  );
}

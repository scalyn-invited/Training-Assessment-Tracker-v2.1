'use client';
import {
  createContext,
  useContext as useReactContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  api,
  loadContext,
  contextGeneration,
  contextMutationPending,
  resumeContextVerification,
  type Context,
} from './auth-ui';
import { useBrand, type Brand } from './brand-header';
import { sharedAppearance } from './appearance-state';
import { ApplicationShell } from './application-shell';
import { GuestShell } from './guest-shell';
import { LoadingState } from './loading-state';
import { Button, Select, Feedback } from './ui/controls';
import sharedStyles from './ui/application-shell.module.css';
import styles from '../platform/overview.module.css';
import loadingStyles from './ui/loading-state.module.css';
import { confirmWorkLeave, leaveAfterConfirmedMutation } from './work-guard';

type Client = { id: string; name: string };
type Lease = { token: object; pathname: string; recovery: boolean };
type ShellState = {
  register: (lease: Lease) => () => void;
  context: Context | null;
  guestRoute: boolean;
  framed: boolean;
  clientRequired: boolean;
  appearance: ReturnType<typeof useBrand>;
  contextError: string;
  navigationError: string;
  retryContext: () => void;
  retryNavigation: () => void;
};
const ShellContext = createContext<ShellState | null>(null);
const emptyContext: Context = { csrf: '', user: null, installed: false };
const guestPath = (pathname: string) => /^\/(login|setup|account\/link)(\/|$)/.test(pathname);

/** Persistent chrome only. Route children never move or acquire an authority-dependent key. */
export function AppShellRoot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(),
    router = useRouter();
  const guestRoute = guestPath(pathname);
  const platform = pathname === '/platform' || pathname.startsWith('/platform/');
  const [epoch, setEpoch] = useState(contextGeneration),
    [verification, setVerification] = useState(0);
  const authorityKey = JSON.stringify([pathname, epoch, verification]);
  const [session, setSession] = useState<{ key: string; context: Context | null; error: string }>({
    key: '',
    context: null,
    error: '',
  });
  const context = session.key === authorityKey ? session.context : null;
  const contextError = session.key === authorityKey ? session.error : '';
  const requestedAuthority = useRef<string | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const register = useCallback((lease: Lease) => {
    setLeases((previous) => [...previous.filter((item) => item.token !== lease.token), lease]);
    return () => setLeases((previous) => previous.filter((item) => item.token !== lease.token));
  }, []);
  const participating = leases.some((lease) => lease.pathname === pathname && !lease.recovery);
  const recovery = leases.some((lease) => lease.pathname === pathname && lease.recovery);
  const retryContext = useCallback(() => {
    resumeContextVerification();
    setVerification((value) => value + 1);
  }, []);
  useLayoutEffect(() => {
    const invalidate = () => setEpoch(contextGeneration());
    window.addEventListener('trackercontextinvalidated', invalidate);
    return () => window.removeEventListener('trackercontextinvalidated', invalidate);
  }, []);
  // Root verification does not clear page data context on a builder saved-URL change.
  useLayoutEffect(() => {
    resumeContextVerification();
  }, [pathname]);
  useLayoutEffect(() => {
    let current = true;
    if (!participating || recovery) return;
    if (contextMutationPending()) {
      const timer = window.setTimeout(() => {
        if (current)
          setSession({
            key: authorityKey,
            context: null,
            error:
              'The workspace change has not been confirmed. Check the current session before trying another action.',
          });
      }, 10000);
      return () => {
        current = false;
        window.clearTimeout(timer);
      };
    }
    // Join the first page request; do not silently bypass its confirmed error.
    // A later route/identity/retry boundary must not join an older page refresh.
    const fresh =
      requestedAuthority.current !== null && requestedAuthority.current !== authorityKey;
    requestedAuthority.current = authorityKey;
    loadContext(fresh)
      .then((result) => {
        if (current && result && epoch === contextGeneration())
          setSession({ key: authorityKey, context: result, error: '' });
      })
      .catch((error) => {
        if (current) setSession({ key: authorityKey, context: null, error: error.message });
      });
    return () => {
      current = false;
    };
  }, [authorityKey, epoch, participating, recovery]);
  useLayoutEffect(() => {
    const update = (event: Event) => {
      if (!contextMutationPending())
        setSession({
          key: authorityKey,
          context: (event as CustomEvent<Context>).detail,
          error: '',
        });
    };
    window.addEventListener('trackercontext', update);
    const failed = (event: Event) =>
      setSession({
        key: authorityKey,
        context: null,
        error: (event as CustomEvent<string>).detail,
      });
    window.addEventListener('trackercontextfailed', failed);
    return () => {
      window.removeEventListener('trackercontext', update);
      window.removeEventListener('trackercontextfailed', failed);
    };
  }, [authorityKey]);
  const account = guestRoute
    ? 'guest'
    : context?.user
      ? context.user.environment + '.' + context.user.id
      : context
        ? 'guest'
        : null;
  const projection = context
    ? JSON.stringify([
        epoch,
        context.user,
        context.authMode,
        context.client,
        context.canAdmin,
        context.canCoordinate,
      ])
    : `pending:${epoch}`;
  const appearance = useBrand(account, context?.client?.id ?? null, guestRoute ? 0 : projection);
  const { brand, shared, storageKey, reload } = appearance;
  const clientRequired =
    !guestRoute &&
    Boolean(context?.user) &&
    !platform &&
    !/^\/(clients|accounts|account)(\/|$)/.test(pathname);
  const continuity = context?.user
    ? JSON.stringify([
        epoch,
        context.user,
        context.authMode,
        context.client,
        context.canAdmin,
        context.canCoordinate,
        platform,
        sharedAppearance(pathname, context.client?.id ?? null),
      ])
    : null;
  const confirmed = useRef<{ key: string; epoch: number; brand: Brand } | null>(null),
    hadChrome = useRef(false);
  if (
    confirmed.current &&
    (confirmed.current.epoch !== epoch ||
      (continuity && confirmed.current.key !== continuity) ||
      (context && !context.user) ||
      guestRoute ||
      recovery ||
      contextError)
  )
    confirmed.current = null;
  const chromeBrand =
    context && continuity && confirmed.current?.key === continuity
      ? (brand ?? confirmed.current.brand)
      : brand;
  const decorated =
    participating && !recovery && !guestRoute && Boolean(context?.user && chromeBrand);
  const framed = participating && !recovery && !guestRoute && (decorated || hadChrome.current);
  useLayoutEffect(() => {
    if (decorated) hadChrome.current = true;
    if (brand && continuity && context?.user) confirmed.current = { key: continuity, epoch, brand };
  }, [decorated, brand, continuity, epoch, context]);
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute(
      'data-shell-neutral',
      hadChrome.current && !recovery && (guestRoute ? !brand : !decorated || !context),
    );
    return () => document.documentElement.removeAttribute('data-shell-neutral');
  }, [guestRoute, recovery, decorated, context, brand]);
  const [clients, setClients] = useState<Client[] | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState<'client' | 'logout' | null>(null),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!participating || recovery || !context?.user || guestRoute) return;
    let current = true;
    setError('');
    setClients(null);
    setSelected(context.client?.id ?? '');
    api<Client[]>('/clients')
      .then(async (rows) => {
        if (!current) return;
        setClients(rows);
        if (clientRequired && !context.client) {
          if (rows.length === 1) {
            const selection = api('/clients/select', { csrf: context.csrf, clientId: rows[0].id });
            const selectionEpoch = contextGeneration();
            await selection;
            // Our own invalidation intentionally clears context and cleans up this effect.
            // Complete only this confirmed mutation, never a newer scope or route.
            if (contextGeneration() === selectionEpoch && window.location.pathname === pathname)
              window.location.replace(pathname);
          } else router.replace('/clients');
        }
      })
      .catch((error) => {
        if (current) setError(error.message);
      });
    return () => {
      current = false;
    };
  }, [
    participating,
    recovery,
    guestRoute,
    context?.user?.id,
    context?.client?.id,
    clientRequired,
    pathname,
    retry,
    router,
  ]);
  async function switchClient(event: React.FormEvent) {
    event.preventDefault();
    if (!context || busy || !selected || !confirmWorkLeave()) return;
    setBusy('client');
    setError('');
    try {
      await api('/clients/select', { csrf: context.csrf, clientId: selected });
      leaveAfterConfirmedMutation('/dashboard');
    } catch (error) {
      setError((error as Error).message);
      setBusy(null);
    }
  }
  async function logout() {
    if (!context || busy || !confirmWorkLeave()) return;
    setBusy('logout');
    setError('');
    try {
      await api('logout', { csrf: context.csrf });
      leaveAfterConfirmedMutation('/login');
    } catch (error) {
      setError((error as Error).message);
      setBusy(null);
    }
  }
  const value: ShellState = {
    register,
    context,
    guestRoute,
    framed,
    clientRequired,
    appearance,
    contextError,
    navigationError: error,
    retryContext,
    retryNavigation: () => {
      setError('');
      setBusy(null);
      setRetry((n) => n + 1);
      retryContext();
    },
  };
  return (
    <ShellContext.Provider value={value}>
      <ApplicationShell
        frame={framed ? (decorated ? 'ready' : 'neutral') : 'standalone'}
        themePending={!brand}
        context={context ?? emptyContext}
        pathname={pathname}
        platform={platform && Boolean(context?.user?.global_admin)}
        themeClientId={!shared ? context?.client?.id : undefined}
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
                onChange={(event) => setSelected(event.target.value)}
                required
                disabled={Boolean(busy) || !clients}
              >
                <option value="">{clients ? 'Choose client' : 'Loading clients...'}</option>
                {clients?.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
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
        name={context?.user?.name ?? ''}
        environment={context?.user?.environment}
        authMode={context?.authMode}
        brand={chromeBrand}
        storageKey={storageKey}
        reload={reload}
        logout={() => void logout()}
        signingOut={busy === 'logout'}
      >
        {children}
      </ApplicationShell>
    </ShellContext.Provider>
  );
}
function useParticipation(shell: ShellState | null, recovery = false) {
  const pathname = usePathname(),
    token = useRef({});
  const register = shell?.register;
  useLayoutEffect(
    () => register?.({ token: token.current, pathname, recovery }),
    [register, pathname, recovery],
  );
}
export function ShellRecovery() {
  useParticipation(useReactContext(ShellContext), true);
  return null;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const shell = useReactContext(ShellContext),
    pathname = usePathname();
  useParticipation(shell);
  if (!shell)
    return (
      <AppShellRoot>
        <AppShell>{children}</AppShell>
      </AppShellRoot>
    );
  const {
    context,
    guestRoute,
    appearance,
    contextError,
    navigationError,
    retryContext,
    retryNavigation,
    framed,
    clientRequired,
  } = shell;
  const { brand, documentRecovery, error: brandError, storageKey, reload } = appearance;
  if (guestRoute && (brand || documentRecovery))
    return (
      <GuestShell
        signIn={pathname === '/login'}
        setup={pathname === '/setup' || pathname.startsWith('/setup/')}
        brand={brand}
        error={brandError}
        storageKey={storageKey}
        reload={reload}
      >
        {children}
      </GuestShell>
    );
  const pending =
    !context || (!guestRoute && !context.user) || !brand || (clientRequired && !context.client);
  return (
    <main
      id="main"
      tabIndex={-1}
      className={
        framed
          ? styles.content + (pending ? ' ' + loadingStyles.contentPending : '')
          : loadingStyles.fullPage
      }
      data-appearance-pending={pending ? '' : undefined}
    >
      {pending ? (
        <>
          {contextError || brandError || navigationError ? (
            <div className={loadingStyles.recovery}>
              <Feedback error={navigationError || contextError || brandError} />
              {navigationError ? (
                <Button onClick={retryNavigation}>Check current workspace</Button>
              ) : contextError ? (
                <Button onClick={retryContext}>Try loading again</Button>
              ) : (
                <Button onClick={reload}>Retry appearance</Button>
              )}
            </div>
          ) : (
            <LoadingState
              label="Loading workspace"
              message={
                context
                  ? 'Checking this destination’s appearance and access. This is taking longer than usual.'
                  : undefined
              }
            />
          )}
        </>
      ) : (
        <>
          <Feedback error={navigationError || brandError} />
          {navigationError && <Button onClick={retryNavigation}>Retry workspace navigation</Button>}
          {brandError && <Button onClick={reload}>Retry appearance</Button>}
          {children}
        </>
      )}
    </main>
  );
}

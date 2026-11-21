'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Feedback } from './ui/controls';
import guestStyles from './ui/guest.module.css';
export { Feedback } from './ui/controls';
import { AppShell } from './app-shell';
import { LoadingState } from './loading-state';
type User = {
  id: string;
  name: string;
  email: string;
  global_admin: boolean;
  environment?: string;
};
type Context = {
  csrf: string;
  user: User | null;
  installed: boolean;
  setupMode?: 'hosted' | 'local';
  canAdmin?: boolean;
  canCoordinate?: boolean;
  authMode?: 'local_password' | 'mock' | null;
  client?: { id: string; name: string } | null;
};
type ApiError = Error & { code?: string };
// A document-local epoch fences both direct deliveries and broadcasts. It is not a session cache.
let contextEpoch = 0;
let mutationPending = false;
export function contextGeneration() {
  return contextEpoch;
}
export function contextMutationPending() {
  return mutationPending;
}
export function resumeContextVerification() {
  mutationPending = false;
}
function invalidateContext() {
  contextEpoch++;
  mutationPending = true;
  window.dispatchEvent(new Event('trackercontextinvalidated'));
}
export async function api<T>(route: string, data?: Record<string, unknown>): Promise<T> {
  const identityMutation = Boolean(
    data &&
    ['login', 'mock-login', 'logout', '/clients/select', '/accounts/redeem'].includes(route),
  );
  if (identityMutation) invalidateContext();
  const mutationEpoch = contextEpoch;
  try {
    return await request<T>(route, data);
  } catch (error) {
    if (identityMutation && mutationEpoch === contextEpoch)
      window.dispatchEvent(
        new CustomEvent('trackercontextfailed', {
          detail:
            'The workspace change could not be confirmed. Check the current session before trying another action.',
        }),
      );
    throw error;
  }
}
async function request<T>(route: string, data?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(route.startsWith('/') ? '/api' + route : '/api/auth/' + route, {
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store',
      signal: route === 'context' ? AbortSignal.timeout(10000) : undefined,
    });
  } catch {
    throw new Error('The application could not be reached. Check the connection and try again.');
  }
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.message ?? 'The request could not be completed. Try again.'),
      { code: result.code },
    );
  return result;
}
let contextRequest: { epoch: number; promise: Promise<Context | null> } | null = null;
let contextSequence = 0;
export function loadContext(fresh = false): Promise<Context | null> {
  const epoch = contextEpoch;
  if (mutationPending) return Promise.resolve(null);
  if (fresh || !contextRequest || contextRequest.epoch !== epoch) {
    const sequence = ++contextSequence;
    const promise = api<Context>('context')
      .then((result) => {
        if (epoch !== contextEpoch || sequence !== contextSequence || mutationPending) return null;
        window.dispatchEvent(new CustomEvent('trackercontext', { detail: result }));
        return result;
      })
      .catch((error) => {
        if (epoch === contextEpoch && sequence === contextSequence) throw error;
        return null;
      })
      .finally(() => {
        if (contextRequest?.promise === promise) contextRequest = null;
      });
    contextRequest = { epoch, promise };
  }
  return contextRequest.promise;
}
export function useContext() {
  const [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState('');
  const load = (explicit = false) => {
    if (explicit) resumeContextVerification();
    setError('');
    const epoch = contextEpoch;
    loadContext(explicit)
      .then((result) => {
        if (result && epoch === contextEpoch) setContext(result);
      })
      .catch((e) => {
        if (epoch === contextEpoch) setError(e.message);
      });
  };
  useEffect(() => {
    const update = (event: Event) => {
      setContext((event as CustomEvent<Context>).detail);
      setError('');
    };
    window.addEventListener('trackercontext', update);
    load();
    return () => window.removeEventListener('trackercontext', update);
  }, []);
  return { context, setContext, error, load: () => load(true) };
}
export function Guest({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
export function Pending({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <div className={guestStyles.stack}>
      <Feedback error={error} />
      <Button onClick={retry}>Try loading again</Button>
    </div>
  ) : (
    <LoadingState />
  );
}
export function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
}
export type { Context, ApiError };

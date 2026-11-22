'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Feedback } from './ui/controls';
import guestStyles from './ui/guest.module.css';
export { Feedback } from './ui/controls';
import { AppShell } from './app-shell';
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
export async function api<T>(route: string, data?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(route.startsWith('/') ? '/api' + route : '/api/auth/' + route, {
      method: data ? 'POST' : 'GET',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store',
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
let contextRequest: Promise<Context> | null = null;
function loadContext() {
  if (!contextRequest)
    contextRequest = api<Context>('context')
      .then((result) => {
        window.dispatchEvent(new CustomEvent('trackercontext', { detail: result }));
        return result;
      })
      .finally(() => {
        contextRequest = null;
      });
  return contextRequest;
}
export function useContext() {
  const [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState('');
  const load = () => {
    setError('');
    loadContext()
      .then(setContext)
      .catch((e) => setError(e.message));
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
  return { context, setContext, error, load };
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
    <p role="status">Loading your session…</p>
  );
}
export function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
}
export type { Context, ApiError };

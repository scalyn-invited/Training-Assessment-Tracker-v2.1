'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
type User = { id: string; name: string; email: string; global_admin: boolean };
type Context = { csrf: string; user: User | null; installed: boolean };
type ApiError = Error & { code?: string };
export async function api<T>(route: string, data?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/auth/' + route, {
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
export function useContext() {
  const [context, setContext] = useState<Context | null>(null),
    [error, setError] = useState('');
  const load = () => {
    setError('');
    api<Context>('context')
      .then(setContext)
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
  }, []);
  return { context, setContext, error, load };
}
export function Password({
  name,
  label,
  creation = false,
}: {
  name: string;
  label: string;
  creation?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={visible ? 'text' : 'password'}
        required
        minLength={creation ? 15 : undefined}
        maxLength={72}
        autoComplete={creation ? 'new-password' : 'current-password'}
        aria-describedby={creation ? name + '-help' : undefined}
      />
      <button
        type="button"
        className="secondary"
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? 'Hide' : 'Show'} {label.toLowerCase()}
      </button>
      {creation && (
        <p id={name + '-help'} className="help">
          Use at least 15 characters and no more than 72 UTF-8 bytes.
        </p>
      )}
    </div>
  );
}
export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
    </>
  );
}
export function Guest({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="guest-header">
        <Link className="brand" href="/">
          Training Tracker
        </Link>
        <span>V2.1</span>
      </header>
      <main id="main" className="container">
        {children}
      </main>
    </>
  );
}
export function Pending({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <>
      <Feedback error={error} />
      <button className="secondary" onClick={retry}>
        Try loading again
      </button>
    </>
  ) : (
    <p role="status">Loading your session…</p>
  );
}
export function values(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
}
export type { Context, ApiError };

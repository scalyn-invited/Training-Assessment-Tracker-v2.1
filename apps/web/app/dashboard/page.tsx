'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
export default function Dashboard() {
  const { context, error, load } = useContext(),
    router = useRouter(),
    [actionError, setActionError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  async function logout() {
    if (!context || busy) return;
    setBusy(true);
    try {
      await api('logout', { csrf: context.csrf });
      router.replace('/login');
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : (
        <>
          <p className="eyebrow">Your workspace</p>
          <h1>Welcome, {context.user.name}</h1>
          <p>Signed in as {context.user.email}.</p>
          <p>
            {context.client
              ? 'Current client: ' + context.client.name
              : 'Choose a client to open your workspace.'}
          </p>
          <p>
            <Link href="/clients">{context.client ? 'Switch client' : 'Choose your client'}</Link>
          </p>
          <div className="panel">
            <h2>Application migration in progress</h2>
            <p>
              Account setup and optional authenticator verification are available. Assessment,
              administration and learning workflows have not yet been ported in this build.
            </p>
            <Link href="/account/security">Manage account security</Link>
          </div>
          {context.user.global_admin && (
            <p>
              <Link href="/platform/clients">Manage clients</Link>
            </p>
          )}
          <Feedback error={actionError} />
          <button className="secondary" onClick={logout} disabled={busy}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    </Guest>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
type Client = { id: string; name: string };
export default function Clients() {
  const { context, error, load } = useContext(),
    router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null),
    [failure, setFailure] = useState(''),
    [busy, setBusy] = useState<string | null>(null);
  const loadClients = () => {
    setFailure('');
    api<Client[]>('/clients')
      .then(setClients)
      .catch((e) => setFailure(e.message));
  };
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
    else if (context?.user) loadClients();
  }, [context, router]);
  async function choose(client: Client) {
    if (!context || busy) return;
    setBusy(client.id);
    setFailure('');
    try {
      await api('/clients/select', { csrf: context.csrf, clientId: client.id });
      router.push('/dashboard');
    } catch (e) {
      setFailure((e as Error).message);
      setBusy(null);
    }
  }
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : (
        <>
          <section className="panel" aria-busy={Boolean(busy)}>
            <h1>Choose your client</h1>
            <p>Select the organisation you want to work in.</p>
            <Feedback error={failure} />
            {failure && (
              <button className="secondary" onClick={loadClients} disabled={Boolean(busy)}>
                Try loading clients again
              </button>
            )}
            {!clients && !failure && <p role="status">Loading your clients…</p>}
            {clients?.length === 0 && (
              <p>No active client access is available. Contact your administrator.</p>
            )}
            {clients?.map((client) => (
              <form
                className="client-choice"
                key={client.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  void choose(client);
                }}
              >
                <button className="secondary" type="submit" disabled={Boolean(busy)}>
                  {busy === client.id ? 'Opening ' + client.name + '…' : client.name}
                </button>
              </form>
            ))}
          </section>
          <Link href="/dashboard">Back to workspace</Link>
        </>
      )}
    </Guest>
  );
}

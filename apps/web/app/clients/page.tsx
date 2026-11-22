'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending } from '../components/auth-ui';
import { Button, Panel, PageHeader, Feedback } from '../components/ui/controls';
import styles from '../components/ui/form-layout.module.css';
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
        <div className={styles.page}>
          <Panel className={styles.panel} aria-busy={Boolean(busy)}>
            <PageHeader title="Choose your client">
              Select the organisation you want to work in.
            </PageHeader>
            <Feedback error={failure} />
            {failure && (
              <Button onClick={loadClients} disabled={Boolean(busy)}>
                Try loading clients again
              </Button>
            )}
            {!clients && !failure && <p role="status">Loading your clients…</p>}
            {clients?.length === 0 && (
              <p>No active client access is available. Contact your administrator.</p>
            )}
            {clients?.map((client) => (
              <form
                key={client.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  void choose(client);
                }}
              >
                <Button type="submit" disabled={Boolean(busy)}>
                  {busy === client.id ? 'Opening ' + client.name + '…' : client.name}
                </Button>
              </form>
            ))}
          </Panel>
          <Link href="/dashboard">Back to workspace</Link>
        </div>
      )}
    </Guest>
  );
}

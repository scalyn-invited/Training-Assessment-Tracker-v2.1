'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
type People = {
  people: { id: string; name: string; sync_policy: string; active: boolean }[];
  total: number;
};
export default function People() {
  const { context, error, load } = useContext(),
    router = useRouter(),
    client = context?.client?.id;
  const [data, setData] = useState<People | null>(null),
    [failure, setFailure] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!client) return;
    let current = true;
    setData(null);
    setFailure('');
    api<People>('/clients/people?clientId=' + client + '&page=' + page)
      .then((row) => {
        if (current) setData(row);
      })
      .catch((e) => {
        if (current) setFailure(e.message);
      });
    return () => {
      current = false;
    };
  }, [client, page, retry]);
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : (
        <>
          <p className="eyebrow">Administration</p>
          <h1>People in this client</h1>
          <p className="lead">
            Synthetic profiles are isolated from production. Admin access does not grant private
            assessment access.
          </p>
          <Feedback error={failure} />
          {failure && (
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry people
            </button>
          )}
          {!data && !failure && <p role="status">Loading client members...</p>}
          {data && (
            <>
              <div
                className="panel directory-panel"
                role="region"
                aria-label="People in the active client"
                tabIndex={0}
              >
                <table className="directory-table">
                  <caption className="sr-only">
                    People with an active membership in the selected client
                  </caption>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Client relationship</th>
                      <th>Profile</th>
                      <th>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map((person) => (
                      <tr key={person.id}>
                        <td data-label="Name">{person.name}</td>
                        <td data-label="Client relationship">Active client membership</td>
                        <td data-label="Profile">{person.sync_policy.replaceAll('_', ' ')}</td>
                        <td data-label="Access">{person.active ? 'Active' : 'Suspended'}</td>
                      </tr>
                    ))}
                    {!data.people.length && (
                      <tr>
                        <td colSpan={4}>No people are available in this client.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <nav className="form-actions" aria-label="People pages">
                <button
                  className="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous people
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(data.total / 20))}
                </span>
                <button
                  className="secondary"
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next people
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </Guest>
  );
}

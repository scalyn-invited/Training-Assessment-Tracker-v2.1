'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
type Records = {
  records: { id: string; title: string; status: string; memberName: string; canDetails: boolean }[];
  total: number;
  page: number;
};
export default function Enrolments() {
  const { context, error, load } = useContext();
  const [data, setData] = useState<Records | null>(null),
    [failure, setFailure] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const client = context?.client?.id;
  useEffect(() => {
    if (!client) return;
    let current = true;
    setFailure('');
    api<Records>(
      '/enrolments?' +
        new URLSearchParams({ clientId: client, search: filter, page: String(page) }),
    )
      .then((v) => {
        if (current) setData(v);
      })
      .catch((e) => {
        if (current) setFailure(e.message);
      });
    return () => {
      current = false;
    };
  }, [client, filter, page, retry]);
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !client ? (
        <>
          <h1>Choose a client</h1>
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <>
          <p className="eyebrow">{context.client?.name}</p>
          <h1>Training records</h1>
          <p>
            <Link href="/dashboard">Workspace</Link>
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setFilter(search);
              setPage(1);
              setData(null);
            }}
          >
            <label>
              Search training records
              <input
                maxLength={120}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button className="primary">Search records</button>
          </form>
          <Feedback error={failure} />
          {failure && (
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry training records
            </button>
          )}
          {!data && !failure && <p role="status">Loading training records…</p>}
          {data && (
            <section className="panel">
              <h2>Your accessible training records</h2>
              {data.records.length === 0 ? (
                <p>
                  {filter
                    ? 'No records match this search. Clear the search to see your records.'
                    : 'No training records are available for your current permissions. Your coordinator or client administrator can check your allocation.'}
                </p>
              ) : (
                data.records.map((r) => (
                  <article key={r.id}>
                    <h3>
                      {r.memberName} · {r.title}
                    </h3>
                    <p>Status: {r.status}</p>
                    <p>
                      <Link href={`/enrolments/${r.id}`}>Open training record</Link>
                    </p>
                    {r.canDetails ? (
                      <>
                        <Link href={`/enrolments/${r.id}/onboarding`}>Open onboarding</Link>
                        <p>
                          <Link href={`/enrolments/${r.id}/delivery`}>Open learning plan</Link>
                        </p>
                      </>
                    ) : (
                      <p>Private inputs require separate sensitive access.</p>
                    )}
                  </article>
                ))
              )}
              <div className="form-actions">
                <button
                  className="secondary"
                  disabled={page === 1}
                  onClick={() => setPage((n) => n - 1)}
                >
                  Previous page
                </button>
                <span>
                  Page {page} · {data.total} records
                </span>
                <button
                  className="secondary"
                  disabled={page * 20 >= data.total}
                  onClick={() => setPage((n) => n + 1)}
                >
                  Next page
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </Guest>
  );
}

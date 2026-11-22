'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, useContext, Guest, Pending } from '../components/auth-ui';
import { Button, Input, Panel, PageHeader, Feedback } from '../components/ui/controls';
import { Pagination } from '../components/ui/directory';
import layout from '../components/ui/form-layout.module.css';
import styles from './directory.module.css';
type Records = {
  records: { id: string; title: string; status: string; memberName: string; canDetails: boolean }[];
  total: number;
  page: number;
};
export default function Enrolments() {
  const { context, error, load } = useContext();
  const router = useRouter();
  const [data, setData] = useState<Records | null>(null),
    [failure, setFailure] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const client = context?.client?.id;
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
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
          <PageHeader title="Choose a client" />
          <Link href="/clients">Choose your client</Link>
        </>
      ) : (
        <div className={layout.page}>
          <p className="eyebrow">{context.client?.name}</p>
          <PageHeader title="Training records" />
          <p>
            <Link href="/dashboard">Workspace</Link>
          </p>
          <form
            className={styles.search}
            onSubmit={(e) => {
              e.preventDefault();
              setFilter(search);
              setPage(1);
              setData(null);
              setRetry((n) => n + 1);
            }}
          >
            <label>
              Search training records
              <Input
                maxLength={120}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Button type="submit" variant="primary">
              Search records
            </Button>
          </form>
          <Feedback error={failure} />
          {failure && (
            <Button onClick={() => setRetry((n) => n + 1)}>Retry training records</Button>
          )}
          {!data && !failure && <p role="status">Loading training records…</p>}
          {data && (
            <Panel className={layout.panel}>
              <h2>Your accessible training records</h2>
              {data.records.length === 0 ? (
                <p>
                  {filter
                    ? 'No records match this search. Clear the search to see your records.'
                    : 'No training records are available for your current permissions. Your coordinator or client administrator can check your allocation.'}
                </p>
              ) : (
                data.records.map((r) => (
                  <article key={r.id} className={styles.record}>
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
              <Pagination aria-label="Training record pages">
                <Button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
                  Previous page
                </Button>
                <span>
                  Page {page} · {data.total} records
                </span>
                <Button disabled={page * 20 >= data.total} onClick={() => setPage((n) => n + 1)}>
                  Next page
                </Button>
              </Pagination>
            </Panel>
          )}
        </div>
      )}
    </Guest>
  );
}

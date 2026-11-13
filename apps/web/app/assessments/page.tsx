'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppealRouting } from '../components/appeal-routing';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
type Row = { id: string; title: string; status: string; revision: number; version: number };
type Assigned = {
  author: boolean;
  assignments: {
    id: string;
    title: string;
    memberName: string;
    status: string;
    revision: number;
  }[];
  total: number;
  page: number;
};
type List = { definitions: Row[]; total: number; page: number; assigned: Assigned };
export default function Assessments() {
  const { context, error, load } = useContext(),
    [data, setData] = useState<List | null>(null),
    [failure, setFailure] = useState(''),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0),
    [assignmentPage, setAssignmentPage] = useState(1);
  const client = context?.client?.id;
  useEffect(() => {
    if (!context?.user || !client) return;
    let cancelled = false;
    setFailure('');
    setData(null);
    (async () => {
      const assigned = await api<Assigned>(
        '/assessments/assignments?' +
          new URLSearchParams({ clientId: client, page: String(assignmentPage) }),
      );
      const library = assigned.author
        ? await api<{ definitions: Row[]; total: number; page: number }>(
            '/assessments/definitions?' +
              new URLSearchParams({ clientId: client, page: String(page) }),
          )
        : { definitions: [], total: 0, page };
      return { ...library, assigned };
    })()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [context?.user?.id, client, page, assignmentPage, retry]);
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
          <h1>Assessments</h1>
          <p>
            <Link href="/dashboard">Workspace</Link>
          </p>
          <Feedback error={failure} />
          {failure && (
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry assessments
            </button>
          )}
          {!data && !failure && <p role="status">Loading assessmentsâ€¦</p>}
          {data && (
            <>
              {data.assigned.author && (
                <>
                  <p>
                    <Link className="button primary" href="/assessments/definitions/new">
                      Build an assessment
                    </Link>
                  </p>
                  <section className="panel directory-panel">
                    <h2>Assessment definitions</h2>
                    <p>{data.total} revisions</p>
                    <div className="directory-table-wrap">
                      <table className="directory-table">
                        <caption className="sr-only">Assessment definitions</caption>
                        <thead>
                          <tr>
                            <th scope="col">Assessment</th>
                            <th scope="col">Revision</th>
                            <th scope="col">Status</th>
                            <th scope="col">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.definitions.map((row) => (
                            <tr key={row.id}>
                              <td data-label="Assessment">{row.title || 'Untitled assessment'}</td>
                              <td data-label="Revision">{row.revision}</td>
                              <td data-label="Status">{row.status}</td>
                              <td data-label="Actions">
                                <Link href={'/assessments/definitions/' + row.id}>
                                  {row.status === 'published' ? 'Revise assessment' : 'Edit draft'}
                                </Link>
                                {row.status === 'published' && (
                                  <>
                                    {' '}
                                    ·{' '}
                                    <Link href={'/assessments/definitions/' + row.id + '/assign'}>
                                      Assign assessment
                                    </Link>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                          {!data.definitions.length && (
                            <tr>
                              <td colSpan={4}>No definitions yet. Build an assessment to begin.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <nav aria-label="Assessment pages">
                      <button
                        className="secondary"
                        disabled={page <= 1}
                        onClick={() => setPage((n) => n - 1)}
                      >
                        Previous revisions
                      </button>
                      <span> Page {page} </span>
                      <button
                        className="secondary"
                        disabled={page * 20 >= data.total}
                        onClick={() => setPage((n) => n + 1)}
                      >
                        Next revisions
                      </button>
                    </nav>
                  </section>
                </>
              )}
              <section className="panel directory-panel">
                <h2>Assigned assessments</h2>
                <div className="directory-table-wrap">
                  <table className="directory-table">
                    <caption className="sr-only">Assigned assessments</caption>
                    <thead>
                      <tr>
                        <th scope="col">Assessment</th>
                        <th scope="col">Member</th>
                        <th scope="col">Status</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.assigned.assignments.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Assessment">
                            {row.title} · Revision {row.revision}
                          </td>
                          <td data-label="Member">{row.memberName}</td>
                          <td data-label="Status">{row.status.replaceAll('_', ' ')}</td>
                          <td data-label="Actions">
                            <Link href={'/assessments/assignments/' + row.id}>Open assessment</Link>
                          </td>
                        </tr>
                      ))}
                      {!data.assigned.assignments.length && (
                        <tr>
                          <td colSpan={4}>
                            No assessments are available for your current client and permissions.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <nav aria-label="Assignment pages">
                  <button
                    className="secondary"
                    disabled={assignmentPage <= 1}
                    onClick={() => setAssignmentPage((p) => p - 1)}
                  >
                    Previous assignments
                  </button>{' '}
                  Page {assignmentPage}{' '}
                  <button
                    className="secondary"
                    disabled={assignmentPage * 20 >= data.assigned.total}
                    onClick={() => setAssignmentPage((p) => p + 1)}
                  >
                    Next assignments
                  </button>
                </nav>
              </section>
              <AppealRouting client={client} csrf={context.csrf} />
            </>
          )}
        </>
      )}
    </Guest>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppealRouting } from '../components/appeal-routing';
import { api, useContext, Guest } from '../components/auth-ui';
import { useRouter } from 'next/navigation';
import { Button, Panel, PageHeader, Feedback } from '../components/ui/controls';
import { DirectoryTable, Pagination } from '../components/ui/directory';
import controls from '../components/ui/controls.module.css';
import layout from '../components/ui/form-layout.module.css';
import styles from '../components/ui/assessment-directory.module.css';
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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    setData(null);
    setPage(1);
    setAssignmentPage(1);
  }, [context?.user?.id, client]);
  useEffect(() => {
    if (!context?.user || !client) return;
    let cancelled = false;
    setFailure('');
    setLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [context?.user?.id, client, page, assignmentPage, retry]);
  return (
    <Guest>
      <div className={layout.page}>
        {!context?.user ? (
          <>
            <PageHeader title="Assessments" />
            <Feedback error={error} />
            {error ? (
              <Button onClick={() => void load()}>Try loading your session again</Button>
            ) : (
              <p role="status">Loading your session...</p>
            )}
          </>
        ) : !client ? (
          <>
            <PageHeader title="Choose a client" />
            <Link href="/clients">Choose your client</Link>
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">{context.client?.name}</p>
              <PageHeader title="Assessments" />
            </div>
            <p>
              <Link href="/dashboard">Workspace</Link>
            </p>
            <Feedback error={failure} />
            {failure && (
              <Button disabled={loading} onClick={() => setRetry((n) => n + 1)}>
                Retry assessments
              </Button>
            )}
            {loading && <p role="status">Loading assessments...</p>}
            {data && (
              <>
                {data.assigned.author && (
                  <>
                    <p>
                      <Link
                        className={`${controls.button} ${controls.primary}`}
                        href="/assessments/definitions/new"
                      >
                        Build an assessment
                      </Link>
                    </p>
                    <Panel className={`${layout.panel} ${styles.panel}`}>
                      <h2>Assessment definitions</h2>
                      <p>{data.total} revisions</p>
                      <div className={layout.tableWrap}>
                        <DirectoryTable stacked className={`${layout.table} ${styles.table}`}>
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
                                <td data-label="Assessment">
                                  {row.title || 'Untitled assessment'}
                                </td>
                                <td data-label="Revision">{row.revision}</td>
                                <td data-label="Status">{row.status}</td>
                                <td data-label="Actions">
                                  <Link href={'/assessments/definitions/' + row.id}>
                                    {row.status === 'published'
                                      ? 'Revise assessment'
                                      : 'Edit draft'}
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
                                <td colSpan={4}>
                                  No definitions yet. Build an assessment to begin.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </DirectoryTable>
                      </div>
                      <Pagination aria-label="Assessment pages">
                        <Button
                          disabled={loading || data.page <= 1}
                          onClick={() => {
                            setPage(data.page - 1);
                            setRetry((n) => n + 1);
                          }}
                        >
                          Previous revisions
                        </Button>
                        <span> Page {data.page} </span>
                        <Button
                          disabled={loading || data.page * 20 >= data.total}
                          onClick={() => {
                            setPage(data.page + 1);
                            setRetry((n) => n + 1);
                          }}
                        >
                          Next revisions
                        </Button>
                      </Pagination>
                    </Panel>
                  </>
                )}
                <Panel className={`${layout.panel} ${styles.panel}`}>
                  <h2>Assigned assessments</h2>
                  <div className={layout.tableWrap}>
                    <DirectoryTable stacked className={`${layout.table} ${styles.table}`}>
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
                              <Link href={'/assessments/assignments/' + row.id}>
                                Open assessment
                              </Link>
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
                    </DirectoryTable>
                  </div>
                  <Pagination aria-label="Assignment pages">
                    <Button
                      disabled={loading || data.assigned.page <= 1}
                      onClick={() => {
                        setAssignmentPage(data.assigned.page - 1);
                        setRetry((n) => n + 1);
                      }}
                    >
                      Previous assignments
                    </Button>
                    <span>Page {data.assigned.page}</span>
                    <Button
                      disabled={loading || data.assigned.page * 20 >= data.assigned.total}
                      onClick={() => {
                        setAssignmentPage(data.assigned.page + 1);
                        setRetry((n) => n + 1);
                      }}
                    >
                      Next assignments
                    </Button>
                  </Pagination>
                </Panel>
                <AppealRouting
                  key={`${context.user.id}:${client}`}
                  client={client}
                  csrf={context.csrf}
                />
              </>
            )}
          </>
        )}
      </div>
    </Guest>
  );
}

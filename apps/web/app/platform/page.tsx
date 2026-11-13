'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest, Pending, Feedback } from '../components/auth-ui';
type Overview = {
  clients: number;
  activeAdmins: number;
  assignments: number;
  identityMode: string;
  emailConfigured: boolean;
  aiConfigured: boolean;
};
export default function PlatformOverview() {
  const { context, error, load } = useContext(),
    router = useRouter();
  const [data, setData] = useState<Overview | null>(null),
    [failure, setFailure] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user) return;
    let current = true;
    setData(null);
    setFailure('');
    api<Overview>('/platform/overview')
      .then((row) => {
        if (current) setData(row);
      })
      .catch((e) => {
        if (current) setFailure(e.message);
      });
    return () => {
      current = false;
    };
  }, [context?.user?.id, retry]);
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : (
        <>
          <header className="page-header">
            <div>
              <p className="eyebrow">Platform</p>
              <h1>Platform overview</h1>
              <p>Manage organisations and access. Training content requires its own permissions.</p>
            </div>
          </header>
          <Feedback error={failure} />
          {failure && (
            <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
              Retry platform overview
            </button>
          )}
          {!data && !failure && <p role="status">Loading platform overview...</p>}
          {data && (
            <>
              <div className="platform-metrics">
                <section className="panel">
                  <span>Clients</span>
                  <strong>{data.clients}</strong>
                  <Link href="/platform/clients">Manage clients</Link>
                </section>
                <section className="panel">
                  <span>Active Global admins</span>
                  <strong>{data.activeAdmins}</strong>
                  <Link href="/platform/admins">Review access</Link>
                </section>
                <section className="panel">
                  <span>Administrative history</span>
                  <h2>Accountable changes</h2>
                  <Link href="/platform/audit">View audit</Link>
                </section>
              </div>
              {data.clients === 0 && (
                <section className="panel">
                  <h2>Create your first client</h2>
                  <p>Add an organisation before inviting people into a learning workspace.</p>
                  <Link className="button primary" href="/platform/clients">
                    Create first client
                  </Link>
                </section>
              )}
              {data.activeAdmins === 1 && (
                <div className="notice">
                  Only one active Global Admin remains. Add another trusted administrator to
                  maintain access continuity.
                </div>
              )}
              <section className="panel">
                <h2>System overview</h2>
                <p>
                  {data.clients} clients / {data.assignments} current Global Admin assignments
                </p>
                <dl>
                  <div>
                    <dt>Identity connection</dt>
                    <dd>
                      {data.identityMode === 'local_password'
                        ? 'Password sign-in'
                        : data.identityMode === 'mock'
                          ? 'Local mock sign-in'
                          : 'External identity configuration required'}
                    </dd>
                  </div>
                  <div>
                    <dt>External email delivery</dt>
                    <dd>
                      {data.emailConfigured
                        ? 'Configured; delivery not verified here'
                        : 'Email is not configured'}
                    </dd>
                  </div>
                  <div>
                    <dt>Live AI</dt>
                    <dd>
                      {data.aiConfigured
                        ? 'Configured; provider access not verified here'
                        : 'AI generation is not configured'}
                    </dd>
                  </div>
                </dl>
                <p>
                  Owner: Technical administrator. Configure the approved mail service and verify a
                  test inbox before enabling delivery. Confirm the approved AI provider and verify a
                  sample request before enabling generation. Credentials are managed outside this
                  screen.
                </p>
              </section>
              <p>
                <Link href="/accounts">Manage account access</Link>
              </p>
              <p>
                <Link href="/clients">Choose your client</Link>
              </p>
            </>
          )}
        </>
      )}
    </Guest>
  );
}

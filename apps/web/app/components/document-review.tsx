'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerWorkGuard } from './work-guard';
import { Button, Input, Select, Textarea, Panel, PageHeader, Feedback } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/document-review.module.css';
import recordStyles from './ui/training-record.module.css';
import { api, useContext, Guest, Pending } from './auth-ui';
import { onboardingFields } from '../../../../packages/contracts/src/onboarding';
type Review = {
  file: { id: string; name: string; status: string };
  enrolment: { id: string; title: string };
  onboardingVersion: number;
  editable: boolean;
  run: null | {
    id: string;
    version: number;
    status: string;
    engine: string | null;
    pages: number | null;
    warnings: string[];
    text: string | null;
    review: Record<string, string>;
    confirmedOnboardingId: string | null;
    error: string | null;
  };
  history: { id: string; attempt: number; status: string; version: number }[];
};
export function DocumentReview({ id, fileId }: { id: string; fileId: string }) {
  const { context, error: contextError, load: loadContext } = useContext(),
    client = context?.client?.id;
  const router = useRouter();
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  const [view, setView] = useState<Review | null>(null),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const dirty = useRef(false),
    pending = useRef(false),
    hydrated = useRef<string | null>(null),
    versions = useRef({ run: 0, onboarding: 0 });
  async function load(reset = false) {
    if (!client) return;
    try {
      const next = await api<Review>(`/enrolments/${id}/documents/${fileId}?clientId=${client}`);
      setView(next);
      if (reset || hydrated.current !== next.run?.id) {
        setDraft(next.run?.review ?? {});
        dirty.current = false;
        hydrated.current = next.run?.id ?? null;
        versions.current = { run: next.run?.version ?? 0, onboarding: next.onboardingVersion };
      } else if (!dirty.current) {
        versions.current = { run: next.run?.version ?? 0, onboarding: next.onboardingVersion };
      }
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load(true);
  }, [client, id, fileId]);
  useEffect(() => {
    if (!view?.run || !['queued', 'waiting_scan', 'running'].includes(view.run.status)) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [view?.run?.status, client]);
  useEffect(
    () => registerWorkGuard(() => ({ dirty: dirty.current, pending: pending.current })),
    [],
  );
  async function request() {
    if (!client || !context || busy) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/enrolments/${id}/documents/${fileId}`, { clientId: client, csrf: context.csrf });
      setMessage('Extraction requested. Quarantined files wait for scanner approval.');
      await load(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function save(confirm: boolean) {
    if (!client || !context || !view?.run || busy) return;
    if (
      confirm &&
      !window.confirm(
        'Confirm these reviewed findings into a new onboarding revision? Check them against the original document first.',
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const data = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, value === '' ? null : value]),
      );
      await api(`/enrolments/${id}/document-reviews/${view.run.id}`, {
        clientId: client,
        csrf: context.csrf,
        data,
        version: versions.current.run,
        onboardingVersion: versions.current.onboarding,
        confirm,
      });
      dirty.current = false;
      setMessage(
        confirm
          ? 'Reviewed findings confirmed as a new onboarding version. Review any curriculum draft before approval.'
          : 'Review draft saved. Findings have not been confirmed or sent to AI.',
      );
      await load(true);
    } catch (e) {
      setError((e as Error).message + ' Your review input is retained.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const run = view?.run,
    canReview =
      view?.editable && run?.status === 'ready' && view.file.status === 'clean' && !run.error;
  return (
    <Guest>
      <div className={layout.page}>
        {!context?.user ? (
          <Pending error={contextError} retry={loadContext} />
        ) : !client ? (
          <>
            <PageHeader title="Choose a client" />
            <Link href="/clients">Choose your client</Link>
          </>
        ) : (
          <>
            <Link href={`/enrolments/${id}/onboarding?step=assessment`}>
              Back to assessment findings
            </Link>
            <PageHeader title="Review document extraction" />
            <Feedback error={error} success={message} />
            {!view && !error && <p role="status">Loading document review…</p>}
            {error && (
              <Button
                disabled={busy}
                onClick={() => {
                  if (
                    !dirty.current ||
                    window.confirm('Reload this review? Copy your unsaved findings first.')
                  )
                    void load(true);
                }}
              >
                Reload review
              </Button>
            )}
            {view && (
              <>
                <p>
                  {view.enrolment.title} · {view.file.name} · Scan: {view.file.status}
                </p>
                <p className={recordStyles.notice}>
                  Extracted text is untrusted draft material. Compare it with the original, correct
                  errors and select only relevant findings. Extraction alone confirms nothing and
                  sends nothing to AI.
                </p>
                {view.file.status === 'clean' && (
                  <p>
                    <a href={'/api/files/' + fileId} target="_blank" rel="noreferrer">
                      Download original for comparison
                    </a>
                  </p>
                )}
                {!view.editable && (
                  <p className={recordStyles.notice}>
                    This enrolment has started. Its onboarding findings cannot be replaced through
                    this workflow.
                  </p>
                )}
                {view.editable &&
                  (!run || run.status === 'failed') &&
                  ['clean', 'quarantined', 'scanning'].includes(view.file.status) && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      aria-busy={busy}
                      onClick={() => void request()}
                    >
                      {busy
                        ? 'Requesting extraction…'
                        : run
                          ? 'Retry extraction'
                          : 'Request extraction'}
                    </Button>
                  )}
                {run && (
                  <Panel className={layout.panel}>
                    <h2>Extraction status: {run.status.replaceAll('_', ' ')}</h2>
                    <p>
                      Revision {run.version}
                      {run.engine ? ' · ' + run.engine : ''}
                      {run.pages ? ' · ' + run.pages + ' pages' : ''}
                    </p>
                    {['waiting_scan', 'queued', 'running'].includes(run.status) && (
                      <p role="status">
                        {run.status === 'waiting_scan'
                          ? 'Waiting for malware scanning. A missing scanner keeps this file quarantined.'
                          : 'The extraction worker is processing this request.'}{' '}
                        Status refreshes automatically.
                      </p>
                    )}
                    <Feedback error={run.error ?? ''} />
                    {run.error && (
                      <p>
                        <Link href={`/enrolments/${id}/onboarding?step=assessment`}>
                          Use manual assessment entry
                        </Link>
                      </p>
                    )}
                    {run.warnings.map((warning, i) => (
                      <p className={recordStyles.notice} key={i}>
                        {warning}
                      </p>
                    ))}
                    {run.text !== null && (
                      <details open>
                        <summary>Original extracted text (read-only)</summary>
                        <pre className={styles.text}>{run.text}</pre>
                      </details>
                    )}
                    {run.status === 'confirmed' && (
                      <p>
                        Confirmed into onboarding. Later manual edits require a new confirmation;
                        this receipt preserves the earlier decision.
                      </p>
                    )}
                  </Panel>
                )}
                {canReview && (
                  <Panel className={layout.panel}>
                    <h2>Correct and confirm relevant findings</h2>
                    <p>
                      Summarise relevant sections in at most 4,000 characters. Preserve the reported
                      scale and distinguish provider scores, observed evidence and self reports.
                      Source file, hash and extraction revision are attached automatically.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void save(false);
                      }}
                    >
                      <fieldset disabled={busy}>
                        <legend className="sr-only">Document findings review</legend>
                        {Object.entries(onboardingFields.assessment)
                          .filter(([key]) => key !== 'source')
                          .map(([key, label]) => (
                            <div key={key}>
                              <label htmlFor={'review-' + key}>{label}</label>
                              {key === 'date' ? (
                                <Input
                                  id={'review-' + key}
                                  type="date"
                                  value={draft[key] ?? ''}
                                  onChange={(e) => {
                                    dirty.current = true;
                                    setDraft((d) => ({ ...d, [key]: e.target.value }));
                                  }}
                                />
                              ) : key === 'kind' ? (
                                <Select
                                  id={'review-' + key}
                                  value={draft[key] ?? ''}
                                  onChange={(e) => {
                                    dirty.current = true;
                                    setDraft((d) => ({ ...d, [key]: e.target.value }));
                                  }}
                                >
                                  <option value="">Choose evidence type</option>
                                  {['provider score', 'self report', 'observed evidence'].map(
                                    (v) => (
                                      <option key={v}>{v}</option>
                                    ),
                                  )}
                                </Select>
                              ) : (
                                <Textarea
                                  id={'review-' + key}
                                  rows={key === 'findings' ? 10 : 2}
                                  maxLength={4000}
                                  value={draft[key] ?? ''}
                                  onChange={(e) => {
                                    dirty.current = true;
                                    setDraft((d) => ({ ...d, [key]: e.target.value }));
                                  }}
                                />
                              )}
                            </div>
                          ))}
                      </fieldset>
                      <div className={layout.actions}>
                        <Button type="submit" disabled={busy} aria-busy={busy}>
                          {busy ? 'Saving review…' : 'Save review draft'}
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          disabled={busy}
                          onClick={() => void save(true)}
                        >
                          Confirm reviewed findings
                        </Button>
                      </div>
                    </form>
                  </Panel>
                )}
                {view.history.length > 0 && (
                  <details className={styles.history}>
                    <summary>Extraction attempts</summary>
                    <ul>
                      {view.history.map((h) => (
                        <li key={h.id}>
                          Attempt {h.attempt} · {h.status.replaceAll('_', ' ')} · Revision{' '}
                          {h.version}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Guest>
  );
}

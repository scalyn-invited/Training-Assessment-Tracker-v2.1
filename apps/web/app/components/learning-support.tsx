'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './auth-ui';
import { Button, Input, Panel, Feedback } from './ui/controls';
import { registerWorkGuard } from './work-guard';
import layout from './ui/form-layout.module.css';
import styles from './ui/learning-progress.module.css';
import recordStyles from './ui/training-record.module.css';
import { ReasonAction } from './learning-controls';
import type { LearningSupport as SupportService } from '../../../../packages/domain/src/learning-support';
type View = Awaited<ReturnType<SupportService['read']>>;
export function LearningSupport({
  id,
  client,
  csrf,
  active,
}: {
  id: string;
  client: string;
  csrf: string;
  active: boolean;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [block, setBlock] = useState('1'),
    [busy, setBusy] = useState(false);
  const sequence = useRef(0),
    pending = useRef(false);
  const savedBlock = useRef('1');
  useEffect(
    () =>
      registerWorkGuard(() => ({
        dirty: !!view?.coordinator && block !== savedBlock.current,
        pending: pending.current,
      })),
    [block, view?.coordinator],
  );
  async function load() {
    const request = ++sequence.current;
    try {
      const next = await api<View>(`/enrolments/${id}/support?clientId=${client}`);
      if (request === sequence.current) {
        setView(next);
        setError('');
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    setView(null);
    void load();
    return () => {
      sequence.current++;
    };
  }, [id, client]);
  const queued =
    view?.proposals.some((p) => p.status === 'queued') ||
    view?.suggestions.some((s) => s.status === 'queued');
  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [queued, id, client]);
  async function mutate(data: Record<string, unknown>, success: string) {
    await api(`/enrolments/${id}/support`, { csrf, clientId: client, ...data });
    setMessage(success);
    await load();
  }
  return (
    <Panel className={`${layout.panel} ${styles.panel}`} aria-label="Learning support">
      <h2>Learning support</h2>
      <p>
        Future teaching changes require human approval. Targets, planned minutes and completed work
        stay protected.
      </p>
      <Feedback error={error} success={message} />
      {!view ? (
        <>
          {error ? (
            <Button onClick={() => void load()}>Try loading support again</Button>
          ) : (
            <p role="status">Loading support...</p>
          )}
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => void load()}>
            Refresh support status
          </Button>
          {queued && (
            <p role="status">
              Support is being prepared. You can leave this page and return later.
            </p>
          )}
          {view.coordinator && (
            <>
              {!active && (
                <p className={recordStyles.notice}>
                  Adaptation requests and approvals require an active programme.
                </p>
              )}
              <details>
                <summary>Request future adaptation</summary>
                <p>
                  Use approved evidence from block N. The first eligible block N+2 or later is
                  selected; started or frozen blocks cannot change.
                </p>
                <label>
                  Evidence block number
                  <Input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={block}
                    onChange={(e) => setBlock(e.target.value)}
                  />
                </label>
                <ReasonAction
                  shared
                  label="Request adaptation"
                  help="Only teaching explanations, examples, activities and tools may change. Review the result before approving it."
                  confirm={`Request a provisional adaptation using approved evidence from block ${block}?`}
                  disabled={
                    !active ||
                    !Number.isInteger(Number(block)) ||
                    Number(block) < 1 ||
                    Number(block) > 12
                  }
                  run={async (reason) => {
                    await mutate(
                      { action: 'propose', evidenceBlock: Number(block), reason },
                      'Adaptation request recorded. Review its status below.',
                    );
                    savedBlock.current = block;
                  }}
                />
              </details>
            </>
          )}
          {!view.proposals.length && (
            <p>
              No {view.coordinator ? '' : 'approved '}adaptations yet. The existing learning plan
              remains in effect.
            </p>
          )}
          {view.proposals.map((p) => (
            <article key={p.id} className={styles.article}>
              <h3>
                {p.replacement
                  ? `Block ${p.replacement.number} adaptation`
                  : `Support from block ${p.evidenceBlock}`}
              </h3>
              <p>
                <strong>{p.status.replaceAll('_', ' ')}</strong> / Evidence block {p.evidenceBlock}
              </p>
              <p>{p.reason}</p>
              {p.status === 'provisional' && (
                <p className={recordStyles.notice}>
                  Provisional only. The current lesson content has not changed.
                </p>
              )}
              {p.status === 'source_review_required' && (
                <p className={recordStyles.notice}>
                  Source evidence was regraded. Review this approved adaptation with the learner;
                  taught history has been retained.
                </p>
              )}
              {p.status === 'stale' && (
                <p>
                  The source evidence or schedule changed. Review current evidence and request a new
                  adaptation if needed.
                </p>
              )}
              {p.status === 'final_support' && (
                <p>
                  No eligible future block remains. Discuss final support with the learner without
                  changing completed work or targets.
                </p>
              )}
              {p.status === 'failed' && (
                <p>
                  This request could not produce an eligible adaptation. Review current evidence and
                  block eligibility before requesting again.
                </p>
              )}
              {p.status === 'ambiguous' && (
                <p>
                  The provider outcome is uncertain. Ask an administrator to reconcile the AI run
                  before requesting again.
                </p>
              )}
              {p.replacement && (
                <details>
                  <summary>Review teaching changes</summary>
                  {p.replacement.lessons.map((lesson, i) => (
                    <div key={i}>
                      <h4>{lesson.title}</h4>
                      <p>{lesson.explanation}</p>
                      <p>{lesson.example}</p>
                      <p>{lesson.activity}</p>
                      <p>Tools: {lesson.tools || 'No additional tools'}</p>
                    </div>
                  ))}
                </details>
              )}
              <details>
                <summary>Adaptation evidence lineage</summary>
                <p>
                  {p.policy} / {new Date(p.createdAt).toISOString()}
                </p>
                <ul>
                  {p.sourceIds.map((source) => (
                    <li key={source}>{source}</li>
                  ))}
                </ul>
              </details>
              {view.coordinator && p.status === 'provisional' && (
                <ReasonAction
                  shared
                  label="Approve adaptation"
                  help="Approve this exact proposal and base version. Current evidence, dates, freeze and permission are checked again."
                  confirm={`Approve these teaching changes for block ${p.replacement?.number}? This creates a new lesson version visible to the learner.`}
                  disabled={!active}
                  primary
                  run={(reason) =>
                    mutate(
                      { action: 'approve', proposalId: p.id, baseId: p.baseId, reason },
                      'Adaptation approved. The new teaching version is available.',
                    )
                  }
                />
              )}
            </article>
          ))}
          {view.coordinator && (
            <>
              <h3>KPI support suggestions</h3>
              <p>
                Suggestions are provisional guidance. They cannot change targets or daily capacity.
              </p>
              <Button
                variant="secondary"
                disabled={busy}
                aria-busy={busy}
                onClick={async () => {
                  if (
                    pending.current ||
                    !window.confirm(
                      'Request provisional support suggestions from current KPI evidence? Targets and capacity will stay unchanged.',
                    )
                  )
                    return;
                  pending.current = true;
                  setBusy(true);
                  setError('');
                  try {
                    await mutate(
                      { action: 'suggest' },
                      'Support suggestions requested. Review their status below.',
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    pending.current = false;
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Requesting suggestions...' : 'Request support suggestions'}
              </Button>
              {!view.suggestions.length && (
                <p>
                  No support suggestions requested yet. Request guidance when reviewing the
                  learner's progress.
                </p>
              )}
              {view.suggestions.map((s) => (
                <article key={s.id} className={styles.article}>
                  <h4>Support suggestions: {s.status.replaceAll('_', ' ')}</h4>
                  {s.actions.length > 0 && (
                    <ul>
                      {s.actions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                  )}
                  {s.status === 'failed' && (
                    <p>
                      Suggestions could not be prepared. Review current access and AI settings
                      before requesting again.
                    </p>
                  )}
                  {s.status === 'ambiguous' && (
                    <p>
                      The provider outcome is uncertain. Ask an administrator to reconcile the AI
                      run before requesting again.
                    </p>
                  )}
                  <details>
                    <summary>Suggestion evidence lineage</summary>
                    <p>{new Date(s.createdAt).toISOString()}</p>
                    <ul>
                      {s.sourceIds.map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  </details>
                </article>
              ))}
            </>
          )}
        </>
      )}
    </Panel>
  );
}

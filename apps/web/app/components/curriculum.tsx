'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea, Panel, PageHeader, Badge, Feedback } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/curriculum.module.css';
import recordStyles from './ui/training-record.module.css';
import { registerWorkGuard } from './work-guard';
import { GenerationRequest } from './programme-generation';
import { api, useContext, Guest, Pending } from './auth-ui';
import {
  lessonMinuteFields,
  type LearningBlock,
  type ProgrammeContent,
} from '../../../../packages/contracts/src/programme';
type View = {
  enrolment: { id: string; title: string; status: string; memberName: string };
  calendar: { version: number; timezone: string };
  references: {
    competencies: string[];
    measures: { name: string; target: string; unit: string; evidence: string }[];
    resources: Record<string, string>;
    dailyMinutes: number;
  };
  plan: { id: string; version: number; state: string; content: ProgrammeContent; reason: string };
  versions: { version: number; state: string; reason: string }[];
  previous: ProgrammeContent | null;
  approval: null | { content_hash: string; reason: string };
  editable: boolean;
};
const fields = {
  title: 'Lesson title',
  explanation: 'Explanation and learning content',
  example: 'Worked example or approved demonstration',
  activity: 'Practical activity and deliverable',
  tools: 'Permitted tools',
  completion: 'Completion criteria and evidence required',
} as const;
const blockFields = {
  objective: 'Learning objective',
  prerequisites: 'Prerequisites and sequence',
  competency: 'Target competency number',
  criterion_one: 'Criterion one',
  criterion_two: 'Criterion two',
  weight_one: 'Weight one',
  weight_two: 'Weight two',
};
function differences(old: LearningBlock, current: LearningBlock) {
  const result: { label: string; before: unknown; after: unknown }[] = [];
  for (const [field, label] of Object.entries(blockFields)) {
    const a = old[field as keyof LearningBlock],
      b = current[field as keyof LearningBlock];
    if (a !== b) result.push({ label, before: a, after: b });
  }
  current.lessons.forEach((lesson, i) => {
    for (const [field, value] of Object.entries(lesson)) {
      const before = old.lessons[i]?.[field as keyof typeof lesson];
      if (before !== value) result.push({ label: `Day ${i + 1} · ${field}`, before, after: value });
    }
  });
  return result;
}
export function Curriculum({ id }: { id: string }) {
  const { context, error: contextError, load: loadContext } = useContext(),
    client = context?.client?.id;
  const router = useRouter();
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  const [view, setView] = useState<View | null>(null),
    [block, setBlock] = useState<LearningBlock | null>(null),
    [index, setIndex] = useState(0),
    [reason, setReason] = useState(''),
    [rationale, setRationale] = useState(''),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const rationaleDirty = useRef(false),
    generationDirty = useRef(false),
    generationPending = useRef(false);
  const dirty = useRef(false),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  async function load(version?: number, at = 0) {
    if (!client) return;
    setError('');
    setMessage('');
    try {
      const next = await api<View>(
        `/enrolments/${id}/plan?` +
          new URLSearchParams({
            clientId: client,
            ...(version ? { version: String(version) } : {}),
          }),
      );
      const position = at >= 0 && at < next.plan.content.blocks.length ? at : 0;
      setView(next);
      setIndex(position);
      setBlock(structuredClone(next.plan.content.blocks[position]));
      setReason('');
      setRationale('');
      rationaleDirty.current = false;
      if (!next.editable) generationDirty.current = false;
      dirty.current = false;
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?version=${next.plan.version}&block=${position}`,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void load(Number(params.get('version')) || undefined, Number(params.get('block')) || 0);
  }, [client, id]);
  useEffect(
    () =>
      registerWorkGuard(() => ({
        dirty: dirty.current || rationaleDirty.current || generationDirty.current,
        pending: pending.current || generationPending.current,
      })),
    [],
  );
  function canLeave(includeGeneration = true) {
    return (
      !pending.current &&
      !generationPending.current &&
      (!(
        dirty.current ||
        rationaleDirty.current ||
        (includeGeneration && generationDirty.current)
      ) ||
        window.confirm('Discard unsaved edits to this block? Saved versions are preserved.'))
    );
  }
  function select(at: number) {
    if (!view || !canLeave(false)) return;
    setBlock(structuredClone(view.plan.content.blocks[at]));
    setIndex(at);
    setReason('');
    setRationale('');
    rationaleDirty.current = false;
    dirty.current = false;
    setError('');
    setMessage('');
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?version=${view.plan.version}&block=${at}`,
    );
    setTimeout(() => heading.current?.focus(), 0);
  }
  function change(key: string, value: unknown) {
    dirty.current = true;
    setBlock((b) => (b ? { ...b, [key]: value } : b));
    setMessage('Unsaved block changes');
  }
  function lesson(i: number, key: string, value: unknown) {
    dirty.current = true;
    setBlock((b) =>
      b ? { ...b, lessons: b.lessons.map((l, n) => (n === i ? { ...l, [key]: value } : l)) } : b,
    );
    setMessage('Unsaved block changes');
  }
  async function save() {
    if (!client || !context || !view || !block || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ version: number }>(`/enrolments/${id}/plan/edit`, {
        clientId: client,
        csrf: context.csrf,
        version: view.plan.version,
        block: index,
        data: block,
        reason,
      });
      dirty.current = false;
      await load(result.version, index);
      setMessage('New draft version saved. Review must be requested again.');
    } catch (e) {
      setError((e as Error).message + ' Your block input is retained.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function review(approve: boolean) {
    if (!client || !context || !view || pending.current) return;
    if (dirty.current) {
      setError('Save your block changes before reviewing the complete baseline.');
      return;
    }
    if (
      approve &&
      !window.confirm(
        `Approve exact curriculum version ${view.plan.version} for ${view.enrolment.memberName}? This reserves shared capacity but does not start training.`,
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/enrolments/${id}/plan/review`, {
        clientId: client,
        csrf: context.csrf,
        version: view.plan.version,
        approve,
        reason: rationale,
      });
      await load(view.plan.version, index);
      setMessage(
        approve
          ? 'Exact plan version approved. Enrolment is ready; training has not started.'
          : 'All blocks validated. This exact version is awaiting coordinator approval.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const previous = view?.previous?.blocks[index],
    changes = previous && block ? differences(previous, block) : [];
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
            <Link href="/enrolments">← Training records</Link>
            <Feedback error={error} success={message} />
            {!view || !block ? (
              <>
                <PageHeader title="Curriculum editor" />
                {error ? (
                  <Button onClick={() => void load()}>Retry curriculum</Button>
                ) : (
                  <p role="status">Loading curriculum…</p>
                )}
              </>
            ) : (
              <>
                <div className={recordStyles.heading}>
                  <div>
                    <p className="eyebrow">Curriculum · Version {view.plan.version}</p>
                    <PageHeader title={view.enrolment.title}>
                      {view.enrolment.memberName} · {view.calendar.timezone}
                    </PageHeader>
                  </div>
                  <Badge>{view.plan.state.replaceAll('_', ' ')}</Badge>
                </div>
                <p className={recordStyles.notice}>
                  {view.plan.state === 'approved'
                    ? 'This exact baseline is approved and reserves shared capacity. Training has not been activated by this approval.'
                    : 'Preview only. Draft content is not approved learning material and does not reserve capacity.'}
                </p>
                <div className={layout.actions}>
                  <Link href={`/enrolments/${id}/onboarding?step=review`}>
                    Review onboarding or reschedule
                  </Link>
                  <details>
                    <summary>Version history</summary>
                    <ul>
                      {view.versions.map((v) => (
                        <li key={v.version}>
                          <Button
                            disabled={busy}
                            onClick={() => {
                              if (canLeave()) void load(v.version, index);
                            }}
                          >
                            Version {v.version} · {v.state.replaceAll('_', ' ')}
                          </Button>{' '}
                          · {v.reason}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
                {view.editable && (
                  <GenerationRequest
                    id={id}
                    client={client}
                    csrf={context.csrf}
                    version={view.plan.version}
                    onPending={(value) => {
                      generationPending.current = value;
                    }}
                    onDirty={(value) => {
                      generationDirty.current = value;
                    }}
                    canQueue={() => !dirty.current && !rationaleDirty.current && !pending.current}
                  />
                )}
                <nav className={styles.steps} aria-label="Learning blocks">
                  {view.plan.content.blocks.map((b, i) => (
                    <Button
                      key={i}
                      aria-current={i === index ? 'page' : undefined}
                      disabled={busy}
                      onClick={() => select(i)}
                    >
                      Block {i + 1} · {b.start}
                    </Button>
                  ))}
                </nav>
                <Panel className={layout.panel + ' ' + styles.panel}>
                  <h2 tabIndex={-1} ref={heading}>
                    Block {index + 1} · {block.start}
                  </h2>
                  <p className={styles.subtle}>
                    Future adaptation cutoff:{' '}
                    {new Intl.DateTimeFormat('en-GB', {
                      timeZone: view.calendar.timezone,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(block.freeze_at))}
                    . Calendar version {view.calendar.version}. Baseline approval does not activate
                    training.
                  </p>
                  <details>
                    <summary>Confirmed competency, KPI and resource references</summary>
                    <h3>Competencies</h3>
                    <ol>
                      {view.references.competencies.map((v, i) => (
                        <li key={i}>{v}</li>
                      ))}
                    </ol>
                    <h3>Measures</h3>
                    <ol>
                      {view.references.measures.map((v, i) => (
                        <li key={i}>
                          {v.name} · {v.target} {v.unit} · {v.evidence}
                        </li>
                      ))}
                    </ol>
                    <h3>Approved resource catalogue</h3>
                    <p>
                      {view.references.resources.title} · {view.references.resources.reference}
                    </p>
                    <p>
                      Permission: {view.references.resources.licence} · Cost:{' '}
                      {view.references.resources.cost} · Access: {view.references.resources.access}
                    </p>
                    <p>
                      Each lesson uses this reviewed resource. Changes require new onboarding and a
                      refreshed draft.
                    </p>
                  </details>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save();
                    }}
                  >
                    <fieldset disabled={!view.editable || busy}>
                      <legend className="sr-only">Block content</legend>
                      <label>
                        Learning objective
                        <Textarea
                          aria-label="Learning objective"
                          rows={3}
                          maxLength={4000}
                          value={block.objective ?? ''}
                          onChange={(e) => change('objective', e.target.value)}
                        />
                      </label>
                      <label>
                        Prerequisites and sequence
                        <Textarea
                          aria-label="Prerequisites and sequence"
                          rows={2}
                          maxLength={4000}
                          value={block.prerequisites ?? ''}
                          onChange={(e) => change('prerequisites', e.target.value)}
                        />
                      </label>
                      <label>
                        Target competency number
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={block.competency}
                          onChange={(e) =>
                            change(
                              'competency',
                              e.target.value === '' ? '' : Number(e.target.value),
                            )
                          }
                        />
                      </label>
                      <fieldset className={styles.lesson}>
                        <legend>Assessment rubric</legend>
                        <p>
                          Score range 0–100. Weights must total 1. Criteria reference this block’s
                          competency and lesson completion evidence.
                        </p>
                        <div className={styles.grid}>
                          {(['one', 'two'] as const).map((key) => (
                            <div key={key}>
                              <label>
                                Criterion {key} and evidence expectations
                                <Textarea
                                  aria-label={`Criterion ${key} and evidence expectations`}
                                  rows={3}
                                  maxLength={2000}
                                  value={block[`criterion_${key}`] ?? ''}
                                  onChange={(e) => change(`criterion_${key}`, e.target.value)}
                                />
                              </label>
                              <label>
                                Weight {key}
                                <Input
                                  type="number"
                                  step="0.01"
                                  min={0}
                                  max={1}
                                  required
                                  value={block[`weight_${key}`]}
                                  onChange={(e) =>
                                    change(
                                      `weight_${key}`,
                                      e.target.value === '' ? '' : Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          ))}
                        </div>
                      </fieldset>
                      {block.lessons.map((l, i) => (
                        <details
                          className={styles.lesson}
                          key={`${index}-${i}`}
                          open={i === 0 ? true : undefined}
                        >
                          <summary>
                            Day {i + 1} · {l.date} · {l.title || 'Lesson content needed'}
                          </summary>
                          {Object.entries(fields).map(([key, label]) => (
                            <label key={key}>
                              {label}
                              <Textarea
                                aria-label={label}
                                rows={['explanation', 'example', 'activity'].includes(key) ? 4 : 2}
                                maxLength={8000}
                                value={l[key as keyof typeof fields] ?? ''}
                                onChange={(e) => lesson(i, key, e.target.value)}
                              />
                            </label>
                          ))}
                          <div className={styles.grid}>
                            {lessonMinuteFields.map((key) => (
                              <label key={key}>
                                {key[0].toUpperCase() + key.slice(1)} minutes
                                <Input
                                  type="number"
                                  min={0}
                                  max={120}
                                  value={l[key] ?? 0}
                                  onChange={(e) =>
                                    lesson(
                                      i,
                                      key,
                                      e.target.value === '' ? null : Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                            ))}
                            <label>
                              Linked KPI number
                              <Input
                                type="number"
                                required
                                min={1}
                                max={view.references.measures.length}
                                value={l.kpi ?? 1}
                                onChange={(e) =>
                                  lesson(
                                    i,
                                    'kpi',
                                    e.target.value === '' ? '' : Number(e.target.value),
                                  )
                                }
                              />
                            </label>
                          </div>
                          <p className={styles.subtle}>
                            Combined time must be 15–{view.references.dailyMinutes} minutes,
                            including assessment and revision.
                          </p>
                        </details>
                      ))}
                      {view.editable && (
                        <>
                          <label>
                            Reason for this version
                            <Input
                              required
                              minLength={8}
                              maxLength={2000}
                              value={reason}
                              onChange={(e) => {
                                dirty.current = true;
                                setReason(e.target.value);
                              }}
                            />
                          </label>
                          <Button type="submit" variant="primary" aria-busy={busy}>
                            {busy ? 'Saving version…' : 'Save new draft version'}
                          </Button>
                        </>
                      )}
                    </fieldset>
                  </form>
                </Panel>
                {previous && (
                  <details className={layout.panel + ' ' + styles.comparison}>
                    <summary>Compare this block with previous version</summary>
                    {changes.length === 0 ? (
                      <p>No content changes in this block.</p>
                    ) : (
                      changes.map((c, i) => (
                        <div key={i}>
                          <h3>{c.label}</h3>
                          <div className={styles.grid}>
                            <p className={styles.preserve}>
                              <strong>Previous</strong>
                              <br />
                              {String(c.before ?? 'Not set')}
                            </p>
                            <p className={styles.preserve}>
                              <strong>Current</strong>
                              <br />
                              {String(c.after ?? 'Not set')}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </details>
                )}
                {view.editable && ['draft', 'needs_review'].includes(view.plan.state) && (
                  <Panel className={layout.panel + ' ' + styles.panel}>
                    <h2>Review the complete baseline</h2>
                    <p>
                      All {view.plan.content.blocks.length} blocks need usable lessons, rubric
                      weights and valid time budgets. Approval rechecks current permissions, input
                      versions and shared capacity in one transaction.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void review(view.plan.state === 'needs_review');
                      }}
                    >
                      {view.plan.state === 'needs_review' && (
                        <label>
                          Approval rationale
                          <Input
                            required
                            minLength={8}
                            maxLength={2000}
                            value={rationale}
                            disabled={busy}
                            onChange={(e) => {
                              rationaleDirty.current = Boolean(e.target.value);
                              setRationale(e.target.value);
                            }}
                          />
                        </label>
                      )}
                      <Button type="submit" disabled={busy} aria-busy={busy}>
                        {busy
                          ? 'Checking baseline…'
                          : view.plan.state === 'needs_review'
                            ? `Approve exact version ${view.plan.version}`
                            : 'Validate all blocks and request review'}
                      </Button>
                    </form>
                  </Panel>
                )}
                {view.approval && (
                  <Panel className={layout.panel + ' ' + styles.panel}>
                    <h2>Approval receipt</h2>
                    <p>{view.approval.reason}</p>
                    <p>
                      Exact content hash:{' '}
                      <code style={{ overflowWrap: 'anywhere' }}>{view.approval.content_hash}</code>
                    </p>
                  </Panel>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Guest>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Select,
  Textarea,
  Panel,
  PageHeader,
  Badge,
  Feedback as SharedFeedback,
} from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/learning-delivery.module.css';
import recordStyles from './ui/training-record.module.css';
import { ReasonAction } from './learning-controls';
import { LearningLifecycle } from './learning-lifecycle';
import { LearningReview, type LearningReceiptView } from './learning-review';
import { registerWorkGuard, leaveAfterConfirmedMutation } from './work-guard';
import lessonStyles from './ui/learning-lesson.module.css';
import { ResponseEvidence } from './response-evidence';
import receiptStyles from './ui/submission-receipt.module.css';
import { api, useContext, Guest } from './auth-ui';
import type { Delivery } from '../../../../packages/domain/src/delivery';
type Overview = Awaited<ReturnType<Delivery['read']>>;
type LessonView = Awaited<ReturnType<Delivery['lesson']>>;
type ReceiptView = LearningReceiptView;
type Work = LessonView['draft'];
function useDeliveryView<T>(path: string) {
  const ctx = useContext(),
    client = ctx.context?.client?.id;
  const [view, setView] = useState<T | null>(null),
    [error, setError] = useState('');
  const sequence = useRef(0);
  async function load() {
    if (!client) return;
    const request = ++sequence.current;
    setError('');
    try {
      const next = await api<T>(path + '?clientId=' + client);
      if (request !== sequence.current) return;
      setView(next);
      return next;
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
  }, [path, client]);
  return { ...ctx, loadContext: ctx.load, client, view, setView, error: error || ctx.error, load };
}
export function LearningDelivery({ id }: { id: string }) {
  const s = useDeliveryView<Overview>(`/enrolments/${id}/delivery`),
    v = s.view;
  const router = useRouter();
  useEffect(() => {
    if (s.context && !s.context.user) router.replace('/login');
  }, [s.context, router]);
  async function action(path: string, data: Record<string, unknown>) {
    await api(`/enrolments/${id}/delivery${path}`, {
      csrf: s.context!.csrf,
      clientId: s.client,
      ...data,
    });
    await s.load();
  }
  return (
    <Guest>
      <div className={layout.page}>
        <Link href="/enrolments">Back to training records</Link>
        {!s.context?.user || !v ? (
          <>
            <PageHeader title="Today and learning plan" />
            <SharedFeedback error={s.error} />
            {s.error ? (
              <Button onClick={() => void (s.context?.user ? s.load() : s.loadContext())}>
                Try loading again
              </Button>
            ) : (
              <p role="status">
                {s.context?.user ? 'Loading learning plan...' : 'Loading your session...'}
              </p>
            )}
          </>
        ) : (
          <>
            <div className={recordStyles.heading}>
              <div>
                <p className="eyebrow">{v.memberName}</p>
                <PageHeader title="Today and learning plan" />
                <p>
                  {v.enrolment.title} / {v.enrolment.timezone}
                </p>
              </div>
              <Badge>{v.enrolment.status}</Badge>
            </div>
            <p>
              <Link href={`/enrolments/${id}/plan`}>Curriculum and approval history</Link>
            </p>
            <p>
              <Link href={`/enrolments/${id}/progress`}>Progress and evidence</Link>
            </p>
            <SharedFeedback error={s.error} />
            {v.coordinator && v.enrolment.status === 'ready' && (
              <Panel className={layout.panel + ' ' + styles.panel}>
                <h2>Activate the approved programme</h2>
                <ReasonAction
                  shared
                  primary
                  label="Activate programme"
                  help="Activation pins the approved lessons and rubric. A newer unapproved draft does not replace approved content."
                  confirm="Activate the approved programme and open scheduled lessons for this member?"
                  run={(reason) => action('/activate', { version: v.enrolment.version, reason })}
                />
              </Panel>
            )}
            {v.coordinator && ['active', 'paused', 'completed'].includes(v.enrolment.status) && (
              <LearningLifecycle
                id={id}
                client={s.client!}
                csrf={s.context!.csrf}
                version={v.enrolment.version}
                refresh={s.load}
              />
            )}
            {!v.blocks.length && (
              <p className={recordStyles.notice}>
                Lessons become available after your coordinator activates an approved programme.
              </p>
            )}
            {v.blocks.map((b) => (
              <Panel className={layout.panel + ' ' + styles.panel} key={b.id}>
                <h2>
                  Block {b.number} / {b.content.start}
                </h2>
                <p>{b.content.objective}</p>
                <p>
                  Version {b.version} /{' '}
                  {b.startedAt ? 'Started; version locked' : 'Upcoming or available'}
                </p>
                <ul className={styles.lessons}>
                  {b.content.lessons.map((l, i) => (
                    <li key={i}>
                      <div>
                        <Link href={`/enrolments/${id}/delivery/${b.id}/${i}`}>{l.title}</Link>
                        <small>
                          {l.date} /{' '}
                          {(l.reading ?? 0) +
                            (l.practice ?? 0) +
                            (l.assessment ?? 0) +
                            (l.revision ?? 0)}{' '}
                          minutes{l.date === v.today ? ' / Today' : ''}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
                {v.coordinator && v.enrolment.status === 'active' && !b.startedAt && (
                  <details>
                    <summary>Authorise early start</summary>
                    <ReasonAction
                      shared
                      label="Authorise and lock block"
                      help="This opens future lessons in this block and locks its version immediately."
                      confirm="Authorise early start and lock this block version?"
                      run={(reason) => action(`/${b.id}/early-start`, { reason })}
                    />
                  </details>
                )}
              </Panel>
            ))}
            <Panel className={layout.panel + ' ' + styles.panel}>
              <h2>Submissions and review</h2>
              {v.submissions.length ? (
                <ul>
                  {v.submissions.map((a) => (
                    <li key={a.id}>
                      <Link href={`/enrolments/${id}/submissions/${a.id}`}>
                        Attempt {a.attempt} / {a.status.replaceAll('_', ' ')} /{' '}
                        {String(a.created_at)}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No submissions yet. Submitted lesson work appears here.</p>
              )}
            </Panel>
          </>
        )}
      </div>
    </Guest>
  );
}
export function LearningLesson({
  id,
  blockId,
  index,
}: {
  id: string;
  blockId: string;
  index: number;
}) {
  const base = `/enrolments/${id}/delivery/${blockId}/lessons/${index}`,
    s = useDeliveryView<LessonView>(base),
    v = s.view;
  const router = useRouter();
  useEffect(() => {
    if (s.context && !s.context.user) router.replace('/login');
  }, [s.context, router]);
  const [work, setWork] = useState<Work | null>(null),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const current = useRef<Work | null>(null),
    revision = useRef(0),
    pending = useRef(false),
    retryKey = useRef<{ version: number; key: string } | null>(null);
  useEffect(() => {
    if (v) {
      setWork(v.draft);
      current.current = v.draft;
      setDirty(false);
    }
  }, [v]);
  useEffect(() => registerWorkGuard(() => ({ dirty, pending: pending.current })), [dirty]);
  function change(update: Partial<Work>) {
    if (!current.current) return;
    current.current = { ...current.current, ...update };
    revision.current++;
    setWork(current.current);
    setDirty(true);
    setMessage('Unsaved work');
    setError('');
  }
  async function save() {
    if (!current.current || !s.context || !s.client || pending.current) return;
    const sent = structuredClone(current.current),
      at = revision.current;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('Saving draft...');
    try {
      const saved = await api<{ version: number }>(base + '/draft', {
        csrf: s.context.csrf,
        clientId: s.client,
        version: sent.version,
        data: { body: sent.body, files: sent.files, answers: sent.answers },
      });
      current.current = { ...current.current!, version: saved.version };
      setWork(current.current);
      setDirty(revision.current !== at);
      setMessage(
        revision.current === at
          ? 'Draft saved. This has not been submitted.'
          : 'Earlier changes saved; saving your latest edits next.',
      );
    } catch (e) {
      setError((e as Error).message);
      setMessage('Draft not saved. Your input is still here. Copy it before reloading.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!dirty || busy || error || !v?.editable) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [work, dirty, busy, error, v?.editable]);
  async function submit() {
    if (
      !work ||
      dirty ||
      pending.current ||
      !s.context ||
      !window.confirm('Submit this saved version for review? It creates an immutable receipt.')
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    setSubmitting(true);
    if (retryKey.current?.version !== work.version)
      retryKey.current = { version: work.version, key: crypto.randomUUID() };
    try {
      const a = await api<{ id: string }>(base + '/submit', {
        csrf: s.context.csrf,
        clientId: s.client,
        version: work.version,
        key: retryKey.current.key,
      });
      setMessage('Work submitted. Opening your receipt.');
      leaveAfterConfirmedMutation(`/enrolments/${id}/submissions/${a.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
      setSubmitting(false);
    }
  }
  return (
    <Guest>
      <div className={layout.page}>
        <Link href={`/enrolments/${id}/delivery`}>Back to learning plan</Link>
        {!s.context?.user || !v || !work ? (
          <>
            <PageHeader title="Learning lesson" />
            <SharedFeedback error={s.error} />
            {s.error ? (
              <Button onClick={() => void (s.context?.user ? s.load() : s.loadContext())}>
                Try loading again
              </Button>
            ) : (
              <p role="status">
                {s.context?.user ? 'Loading lesson...' : 'Loading your session...'}
              </p>
            )}
          </>
        ) : (
          <>
            <div>
              <p className="eyebrow">
                Block {v.block.number} / Version {v.block.version} / {v.lesson.date}
              </p>
              <PageHeader title={v.lesson.title || 'Learning lesson'}>
                {v.enrolment.title} / {v.enrolment.timezone}
              </PageHeader>
            </div>
            <Panel className={`${layout.panel} ${lessonStyles.panel}`}>
              <h2>Learning objective</h2>
              <p>{v.objective}</p>
              <p>Prerequisites: {v.prerequisites}</p>
              {(['explanation', 'example', 'activity', 'tools', 'completion'] as const).map(
                (key, i) => (
                  <div key={key}>
                    <h2>
                      {
                        [
                          'Learn',
                          'Worked example',
                          'Your activity',
                          'Permitted tools',
                          'Completion evidence',
                        ][i]
                      }
                    </h2>
                    <p className={lessonStyles.prose}>{v.lesson[key]}</p>
                  </div>
                ),
              )}
              <p>
                Time: reading {v.lesson.reading}, practice {v.lesson.practice}, assessment{' '}
                {v.lesson.assessment}, revision {v.lesson.revision} minutes.
              </p>
              <h2>Assessment criteria</h2>
              <ul>
                {v.rubric.criteria.map((c) => (
                  <li key={c.id}>
                    {c.label} / {c.weight * 100}%
                  </li>
                ))}
              </ul>
              {v.resources && (
                <>
                  <h2>Approved resource</h2>
                  <p>
                    {String(v.resources.title)} / {String(v.resources.reference)}
                  </p>
                  <p>{String(v.resources.access)}</p>
                </>
              )}
            </Panel>
            <SharedFeedback error={s.error} />
            {!v.editable ? (
              <p className={recordStyles.notice}>
                Preview only. Work opens on the scheduled date while your programme is active, or
                after coordinator-authorised early start.
              </p>
            ) : (
              <Panel className={`${layout.panel} ${lessonStyles.panel}`}>
                <h2>Your work</h2>
                <label htmlFor="work-body">Your response</label>
                <Textarea
                  id="work-body"
                  disabled={submitting}
                  rows={10}
                  maxLength={30000}
                  value={work.body}
                  onChange={(e) => change({ body: e.target.value })}
                />
                {v.quiz && (
                  <fieldset>
                    <legend>Objective questions</legend>
                    {v.quiz.questions.map((q, i) => (
                      <fieldset key={q.id}>
                        <legend>{q.prompt}</legend>
                        {q.options.map((option, n) => (
                          <label key={n} className={lessonStyles.choice}>
                            <Input
                              type="radio"
                              name={'answer-' + i}
                              disabled={submitting}
                              checked={work.answers[i] === n}
                              onChange={() => {
                                const answers = [...work.answers];
                                while (answers.length <= i) answers.push(null);
                                answers[i] = n;
                                change({ answers });
                              }}
                            />
                            {option}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                  </fieldset>
                )}
                <SharedFeedback error={error} success={message} />
                <div className={layout.actions}>
                  <Button
                    variant="secondary"
                    disabled={busy || !dirty}
                    onClick={() => void save()}
                    aria-busy={busy}
                  >
                    {busy ? 'Saving or submitting...' : 'Save work'}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || dirty || !work.version}
                    onClick={() => void submit()}
                  >
                    Submit saved work for review
                  </Button>
                </div>
                <p>Wait for "Draft saved" before submitting. Saving a draft does not submit it.</p>
              </Panel>
            )}
            {v.editable && (
              <ResponseEvidence
                shared
                enrolment={id}
                client={s.client!}
                csrf={s.context!.csrf}
                selected={work.files}
                onChange={(files) => change({ files })}
                disabled={submitting}
              />
            )}
            <Panel className={`${layout.panel} ${lessonStyles.panel}`}>
              <h2>Attempt history</h2>
              {v.attempts.length ? (
                <ul>
                  {v.attempts.map((a) => (
                    <li key={a.id}>
                      <Link href={`/enrolments/${id}/submissions/${a.id}`}>
                        Attempt {a.attempt} / {a.status.replaceAll('_', ' ')}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No submitted attempts. Your draft is private work in progress.</p>
              )}
            </Panel>
            {v.canConfigureQuiz && (
              <QuizPublisher
                view={v}
                path={base}
                csrf={s.context!.csrf}
                client={s.client!}
                done={s.load}
              />
            )}
          </>
        )}
      </div>
    </Guest>
  );
}
function QuizPublisher({
  view,
  path,
  csrf,
  client,
  done,
}: {
  view: LessonView;
  path: string;
  csrf: string;
  client: string;
  done: () => Promise<unknown>;
}) {
  const [questions, setQuestions] = useState(
      view.rubric.criteria.map(() => ({ prompt: '', options: '', correct: 0 })),
    ),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const dirty =
    !saved && (!!reason || questions.some((q) => !!q.prompt || !!q.options || q.correct !== 0));
  useEffect(() => registerWorkGuard(() => ({ dirty, pending: pending.current })), [dirty]);
  return (
    <Panel className={`${layout.panel} ${lessonStyles.panel}`}>
      <details>
        <summary>Publish an objective quiz for this lesson</summary>
        <p>
          Use objectively verifiable questions. Each maps to one criterion. Publication is final for
          this block version and closes when work starts or the block freezes.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              pending.current ||
              !window.confirm(
                'Publish these reviewed questions and their answer key? This quiz version cannot be edited.',
              )
            )
              return;
            pending.current = true;
            setBusy(true);
            setError('');
            try {
              await api(path + '/quiz', {
                csrf,
                clientId: client,
                reason,
                questions: questions.map((q) => ({
                  ...q,
                  options: q.options
                    .split('\n')
                    .map((x) => x.trim())
                    .filter(Boolean),
                })),
              });
              setSaved(true);
              await done();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              pending.current = false;
              setBusy(false);
            }
          }}
        >
          {questions.map((q, i) => (
            <fieldset key={i} disabled={busy}>
              <legend>{view.rubric.criteria[i].label}</legend>
              <label>
                Question {i + 1}
                <Textarea
                  aria-label={'Question ' + (i + 1)}
                  required
                  minLength={10}
                  maxLength={2000}
                  value={q.prompt}
                  onChange={(e) =>
                    setQuestions(
                      questions.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Answer options for question {i + 1} (2-4 lines)
                <Textarea
                  aria-label={'Answer options ' + (i + 1)}
                  required
                  value={q.options}
                  onChange={(e) =>
                    setQuestions(
                      questions.map((x, j) => (j === i ? { ...x, options: e.target.value } : x)),
                    )
                  }
                />
              </label>
              <label>
                Correct option for question {i + 1}
                <Select
                  value={q.correct}
                  onChange={(e) =>
                    setQuestions(
                      questions.map((x, j) =>
                        j === i ? { ...x, correct: Number(e.target.value) } : x,
                      ),
                    )
                  }
                >
                  {['First', 'Second', 'Third', 'Fourth'].map((name, n) => (
                    <option key={n} value={n}>
                      {name}
                    </option>
                  ))}
                </Select>
              </label>
            </fieldset>
          ))}
          <label>
            Review and publication reason
            <Input
              minLength={8}
              maxLength={2000}
              required
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <SharedFeedback error={error} />
          <Button type="submit" variant="primary" disabled={busy} aria-busy={busy}>
            {busy ? 'Publishing quiz...' : 'Publish reviewed quiz'}
          </Button>
        </form>
      </details>
    </Panel>
  );
}
export function SubmissionReceipt({ id, submissionId }: { id: string; submissionId: string }) {
  const s = useDeliveryView<ReceiptView>(`/enrolments/${id}/submissions/${submissionId}`),
    v = s.view;
  const router = useRouter();
  useEffect(() => {
    if (s.context && !s.context.user) router.replace('/login');
  }, [s.context, router]);
  const [caseClosed, setCaseClosed] = useState(false);
  const queued = v?.grades.some((g) => g.status === 'queued');
  useEffect(() => {
    if (!queued) return;
    const timer = setInterval(() => void s.load(), 3000);
    return () => clearInterval(timer);
  }, [queued, id, submissionId, s.client]);
  if (caseClosed)
    return (
      <Guest>
        <div className={layout.page}>
          <PageHeader title="Independent review recorded" />
          <p>Case access has closed. The previous decision and this review remain in history.</p>
          <Link href="/learning-reviews">Return to review queue</Link>
        </div>
      </Guest>
    );
  return (
    <Guest>
      <div className={layout.page}>
        <Link href={v?.caseOnly ? '/learning-reviews' : `/enrolments/${id}/delivery`}>
          {v?.caseOnly ? 'Back to review queue' : 'Back to learning plan'}
        </Link>
        {!s.context?.user || !v ? (
          <>
            <PageHeader title="Submission receipt" />
            <SharedFeedback error={s.error} />
            {s.error ? (
              <Button onClick={() => void (s.context?.user ? s.load() : s.loadContext())}>
                Try loading again
              </Button>
            ) : (
              <p role="status">
                {s.context?.user ? 'Loading submission receipt...' : 'Loading your session...'}
              </p>
            )}
          </>
        ) : (
          <>
            <PageHeader title="Submission receipt">{v.enrolment.title}</PageHeader>
            <Panel className={`${layout.panel} ${receiptStyles.panel}`}>
              <h2>Attempt {v.submission.attempt}</h2>
              <p>Status: {v.submission.status.replaceAll('_', ' ')}</p>
              <p>Submitted work is preserved. A revised submission creates a new attempt.</p>
              <p className={receiptStyles.prose}>
                {v.submission.body || 'No written response; see attached evidence or quiz answers.'}
              </p>
              {v.submission.files.length > 0 && (
                <>
                  <h3>Submitted evidence</h3>
                  <ul>
                    {v.submission.files.map((file) => (
                      <li key={file}>
                        <a href={`/api/files/${file}`}>Download evidence {file}</a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {v.submission.quiz && (
                <>
                  <h3>Your quiz answers</h3>
                  <ul>
                    {v.submission.quiz.questions.map((q, i) => (
                      <li key={q.id}>
                        {q.prompt}:{' '}
                        {v.submission.answers[i] === null || v.submission.answers[i] === undefined
                          ? 'Not answered'
                          : (q.options[v.submission.answers[i]!] ?? 'Answer unavailable')}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <details>
                <summary>Receipt integrity and rubric</summary>
                <p className={receiptStyles.prose}>Content hash: {v.submission.contentHash}</p>
                <ul>
                  {v.submission.rubric.criteria.map((c) => (
                    <li key={c.id}>
                      {c.label} / {c.weight * 100}%
                    </li>
                  ))}
                </ul>
              </details>
            </Panel>
            <SharedFeedback error={s.error} />
            <LearningReview
              view={v}
              client={s.client!}
              csrf={s.context!.csrf}
              refresh={s.load}
              close={() => {
                s.setView(null);
                setCaseClosed(true);
              }}
            />
            {!v.caseOnly && (
              <p>
                <Link
                  href={`/enrolments/${id}/delivery/${v.submission.blockId}/${v.submission.lessonIndex}`}
                >
                  Return to lesson
                </Link>
              </p>
            )}
            {v.canWithdraw && (
              <Panel className={`${layout.panel} ${receiptStyles.panel}`}>
                <details>
                  <summary>Withdraw this attempt</summary>
                  <ReasonAction
                    shared
                    label="Withdraw attempt"
                    help="Withdrawal stops review of this attempt. Its submitted content remains in history; you can submit a new attempt."
                    confirm="Withdraw this submission from review? Its immutable receipt will remain in history."
                    run={async (reason) => {
                      await api(`/enrolments/${id}/submissions/${submissionId}/withdraw`, {
                        csrf: s.context!.csrf,
                        clientId: s.client,
                        version: v.submission.version,
                        reason,
                      });
                      await s.load();
                    }}
                  />
                </details>
              </Panel>
            )}
          </>
        )}
      </div>
    </Guest>
  );
}

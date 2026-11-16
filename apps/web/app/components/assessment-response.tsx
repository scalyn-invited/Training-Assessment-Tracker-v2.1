'use client';
import { useEffect, useRef, useState } from 'react';
import { api, useContext, Guest, Pending, Feedback } from './auth-ui';
import { ResponseQuestions, type Question, type Section, type Answers } from './response-questions';
import { ResponseEvidence } from './response-evidence';
import { AssessmentReview } from './assessment-review';
import { registerWorkGuard } from './work-guard';
type Draft = {
  responses: Answers;
  context: string | null;
  files: string[];
  progress?: { current: string; furthest: string };
};
type Attempt = Draft & {
  id: string;
  number: number;
  createdAt: string;
  questions: Question[];
  sections: Section[] | null;
};
type Data = {
  id: string;
  enrolmentId: string;
  title: string;
  memberName: string;
  revision: number;
  version: number;
  status: string;
  member: boolean;
  appealOpen: boolean;
  definition: { questions: Question[]; sections: Section[] | null };
  draft: Draft | null;
  attempts: Attempt[];
};
type Failure = Error & { status?: number; errors?: Record<string, string> };
type Saved = { version: number; progress?: Draft['progress'] };
type Operation = {
  body: Record<string, unknown>;
  generation: number;
  submitAfter: boolean;
  locked: boolean;
};
async function request(id: string, body: Record<string, unknown>): Promise<Saved> {
  const res = await fetch('/api/assessments/responses/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.message || 'The response could not be saved.'), {
      status: res.status,
      errors: data.errors,
    });
  return data;
}
export function AssessmentResponse({ id }: { id: string }) {
  const { context, error, load } = useContext(),
    [data, setData] = useState<Data | null>(null),
    [failure, setFailure] = useState(''),
    [reload, setReload] = useState(0);
  const client = context?.client?.id;
  useEffect(() => {
    if (!client) return;
    let active = true;
    setData(null);
    setFailure('');
    api<Data>('/assessments/assignments/' + id + '?clientId=' + client)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setFailure(e.message);
      });
    return () => {
      active = false;
    };
  }, [id, client, reload]);
  return (
    <Guest>
      {!context?.user ? (
        <Pending error={error} retry={load} />
      ) : !client ? (
        <a href="/clients">Choose a client</a>
      ) : (
        <>
          <p>
            <a href="/assessments">Back to assessments</a>
          </p>
          {failure ? (
            <Pending error={failure} retry={() => setReload((n) => n + 1)} />
          ) : !data ? (
            <p role="status">Loading assessment...</p>
          ) : (
            <>
              <p className="eyebrow">
                {context.client?.name} / Revision {data.revision}
              </p>
              <h1>{data.title}</h1>
              <p>
                {data.memberName} - {data.status.replaceAll('_', ' ')}
              </p>
              {data.member &&
              !data.appealOpen &&
              ['assigned', 'draft', 'rejected'].includes(data.status) ? (
                <Editor
                  key={data.id + ':' + data.version}
                  data={data}
                  client={client}
                  csrf={context.csrf}
                  complete={() => setReload((n) => n + 1)}
                />
              ) : (
                <p className="notice">
                  {data.attempts.length
                    ? 'Submitted attempts are preserved below.'
                    : 'No response has been submitted yet.'}
                </p>
              )}
              {data.attempts.length > 0 && (
                <section>
                  <h2>Submission history</h2>
                  {data.attempts.map((attempt) => (
                    <details key={attempt.id} className="panel" open>
                      <summary>
                        Attempt {attempt.number} - {new Date(attempt.createdAt).toLocaleString()}
                      </summary>
                      <p>Submission receipt: {attempt.id}</p>
                      <ResponseQuestions
                        questions={attempt.questions}
                        sections={attempt.sections}
                        answers={attempt.responses}
                        prefix={attempt.id}
                      />
                      <h3>Additional context</h3>
                      <p style={{ whiteSpace: 'pre-wrap' }}>
                        {attempt.context || 'No additional context.'}
                      </p>
                      {attempt.files.length > 0 && (
                        <ul>
                          {attempt.files.map((file, index) => (
                            <li key={file}>
                              <a href={'/api/files/' + file}>Supporting evidence {index + 1}</a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  ))}
                </section>
              )}
              <AssessmentReview
                id={id}
                client={client}
                csrf={context.csrf}
                status={data.status}
                onStatus={(status) =>
                  setData((current) =>
                    current && current.status !== status ? { ...current, status } : current,
                  )
                }
                complete={() => setReload((n) => n + 1)}
              />
            </>
          )}
        </>
      )}
    </Guest>
  );
}
function Editor({
  data,
  client,
  csrf,
  complete,
}: {
  data: Data;
  client: string;
  csrf: string;
  complete: () => void;
}) {
  const sections = data.definition.sections ?? [],
    initial = data.draft ?? { responses: {}, context: null, files: [] };
  const state = useRef({
    draft: initial,
    version: data.version,
    generation: 0,
    saved: 0,
    busy: false,
    pending: null as Operation | null,
    conflict: false,
    validation: false,
  });
  const [draft, setDraft] = useState(initial),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [message, setMessage] = useState('All changes saved.'),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [pending, setPending] = useState(false),
    [conflict, setConflict] = useState(false),
    [tick, setTick] = useState(0);
  const current = draft.progress?.current ?? sections[0]?.id,
    furthest = draft.progress?.furthest ?? sections[0]?.id,
    index = sections.findIndex((s) => s.id === current),
    currentSection = sections[index],
    heading = useRef<HTMLHeadingElement>(null);
  function change(patch: Partial<Draft>) {
    const s = state.current;
    s.draft = { ...s.draft, ...patch };
    s.generation++;
    s.validation = false;
    setDraft(s.draft);
    setErrors({});
    setMessage('Unsaved changes');
    setTick((n) => n + 1);
  }
  useEffect(
    () =>
      registerWorkGuard(() => ({
        dirty: state.current.generation !== state.current.saved,
        pending: state.current.busy,
        uncertain: Boolean(state.current.pending),
      })),
    [],
  );
  useEffect(() => {
    const s = state.current;
    if (s.generation === s.saved || s.busy || s.pending || s.conflict || s.validation) return;
    const timer = setTimeout(() => void save(), 900);
    return () => clearTimeout(timer);
  }, [tick, busy, pending]);
  useEffect(() => {
    heading.current?.focus();
  }, [current]);
  async function run(operation: Operation) {
    const s = state.current;
    if (s.busy || s.conflict) return;
    s.busy = true;
    setBusy(true);
    setLocked(operation.locked);
    setError('');
    setErrors({});
    setMessage(
      operation.body.action === 'submit' ? 'Submitting response...' : 'Saving response...',
    );
    try {
      const result = await request(data.id, operation.body);
      s.version = result.version;
      s.pending = null;
      setPending(false);
      if (operation.body.action === 'submit') {
        s.saved = s.generation;
        s.busy = false;
        complete();
        return;
      }
      s.saved = operation.generation;
      if (result.progress) {
        s.draft = { ...s.draft, progress: result.progress };
        setDraft(s.draft);
      }
      if (operation.submitAfter) {
        s.busy = false;
        await run({
          body: {
            csrf,
            clientId: client,
            action: 'submit',
            expected_version: s.version,
            idempotency_key: crypto.randomUUID(),
          },
          generation: s.generation,
          locked: true,
          submitAfter: false,
        });
        return;
      }
      setMessage(s.generation === s.saved ? 'All changes saved.' : 'Unsaved changes');
    } catch (cause) {
      const e = cause as Failure;
      setErrors(e.errors ?? {});
      if (e.status === 409) {
        s.conflict = true;
        setConflict(true);
        setError(e.message + ' Your answers remain on this page. Copy them before reloading.');
      } else if (!e.status || e.status >= 500) {
        s.pending = operation;
        setPending(true);
        setError(
          'The save outcome could not be confirmed. Retry the same request before continuing. Your answers remain here.',
        );
      } else {
        s.pending = null;
        s.validation = true;
        setPending(false);
        setError(e.message); /* Wait for an edit or explicit save after validation failure. */
      }
      setMessage('Changes need attention.');
    } finally {
      s.busy = false;
      setBusy(false);
      setLocked(Boolean(s.pending?.locked));
    }
  }
  async function save(navigate?: string, submitAfter = false) {
    const s = state.current;
    if (s.busy || s.pending || s.conflict) return;
    const section = sections.find(
      (item) => item.id === (s.draft.progress?.current ?? sections[0]?.id),
    );
    const answers = section
      ? Object.fromEntries(
          section.question_ids
            .filter((id) => id in s.draft.responses)
            .map((id) => [id, s.draft.responses[id]]),
        )
      : s.draft.responses;
    await run({
      body: {
        csrf,
        clientId: client,
        action: 'save',
        expected_version: s.version,
        responses: answers,
        context: s.draft.context,
        files: s.draft.files,
        save_token: crypto.randomUUID(),
        ...(section ? { section_id: section.id } : {}),
        ...(navigate ? { navigate_to: navigate } : {}),
      },
      generation: s.generation,
      submitAfter,
      locked: Boolean(navigate || submitAfter),
    });
  }
  function submit() {
    if (
      window.confirm(
        'Submit this response for review? You cannot edit this attempt after submission.',
      )
    )
      void save(undefined, true);
  }
  const blocked = busy || pending || conflict;
  return (
    <>
      <section className="panel">
        <h2>Your response</h2>
        <p id="response-save-status" role="status" aria-live="polite">
          {message}
        </p>
        <Feedback error={error} />
        {Object.keys(errors).length > 0 && (
          <ul aria-label="Response errors">
            {Object.entries(errors).map(([key, value]) => (
              <li key={key}>{value}</li>
            ))}
          </ul>
        )}
        {pending && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (state.current.pending) void run(state.current.pending);
            }}
          >
            Retry save
          </button>
        )}
        {conflict && (
          <p>
            <a href="">Reload saved response</a>
          </p>
        )}
      </section>
      {sections.length > 0 && (
        <nav id="learner-section-nav" aria-label="Assessment sections">
          {sections.map((section, i) => (
            <button
              key={section.id}
              className="secondary"
              aria-current={section.id === current ? 'step' : undefined}
              disabled={
                blocked ||
                i > sections.findIndex((s) => s.id === furthest) ||
                section.id === current
              }
              onClick={() => void save(section.id)}
            >
              {i + 1}. {section.title}
            </button>
          ))}
        </nav>
      )}
      <fieldset id="section-response" disabled={locked} style={{ minWidth: 0 }}>
        <legend className="sr-only">Assessment answers</legend>
        {currentSection && (
          <>
            <h2 ref={heading} tabIndex={-1}>
              {currentSection.title}
            </h2>
            <p className="section-instructions">{currentSection.instructions}</p>
          </>
        )}
        <ResponseQuestions
          questions={data.definition.questions.filter(
            (q) => !currentSection || currentSection.question_ids.includes(q.id),
          )}
          answers={draft.responses}
          allQuestions={data.definition.questions}
          sections={data.definition.sections}
          errors={errors}
          onChange={(id, value) =>
            change({ responses: { ...state.current.draft.responses, [id]: value } })
          }
        />
        <label>
          Additional context (optional)
          <textarea
            maxLength={6000}
            value={draft.context ?? ''}
            onChange={(e) => change({ context: e.target.value })}
          />
        </label>
      </fieldset>
      <ResponseEvidence
        enrolment={data.enrolmentId}
        client={client}
        csrf={csrf}
        selected={draft.files}
        disabled={locked || conflict}
        onChange={(files) => change({ files })}
      />
      <div className="actions">
        <button className="secondary" disabled={blocked} onClick={() => void save()}>
          Save draft
        </button>
        {index > 0 && (
          <button
            className="secondary"
            disabled={blocked}
            onClick={() => void save(sections[index - 1].id)}
          >
            Previous section
          </button>
        )}
        {index >= 0 && index < sections.length - 1 ? (
          <button
            className="primary"
            disabled={blocked}
            onClick={() => void save(sections[index + 1].id)}
          >
            Continue to next section
          </button>
        ) : (
          <button className="primary" disabled={blocked} onClick={submit}>
            Submit response
          </button>
        )}
      </div>
    </>
  );
}

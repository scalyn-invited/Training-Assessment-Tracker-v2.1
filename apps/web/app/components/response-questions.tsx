'use client';
import { Input, Textarea } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/assessment-response.module.css';
import richText from './rich-text-editor/editor.module.css';

import type { CSSProperties } from 'react';
import { questionReference } from './question-reference';
export type Question = {
  id: string;
  type: string;
  prompt: string;
  prompt_html?: string;
  choices: { id: string; text: string }[];
  matrix?: {
    instructions: string;
    required: boolean;
    notes_enabled: boolean;
    areas: { id: string; text: string }[];
    ratings: { id: string; text: string }[];
  };
};
export type Section = { id: string; title: string; instructions: string; question_ids: string[] };
export type Answers = Record<string, unknown>;
export function ResponseQuestions({
  questions,
  allQuestions = questions,
  sections,
  answers,
  onChange,
  errors = {},
  prefix = 'response',
}: {
  questions: Question[];
  allQuestions?: Question[];
  sections?: Section[] | null;
  answers: Answers;
  onChange?: (id: string, value: unknown) => void;
  errors?: Record<string, string>;
  prefix?: string;
}) {
  return (
    <>
      {questions.map((q) => {
        const value = answers[q.id],
          title = prefix + '-' + q.id;
        return (
          <section key={q.id} className={`${layout.panel} ${styles.panel}`}>
            <h3 id={title}>{questionReference(q.id, allQuestions, sections)}</h3>
            {q.prompt_html ? (
              <div
                className={'assessment-prompt ' + richText.content}
                dangerouslySetInnerHTML={{ __html: q.prompt_html }}
              />
            ) : (
              <p>{q.prompt}</p>
            )}
            {q.type === 'self_assessment' && q.matrix ? (
              <div
                className={
                  'assessment-matrix' + (q.matrix.notes_enabled ? ' matrix-with-notes' : '')
                }
                style={{ '--matrix-columns': q.matrix.ratings.length } as CSSProperties}
              >
                {q.matrix.instructions && (
                  <p className="section-instructions">{q.matrix.instructions}</p>
                )}
                <p>
                  Self-assessment reflection (not graded).{' '}
                  {q.matrix.required
                    ? 'A rating is required for every area.'
                    : 'Ratings are optional.'}
                </p>
                <div className="matrix-header" aria-hidden="true">
                  <strong>Assessment area</strong>
                  {q.matrix.ratings.map((r) => (
                    <strong key={r.id}>{r.text}</strong>
                  ))}
                  {q.matrix.notes_enabled && <strong>Notes</strong>}
                </div>
                {q.matrix.areas.map((area) => {
                  const row =
                    (
                      value as
                        Record<string, { rating_id?: string | null; note?: string }> | undefined
                    )?.[area.id] ?? {};
                  const areaId = title + '-' + area.id,
                    error = errors['responses.' + q.id + '.' + area.id + '.rating_id'];
                  const change = (patch: object) =>
                    onChange?.(q.id, {
                      ...((value as object) ?? {}),
                      [area.id]: { ...row, ...patch },
                    });
                  return (
                    <div
                      className="matrix-row"
                      key={area.id}
                      role={onChange ? 'radiogroup' : 'group'}
                      aria-labelledby={areaId}
                      aria-required={onChange ? q.matrix!.required : undefined}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? areaId + '-error' : undefined}
                    >
                      <div className="matrix-area" id={areaId}>
                        {area.text}
                      </div>
                      {q.matrix!.ratings.map((r) => (
                        <label className="matrix-choice" key={r.id}>
                          {onChange ? (
                            <Input
                              type="radio"
                              name={areaId}
                              aria-label={area.text + ': ' + r.text}
                              checked={row.rating_id === r.id}
                              onChange={() => change({ rating_id: r.id })}
                            />
                          ) : (
                            <span>{row.rating_id === r.id ? 'Selected:' : 'Not selected:'}</span>
                          )}
                          <span className="matrix-rating-label">{r.text}</span>
                        </label>
                      ))}
                      {q.matrix!.notes_enabled && (
                        <label className="matrix-note">
                          Notes (optional)
                          {onChange ? (
                            <Textarea
                              aria-label={'Notes for ' + area.text}
                              maxLength={500}
                              value={row.note ?? ''}
                              onChange={(e) => change({ note: e.target.value })}
                            />
                          ) : (
                            <p>{row.note || 'No notes.'}</p>
                          )}
                        </label>
                      )}
                      {error && (
                        <p className="matrix-row-error" id={areaId + '-error'}>
                          {error}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : q.type === 'multiple_choice' ? (
              <fieldset aria-labelledby={title}>
                <legend>Choose one answer</legend>
                {q.choices.map((c) => (
                  <label className={styles.choice} key={c.id}>
                    {onChange ? (
                      <Input
                        type="radio"
                        name={title}
                        checked={value === c.id}
                        onChange={() => onChange(q.id, c.id)}
                      />
                    ) : (
                      <span>{value === c.id ? 'Selected: ' : ''}</span>
                    )}
                    {c.text}
                  </label>
                ))}
              </fieldset>
            ) : onChange ? (
              <label>
                Your answer
                <Textarea
                  aria-labelledby={title}
                  maxLength={10000}
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => onChange(q.id, e.target.value)}
                />
              </label>
            ) : (
              <p style={{ whiteSpace: 'pre-wrap' }}>
                {typeof value === 'string' && value ? value : 'No written answer.'}
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

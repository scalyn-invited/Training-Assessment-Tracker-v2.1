'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input, Select, Textarea, Panel, PageHeader, Badge, Feedback } from './ui/controls';
import layout from './ui/form-layout.module.css';
import styles from './ui/onboarding.module.css';
import recordStyles from './ui/training-record.module.css';
import { PlanCreate } from './plan-create';
import { registerWorkGuard } from './work-guard';
import { OnboardingFiles } from './onboarding-files';
import { api, useContext, Guest, Pending } from './auth-ui';
import {
  onboardingSteps,
  onboardingFields,
  type OnboardingStep,
} from '../../../../packages/contracts/src/onboarding';
type Data = Partial<Record<OnboardingStep, Record<string, any>>>;
type Calendar = {
  id: string;
  version: number;
  timezone: string;
  daily_minutes: number;
  weekdays: number[];
  holidays: string[];
  absences: string[];
};
type View = {
  plan: { id: string; version: number; state: string } | null;
  preview: { days: number; minutes: number } | null;
  enrolment: { id: string; title: string; status: string; memberName: string };
  canManage: boolean;
  version: number;
  lastStep: OnboardingStep;
  data: Data;
  calendar: Calendar | null;
};
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const kpiFields = {
  name: 'Name',
  baseline: 'Baseline (or unknown)',
  target: 'Target',
  unit: 'Unit',
  rationale: 'Why this matters',
  evidence: 'Evidence method',
  cadence: 'Review cadence',
};
function defaults(step: OnboardingStep, view: View): Record<string, any> {
  const saved = view.data[step];
  if (step === 'schedule')
    return {
      duration: 4,
      daily_minutes: 30,
      capacity_minutes: view.calendar?.daily_minutes ?? 30,
      start_date: '',
      timezone: view.calendar?.timezone ?? 'Asia/Manila',
      weekdays: view.calendar?.weekdays ?? [1, 2, 3, 4, 5],
      holidays: view.calendar?.holidays ?? [],
      absences: view.calendar?.absences ?? [],
      ...saved,
    };
  if (step === 'measures') return { kpis: Array.from({ length: 3 }, () => ({})), ...saved };
  return { ...saved };
}
export function OnboardingScreen({ id }: { id: string }) {
  const { context, error: contextError, load: loadContext } = useContext();
  const client = context?.client?.id;
  const router = useRouter();
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  const [view, setView] = useState<View | null>(null),
    [step, setStep] = useState<OnboardingStep | 'review'>('profile'),
    [draft, setDraft] = useState<Record<string, any>>({}),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [reason, setReason] = useState('');
  const state = useRef({
    generation: 0,
    saved: 0,
    busy: false,
    version: 0,
    draft: {} as Record<string, any>,
    step: 'profile' as OnboardingStep | 'review',
    blocked: false,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const reasonDraft = useRef('');
  const planDraft = useRef(false);
  useEffect(() => {
    if (!client || !context?.user) return;
    let current = true;
    setView(null);
    setError('');
    api<View>(`/enrolments/${id}/onboarding?clientId=${client}`)
      .then((v) => {
        if (!current) return;
        const requested = new URLSearchParams(window.location.search).get('step');
        const selected =
          requested === 'review' || Object.keys(onboardingSteps).includes(requested ?? '')
            ? (requested as OnboardingStep | 'review')
            : v.lastStep;
        const d = selected === 'review' ? {} : defaults(selected, v);
        state.current = {
          generation: 0,
          saved: 0,
          busy: false,
          version: v.version,
          draft: d,
          step: selected,
          blocked: false,
        };
        setView(v);
        setStep(selected);
        setDraft(d);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [client, context?.user?.id, id, retry]);
  useEffect(
    () =>
      registerWorkGuard(() => ({
        dirty:
          state.current.generation !== state.current.saved ||
          Boolean(reasonDraft.current) ||
          planDraft.current,
        pending: state.current.busy,
      })),
    [],
  );
  function change(key: string, value: any) {
    const s = state.current;
    s.draft = { ...s.draft, [key]: value };
    s.generation++;
    setDraft(s.draft);
    setNotice('Unsaved changes');
  }
  function payload(d: Record<string, any>) {
    const value = { ...d };
    for (const [key, v] of Object.entries(value)) if (v === '') value[key] = null;
    if (state.current.step === 'schedule')
      for (const field of ['holidays', 'absences'])
        if (typeof value[field] === 'string')
          value[field] = value[field]
            .trim()
            .split(/[\s,]+/)
            .filter(Boolean);
    return value;
  }
  async function save(confirm = false): Promise<boolean> {
    const s = state.current;
    if (!client || !context || !view || s.busy || s.step === 'review') return false;
    const savedStep = s.step,
      generation = s.generation,
      values = payload(s.draft);
    if (
      confirm &&
      !window.confirm(
        'Confirm these assessment findings for ' +
          view.enrolment.memberName +
          '? Later edits require confirmation again.',
      )
    )
      return false;
    s.busy = true;
    setBusy(true);
    setError('');
    setNotice(confirm ? 'Confirming findings…' : 'Saving draft…');
    try {
      const result = await api<{ version: number }>(`/enrolments/${id}/onboarding`, {
        clientId: client,
        csrf: context.csrf,
        step: savedStep,
        data: values,
        version: s.version,
        confirm,
      });
      s.version = result.version;
      s.saved = generation;
      s.blocked = false;
      const stored = { ...values };
      delete stored.confirmed_by;
      delete stored.confirmed_at;
      if (confirm) stored.confirmed_by = context.user!.id;
      setView((v) =>
        v ? { ...v, version: result.version, data: { ...v.data, [savedStep]: stored } } : v,
      );
      setNotice(
        s.generation === generation
          ? confirm
            ? 'Assessment findings confirmed.'
            : 'Draft saved. This is not an approval.'
          : 'Newer changes are waiting to save.',
      );
      return true;
    } catch (e) {
      s.blocked = true;
      setError((e as Error).message);
      setNotice('Your entered values are retained. Copy them before reloading.');
      return false;
    } finally {
      s.busy = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const s = state.current;
    if (!view || !context || !client || s.busy || s.blocked || s.generation === s.saved) return;
    const timer = setTimeout(() => void save(), 800);
    return () => clearTimeout(timer);
  }, [draft, busy, view, client]);
  async function navigate(next: OnboardingStep | 'review') {
    if (!view || state.current.busy || next === state.current.step) return;
    if (state.current.generation !== state.current.saved && !(await save())) return;
    if (state.current.generation !== state.current.saved) return;
    if (planDraft.current) {
      if (!window.confirm('Discard the unsaved curriculum creation reason?')) return;
      planDraft.current = false;
    }
    // A save only changes the current step; other saved steps remain the same.
    const d = next === 'review' ? {} : defaults(next, view);
    state.current.step = next;
    state.current.draft = d;
    state.current.generation = 0;
    state.current.saved = 0;
    state.current.blocked = false;
    setStep(next);
    setDraft(d);
    setError('');
    setNotice('');
    window.history.replaceState(null, '', window.location.pathname + '?step=' + next);
    setTimeout(() => heading.current?.focus(), 0);
  }
  async function confirmCalendar() {
    if (!context || !client || !view || busy) return;
    if (
      !window.confirm(
        'Confirm the shared calendar for ' +
          view.enrolment.memberName +
          '? This affects capacity across their programmes.',
      )
    )
      return;
    state.current.busy = true;
    setBusy(true);
    setError('');
    setNotice('Confirming shared calendar…');
    try {
      await api(`/enrolments/${id}/calendar`, {
        clientId: client,
        csrf: context.csrf,
        version: view.calendar?.version ?? 0,
        onboardingVersion: state.current.version,
        reason,
      });
      const next = await api<View>(`/enrolments/${id}/onboarding?clientId=${client}`);
      setView(next);
      reasonDraft.current = '';
      setReason('');
      setNotice('Shared capacity calendar confirmed.');
    } catch (e) {
      setError((e as Error).message);
      setNotice('Your reason is retained.');
    } finally {
      state.current.busy = false;
      setBusy(false);
    }
  }
  const editable = Boolean(
    view &&
    ['onboarding', 'ready'].includes(view.enrolment.status) &&
    (view.canManage || ['profile', 'assessment', 'schedule'].includes(step)),
  );
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
            {!view ? (
              <>
                <PageHeader title="Onboarding" />
                {error ? (
                  <>
                    <Feedback error={error} />
                    <Button onClick={() => setRetry((n) => n + 1)}>Retry onboarding</Button>
                  </>
                ) : (
                  <p role="status">Loading onboarding inputs…</p>
                )}
              </>
            ) : (
              <>
                <div className={recordStyles.heading}>
                  <div>
                    <p className="eyebrow">Learning setup · Revision {view.version}</p>
                    <PageHeader title={view.enrolment.memberName}>
                      {view.enrolment.title}
                    </PageHeader>
                  </div>
                  <Badge>Saved draft ≠ approved plan</Badge>
                </div>
                <nav className={styles.steps} aria-label="Onboarding steps">
                  {(Object.entries(onboardingSteps) as [OnboardingStep, string][]).map(
                    ([key, label], i) => (
                      <Button
                        type="button"
                        key={key}
                        aria-current={step === key ? 'step' : undefined}
                        disabled={busy}
                        onClick={() => void navigate(key)}
                      >
                        {i + 1}. {label}
                        {view.data[key] ? ' · saved' : ''}
                      </Button>
                    ),
                  )}
                  <Button
                    type="button"
                    aria-current={step === 'review' ? 'step' : undefined}
                    disabled={busy}
                    onClick={() => void navigate('review')}
                  >
                    7. Review and create
                  </Button>
                </nav>
                <Feedback error={error} />
                <p role="status" aria-live="polite">
                  {notice}
                </p>
                {step !== 'review' ? (
                  <Panel className={layout.panel + ' ' + styles.panel}>
                    <h2 ref={heading} tabIndex={-1}>
                      {onboardingSteps[step]}
                    </h2>
                    {!editable && (
                      <p className={recordStyles.notice}>
                        {['onboarding', 'ready'].includes(view.enrolment.status)
                          ? 'Your coordinator owns these inputs. You can review the saved information here.'
                          : 'Active training uses the calendar-change workflow. These inputs are read-only.'}
                      </p>
                    )}
                    {step === 'assessment' && (
                      <>
                        <p className={recordStyles.notice}>
                          Enter a manual summary or review an extracted private assessment. Scanning
                          and extraction do not confirm findings. Every edit requires coordinator
                          confirmation.
                        </p>
                        <p>
                          {view.data.assessment?.confirmed_by
                            ? 'Confirmed by coordinator for the saved assessment.'
                            : 'Assessment confirmation pending.'}
                        </p>
                      </>
                    )}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void save();
                      }}
                    >
                      <fieldset disabled={!editable}>
                        <legend className="sr-only">{onboardingSteps[step]} inputs</legend>
                        {step in onboardingFields &&
                          Object.entries(
                            onboardingFields[step as keyof typeof onboardingFields],
                          ).map(([key, label]) => (
                            <div key={key}>
                              <label htmlFor={'field-' + key}>{label}</label>
                              {key === 'date' ? (
                                <Input
                                  id={'field-' + key}
                                  type="date"
                                  value={draft[key] ?? ''}
                                  onChange={(e) => change(key, e.target.value)}
                                />
                              ) : key === 'kind' ? (
                                <Select
                                  id="field-kind"
                                  value={draft.kind ?? ''}
                                  onChange={(e) => change('kind', e.target.value)}
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
                                  id={'field-' + key}
                                  rows={['findings', 'competencies'].includes(key) ? 5 : 2}
                                  maxLength={4000}
                                  value={draft[key] ?? ''}
                                  onChange={(e) => change(key, e.target.value)}
                                />
                              )}
                            </div>
                          ))}
                        {step === 'schedule' && (
                          <>
                            <p>
                              Propose a plan budget and shared daily capacity across all programmes.
                              Your coordinator confirms the shared calendar at the review step.
                            </p>
                            <p>
                              Business cutoffs use Monday–Friday by default, excluding holidays.
                              Learner absences do not change those business weekdays.
                            </p>
                            <div className={styles.grid}>
                              <label>
                                Learning blocks
                                <Select
                                  value={draft.duration ?? ''}
                                  onChange={(e) => change('duration', Number(e.target.value))}
                                >
                                  {[4, 6, 8, 10, 12].map((n) => (
                                    <option key={n} value={n}>
                                      {n} blocks
                                    </option>
                                  ))}
                                </Select>
                              </label>
                              {[
                                ['daily_minutes', 'Minutes per day for this plan'],
                                ['capacity_minutes', 'Shared daily capacity (all plans)'],
                              ].map(([key, label]) => (
                                <label key={key}>
                                  {label}
                                  <Input
                                    type="number"
                                    min={15}
                                    max={120}
                                    value={draft[key] ?? ''}
                                    onChange={(e) =>
                                      change(
                                        key,
                                        e.target.value === '' ? null : Number(e.target.value),
                                      )
                                    }
                                  />
                                </label>
                              ))}
                              <label>
                                Start date
                                <Input
                                  type="date"
                                  value={draft.start_date ?? ''}
                                  onChange={(e) => change('start_date', e.target.value)}
                                />
                              </label>
                              <label>
                                Calendar timezone
                                <Input
                                  value={draft.timezone ?? ''}
                                  onChange={(e) => change('timezone', e.target.value)}
                                />
                              </label>
                            </div>
                            <fieldset>
                              <legend>Scheduled weekdays</legend>
                              <div className={layout.choices}>
                                {days.map((label, i) => (
                                  <label key={label}>
                                    <Input
                                      type="checkbox"
                                      checked={(draft.weekdays ?? []).includes(i + 1)}
                                      onChange={(e) =>
                                        change(
                                          'weekdays',
                                          e.target.checked
                                            ? [...(draft.weekdays ?? []), i + 1]
                                            : (draft.weekdays ?? []).filter(
                                                (d: number) => d !== i + 1,
                                              ),
                                        )
                                      }
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            {[
                              ['holidays', 'Business holidays'],
                              ['absences', 'Approved absence dates'],
                            ].map(([key, label]) => (
                              <label key={key}>
                                {label} (YYYY-MM-DD, one per line)
                                <Textarea
                                  rows={3}
                                  value={
                                    Array.isArray(draft[key])
                                      ? draft[key].join('\n')
                                      : (draft[key] ?? '')
                                  }
                                  onChange={(e) => change(key, e.target.value)}
                                />
                              </label>
                            ))}
                            <label>
                              Workload constraints and rescheduling notes
                              <Textarea
                                maxLength={4000}
                                value={draft.constraints ?? ''}
                                onChange={(e) => change('constraints', e.target.value)}
                              />
                            </label>
                          </>
                        )}
                        {step === 'measures' && (
                          <>
                            <p>
                              Define three primary measures. Use “unknown” for an unavailable
                              baseline.
                            </p>
                            {(draft.kpis ?? []).map((kpi: Record<string, string>, i: number) => (
                              <fieldset className={styles.kpi} key={i}>
                                <legend>KPI {i + 1}</legend>
                                <div className={styles.grid}>
                                  {Object.entries(kpiFields).map(([key, label]) => (
                                    <label key={key}>
                                      {label}
                                      <Input
                                        maxLength={
                                          ['rationale', 'evidence'].includes(key)
                                            ? 1000
                                            : key === 'unit'
                                              ? 100
                                              : 200
                                        }
                                        value={kpi[key] ?? ''}
                                        onChange={(e) =>
                                          change(
                                            'kpis',
                                            draft.kpis.map(
                                              (r: Record<string, string>, n: number) =>
                                                n === i ? { ...r, [key]: e.target.value } : r,
                                            ),
                                          )
                                        }
                                      />
                                    </label>
                                  ))}
                                </div>
                              </fieldset>
                            ))}
                          </>
                        )}
                      </fieldset>
                      {editable && (
                        <>
                          <div className={layout.actions}>
                            <Button
                              type="submit"
                              variant="primary"
                              disabled={busy}
                              aria-busy={busy}
                            >
                              {busy ? 'Saving…' : 'Save draft'}
                            </Button>
                            {step === 'assessment' && view.canManage && (
                              <Button type="button" disabled={busy} onClick={() => void save(true)}>
                                Confirm assessment findings
                              </Button>
                            )}
                          </div>
                          <p className={styles.subtle}>
                            Changes save after a short pause. Keep this page open until “Draft
                            saved” appears. Failed saves retain your input.
                          </p>
                        </>
                      )}
                    </form>
                    {step === 'assessment' && view.canManage && (
                      <OnboardingFiles
                        id={id}
                        client={client}
                        csrf={context.csrf}
                        editable={editable}
                      />
                    )}
                  </Panel>
                ) : (
                  <Panel className={layout.panel + ' ' + styles.panel}>
                    <h2 ref={heading} tabIndex={-1}>
                      Review the saved inputs
                    </h2>
                    <p>
                      Review every step and confirm the shared calendar before creating a curriculum
                      draft. Saving inputs does not approve a plan.
                    </p>
                    {Object.entries(onboardingSteps).map(([key, label]) => (
                      <details className={styles.review} key={key}>
                        <summary>
                          {label} ·{' '}
                          {view.data[key as OnboardingStep]
                            ? 'saved, review completeness below'
                            : 'not saved'}
                        </summary>
                        <dl>
                          {Object.entries(view.data[key as OnboardingStep] ?? {})
                            .filter(([k]) => !['confirmed_by', 'confirmed_at'].includes(k))
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{k.replaceAll('_', ' ')}</dt>
                                <dd style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                  {Array.isArray(v)
                                    ? v
                                        .map((x) =>
                                          typeof x === 'object'
                                            ? Object.values(x).join(' · ')
                                            : String(x),
                                        )
                                        .join('\n')
                                    : String(v ?? '')}
                                </dd>
                              </div>
                            ))}
                        </dl>
                      </details>
                    ))}
                    <p>
                      Assessment:{' '}
                      {view.data.assessment?.confirmed_by
                        ? 'coordinator confirmed'
                        : 'confirmation required'}
                      .
                    </p>
                    <p>
                      {view.calendar
                        ? `Shared calendar version ${view.calendar.version} · ${view.calendar.timezone} · ${view.calendar.daily_minutes} minutes per available day.`
                        : 'Shared calendar has not been confirmed.'}
                    </p>
                    {view.canManage &&
                      ['onboarding', 'ready'].includes(view.enrolment.status) &&
                      view.version > 0 && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void confirmCalendar();
                          }}
                        >
                          <label>
                            Reason for confirming or changing the shared calendar
                            <Input
                              required
                              minLength={8}
                              maxLength={2000}
                              value={reason}
                              onChange={(e) => {
                                reasonDraft.current = e.target.value;
                                setReason(e.target.value);
                              }}
                            />
                          </label>
                          <Button type="submit" disabled={busy} aria-busy={busy}>
                            {busy ? 'Confirming calendar…' : 'Confirm shared calendar'}
                          </Button>
                        </form>
                      )}
                    <PlanCreate
                      onDirty={(value) => {
                        planDraft.current = value;
                      }}
                      id={id}
                      client={client}
                      csrf={context.csrf}
                      version={view.version}
                      plan={view.plan}
                      preview={view.preview}
                      canManage={
                        view.canManage && ['onboarding', 'ready'].includes(view.enrolment.status)
                      }
                    />
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

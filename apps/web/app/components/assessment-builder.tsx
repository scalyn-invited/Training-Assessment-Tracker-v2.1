'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, useContext, Guest } from './auth-ui';
import { Button, PageHeader, Feedback } from './ui/controls';
import layout from './ui/form-layout.module.css';
import { builderMarkup } from './assessment-builder/markup';
import type { BuilderState } from './assessment-builder/builder';
type Definition = Omit<BuilderState, 'criteria' | 'threshold'> & {
  rubric: { criteria: unknown[]; threshold: number | null };
};
export function AssessmentBuilder({ definitionId }: { definitionId: string }) {
  const { context, error, load } = useContext(),
    router = useRouter(),
    host = useRef<HTMLDivElement>(null),
    [state, setState] = useState<BuilderState | null>(null),
    [failure, setFailure] = useState(''),
    [retry, setRetry] = useState(0);
  const client = context?.client?.id;
  useEffect(() => {
    if (context && !context.user) router.replace('/login');
  }, [context, router]);
  useEffect(() => {
    if (!context?.user || !client) return;
    let cancelled = false;
    setFailure('');
    setState(null);
    const query = new URLSearchParams({ clientId: client });
    if (definitionId !== 'new') query.set('id', definitionId);
    api<Definition>('/assessments/definitions?' + query)
      .then((row) => {
        if (cancelled) return;
        setState(
          definitionId === 'new'
            ? {
                id: null,
                version: 0,
                status: 'draft',
                title: '',
                questions: [],
                sections: null,
                criteria: [],
                threshold: null,
                answer_key: {},
              }
            : { ...row, criteria: row.rubric.criteria, threshold: row.rubric.threshold },
        );
      })
      .catch((e) => {
        if (!cancelled) setFailure(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [context?.user?.id, client, definitionId, retry]);
  useEffect(() => {
    if (!state || !host.current || !context || !client) return;
    let cancelled = false,
      cleanup: (() => void) | undefined;
    const root = host.current;
    root.innerHTML = builderMarkup;
    root.dataset.client = client;
    root.dataset.endpoint = '/api/assessments/builder';
    root.dataset.upload = '/api/assessments/media';
    (root.querySelector('#builder-csrf') as HTMLInputElement).value = context.csrf;
    root.querySelector('#builder-heading')!.textContent =
      state.status === 'published' ? 'Revise assessment' : 'Build an assessment';
    import('./assessment-builder/builder')
      .then((module) => {
        if (!cancelled) cleanup = module.mountAssessmentBuilder(root, state);
      })
      .catch((e) => {
        if (!cancelled) setFailure('The editor could not be loaded. Reload to try again.');
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [state, client, context?.csrf]);
  return (
    <Guest>
      <div className={layout.page}>
        {!context?.user ? (
          <>
            <PageHeader title="Assessment builder" />
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
            <Feedback error={failure} />
            {failure && (
              <>
                <Button onClick={() => setRetry((n) => n + 1)}>Retry builder</Button>{' '}
                <Link href="/dashboard">Return to workspace</Link>
              </>
            )}
            {!state && <PageHeader title="Assessment builder" />}
            {!state && !failure && <p role="status">Loading assessment builder...</p>}
            <div id="assessment-builder" hidden={!state} ref={host} />
          </>
        )}
      </div>
    </Guest>
  );
}

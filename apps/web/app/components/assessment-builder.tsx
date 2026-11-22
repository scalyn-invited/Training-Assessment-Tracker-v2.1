'use client';
import { useEffect, useState } from 'react';
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
    [host, setHost] = useState<HTMLDivElement | null>(null),
    [editorRoot, setEditorRoot] = useState<HTMLDivElement | null>(null),
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
    if (!state || !context || !client) {
      setEditorRoot(null);
      return;
    }
    let cancelled = false,
      cleanup: (() => void) | undefined;
    // Own the imperative editor for the data lifetime, not the shell host lifetime.
    // Saving replaces the URL; its appearance gate may temporarily detach the host.
    const root = document.createElement('div');
    setEditorRoot(root);
    root.textContent = 'Loading assessment builder...';
    import('./assessment-builder/builder')
      .then((module) => {
        if (cancelled) return;
        // Expose controls only when their handlers and work guard can mount synchronously.
        root.innerHTML = builderMarkup;
        root.dataset.client = client;
        root.dataset.endpoint = '/api/assessments/builder';
        root.dataset.upload = '/api/assessments/media';
        (root.querySelector('#builder-csrf') as HTMLInputElement).value = context.csrf;
        root.querySelector('#builder-heading')!.textContent =
          state.status === 'published' ? 'Revise assessment' : 'Build an assessment';
        cleanup = module.mountAssessmentBuilder(root, state);
      })
      .catch((e) => {
        if (!cancelled) setFailure('The editor could not be loaded. Reload to try again.');
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [state, client, context?.csrf]);
  useEffect(() => {
    // Never attach destination content until the authority-gated shell supplies a host.
    // Reattach the same live editor, preserving edits, save state and its work guard.
    if (!host || !editorRoot) return;
    host.replaceChildren(editorRoot);
    return () => {
      editorRoot.remove();
    };
  }, [host, editorRoot]);
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
            <div id="assessment-builder" hidden={!state} ref={setHost} />
          </>
        )}
      </div>
    </Guest>
  );
}

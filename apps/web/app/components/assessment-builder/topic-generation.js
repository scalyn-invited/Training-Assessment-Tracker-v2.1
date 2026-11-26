import { renderProposalPreview } from './proposal-preview.js';
export function mountTopicGeneration(host, { el, button, request, append, replaceRubric }) {
  let pending = false,
    previewing = false,
    epoch = 0,
    run = null,
    admission = null,
    uncertainAdmission = false,
    pendingLabel = '';
  const topic = el('input', null, {
    id: 'generation-topic',
    type: 'text',
    maxlength: '500',
    value: 'Cedar workshop safety',
  });
  const difficulty = el('select', null, { id: 'generation-difficulty' });
  for (const value of ['easy', 'medium', 'hard']) difficulty.append(el('option', value, { value }));
  difficulty.value = 'medium';
  const status = el('p', '', { role: 'status' }),
    error = el('p', '', { role: 'alert' });
  const preview = el('div', null, { class: 'proposal-preview' });
  const edited = () => topic.value !== 'Cedar workshop safety' || difficulty.value !== 'medium';
  function update() {
    topic.disabled = difficulty.disabled = pending || !!admission;
    generate.disabled = pending || !!run;
    generate.textContent = pending
      ? pendingLabel
      : run
        ? run.status === 'complete'
          ? 'Generation complete'
          : 'Generation request submitted'
        : admission
          ? 'Retry same generation request'
          : 'Generate synthetic proposals';
    // Admission replay returns a receipt only, even after worker completion.
    // Keep explicit status retrieval available until the proposal is received.
    refresh.disabled =
      pending ||
      !run ||
      ['cancelled', 'failed', 'ambiguous'].includes(run.status) ||
      (run.status === 'complete' && !!run.proposal);
    cancel.disabled = pending || (!admission && !previewing && !edited());
    cancel.textContent =
      run?.status === 'complete' && run.proposal
        ? 'Clear generation preview'
        : 'Cancel generation / clear preview';
  }
  function display(result) {
    run = result;
    status.textContent = `Generation ${result.status}. Deterministic synthetic mock, not AI. No automatic retries or saves.`;
    if (result.status === 'complete' && !result.proposal)
      status.textContent += ' Refresh status to retrieve the proposals.';
    if (result.status === 'ambiguous')
      error.textContent =
        'Outcome is uncertain. The allowance remains reserved; administrator reconciliation is required before a new request.';
    if (result.status === 'failed')
      error.textContent =
        'Generation stopped. No proposal was applied. Review the configuration before requesting again.';
    if (result.status === 'complete' && result.proposal) {
      previewing = true;
      renderProposalPreview(preview, result.proposal, {
        el,
        button,
        append,
        replaceRubric,
        cancel: clear,
      });
    }
  }
  async function perform(action, label = 'Submitting request…') {
    if (pending) return;
    pending = true;
    pendingLabel = label;
    status.textContent = label;
    error.textContent = '';
    update();
    const current = epoch;
    try {
      const result = await action();
      if (current === epoch && result) display(result);
    } catch (e) {
      if (current === epoch) {
        status.textContent = run
          ? `Last known generation status: ${run.status}.`
          : admission
            ? 'Request outcome not confirmed. Retry the same request to recover its receipt.'
            : 'Request was not accepted. Correct the inputs before trying again.';
        error.textContent = e.message + ' No request is retried automatically.';
      }
    } finally {
      if (current === epoch) {
        pending = false;
        update();
      }
    }
  }
  const generate = button('Generate synthetic proposals', () =>
    perform(async () => {
      admission ??= {
        idempotency: crypto.randomUUID(),
        options: {
          topic: topic.value,
          difficulty: difficulty.value,
          count: 5,
          types: 'mixed',
          language: 'English',
        },
      };
      try {
        return await request('/api/assessments/proposals/topic', admission);
      } catch (e) {
        const routeUnavailable =
          e.status === 404 &&
          /^Cannot POST \/(?:api\/)?assessments\/proposals\/topic$/.test(e.message);
        if (
          !uncertainAdmission &&
          (routeUnavailable || [400, 401, 403, 409, 422].includes(e.status))
        )
          admission = null;
        else uncertainAdmission = true;
        if (routeUnavailable)
          throw new Error(
            'The generation API is unavailable. Ask the local operator to restart the API with the current application version, then try again.' +
              (uncertainAdmission
                ? ' The earlier request outcome is still uncertain; keep and retry the same request after the API is restored.'
                : ' This request was not accepted; no generation was started.'),
          );
        throw e;
      }
    }),
  );
  const refresh = button('Refresh generation status', () =>
    perform(
      () => request('/api/assessments/proposals/topic/status', { id: run.id }),
      'Refreshing status…',
    ),
  );
  async function clear() {
    if (pending) return;
    const complete = run?.status === 'complete';
    if (
      (admission || previewing || edited()) &&
      !confirm(
        complete
          ? 'Clear this generation review and discard any unapplied proposals? Applied questions and rubric stay in the builder and are not saved automatically.'
          : 'Cancel this generation request and discard any unapplied proposals? A request already dispatched may have an uncertain outcome and keep its allowance reserved. Applied questions and rubric stay in the builder.',
      )
    )
      return;
    await perform(
      async () => {
        // A lost admission response is replayed with exactly the same key, never a new call.
        if (!run && admission) run = await request('/api/assessments/proposals/topic', admission);
        if (run && ['queued', 'running', 'ambiguous'].includes(run.status)) {
          await request('/api/assessments/proposals/topic/cancel', { id: run.id });
          const result = await request('/api/assessments/proposals/topic/status', { id: run.id });
          if (result.status === 'ambiguous') return result;
        }
        run = admission = null;
        uncertainAdmission = false;
        previewing = false;
        topic.value = 'Cedar workshop safety';
        difficulty.value = 'medium';
        preview.replaceChildren();
        status.textContent = 'Generation preview cleared. Applied edits remain unsaved.';
      },
      complete ? 'Clearing review…' : 'Cancelling generation…',
    );
  }
  const cancel = button('Cancel generation / clear preview', clear);
  const actions = el('div', null, { class: 'proposal-actions' });
  actions.append(generate, refresh);
  host.append(
    el('h3', 'Synthetic test only — not AI generation'),
    el(
      'p',
      'Only Cedar workshop safety is supported. This produces five mixed multiple-choice and open-response questions in English. Difficulty is recorded but does not change this mock’s content. Paid API and Codex integration are disabled. Document-based generation is not available. A separately configured shared client authoring allowance is required.',
    ),
    el('label', 'Generation topic', { for: topic.id }),
    topic,
    el('label', 'Generation difficulty', { for: difficulty.id }),
    difficulty,
    actions,
    cancel,
    status,
    error,
    preview,
  );
  update();
  topic.addEventListener('input', update);
  difficulty.addEventListener('change', update);
  return {
    work: () => ({ dirty: !!admission || previewing || edited(), pending }),
    dispose: () => {
      epoch++;
    },
  };
}

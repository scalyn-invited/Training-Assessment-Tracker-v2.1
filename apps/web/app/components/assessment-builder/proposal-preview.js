// Shared proposal review is intentionally independent of the source (JSON now,
// future generators must use the same validated contract and explicit actions).
export function renderProposalPreview(
  host,
  proposal,
  { el, button, append, replaceRubric, cancel },
) {
  const selected = new Set(proposal.questions.map((q) => q.reference));
  const applied = new Set();
  const error = el('p', '', { role: 'alert' });
  const message = el('p', '', { role: 'status' });
  host.replaceChildren(
    el('h3', 'Review proposed questions', { tabindex: '-1' }),
    el(
      'p',
      'Review the prompts and proposed answers. Selected questions append to the current section. Existing questions, including blank questions, stay unchanged. Nothing is saved or published automatically.',
    ),
  );
  const appendButton = button('Append selected questions', () => {
    error.textContent = '';
    try {
      const questions = proposal.questions.filter(
        (q) => selected.has(q.reference) && !applied.has(q.reference),
      );
      append(questions);
      questions.forEach((q) => {
        applied.add(q.reference);
        selected.delete(q.reference);
      });
      boxes.forEach((box, reference) => {
        if (applied.has(reference)) {
          box.checked = false;
          box.disabled = true;
        }
      });
      appendButton.disabled = !selected.size;
      message.textContent = `${questions.length} question(s) appended. Unsaved changes. Rubric unchanged.`;
    } catch (e) {
      error.textContent = e.message;
    }
  });
  const boxes = new Map();
  proposal.questions.forEach((q, index) => {
    const item = el('fieldset', null);
    item.append(
      el(
        'legend',
        `Proposal ${index + 1} · ${q.type === 'multiple_choice' ? 'Multiple choice' : 'Open response'}`,
      ),
    );
    const label = el('label', `Select proposal ${index + 1}`);
    const box = el('input', null, { type: 'checkbox' });
    box.checked = true;
    label.prepend(box);
    boxes.set(q.reference, box);
    box.addEventListener('change', () => {
      if (box.checked) selected.add(q.reference);
      else selected.delete(q.reference);
      appendButton.disabled = !selected.size;
    });
    item.append(label, el('p', q.prompt));
    if (q.choices.length) {
      const choices = el('ul', null);
      q.choices.forEach((c) =>
        choices.append(
          el(
            'li',
            c.text +
              (q.correct_choice_reference === c.reference ? ' — Proposed correct answer' : ''),
          ),
        ),
      );
      item.append(choices);
      if (!q.correct_choice_reference)
        item.append(el('p', 'No correct answer proposed. Choose one before publication.'));
    }
    if (q.suggested_answer)
      item.append(el('p', 'Preview only — not saved or shown to learners: ' + q.suggested_answer));
    host.append(item);
  });
  host.append(appendButton);
  if (proposal.rubric) {
    const rubric = el('section', null, { 'aria-label': 'Proposed assessment rubric' });
    rubric.append(
      el('h3', 'Proposed assessment rubric'),
      el(
        'p',
        'Separate action: replacing the rubric overwrites all current assessment criteria and its success threshold. It applies to the whole assessment, not only imported questions.',
      ),
      el('p', `Success threshold: ${proposal.rubric.threshold ?? 'None'}`),
    );
    proposal.rubric.criteria.forEach((c) =>
      rubric.append(
        el(
          'p',
          `${c.category} · ${c.label} · ${Number((c.weight * 100).toFixed(4))}% — ${c.guidance}`,
        ),
      ),
    );
    const apply = button('Replace assessment rubric', () => {
      error.textContent = '';
      if (
        !confirm(
          'Replace all current assessment rubric criteria and the success threshold? Existing rubric values will be overwritten. Questions are unchanged. Nothing is saved automatically.',
        )
      )
        return;
      try {
        replaceRubric(proposal.rubric);
        apply.disabled = true;
        message.textContent = 'Assessment rubric replaced. Unsaved changes. Questions unchanged.';
      } catch (e) {
        error.textContent = e.message;
      }
    });
    rubric.append(apply);
    host.append(rubric);
  } else host.append(el('p', 'No rubric proposed. Your assessment rubric remains unchanged.'));
  host.append(error, message, button('Cancel proposal preview', cancel));
  const heading = host.querySelector('h3');
  if (heading.isConnected && heading.getClientRects().length) heading.focus();
}

export function mountJsonProposalImport(host, { el, button, request, append, replaceRubric }) {
  let pending = false,
    previewing = false,
    selectedFile = null,
    epoch = 0;
  const file = el('input', null, {
    id: 'proposal-file',
    type: 'file',
    accept: '.json,application/json',
  });
  const feedback = el('p', '', { role: 'status' });
  const error = el('p', '', { role: 'alert' });
  const preview = el('div', null, { class: 'proposal-preview' });
  function clear() {
    if (
      (pending || previewing || file.files.length) &&
      !confirm(
        'Discard this import’s selected file and unapplied proposals? Questions and rubric already applied stay in the builder and are not saved automatically.',
      )
    )
      return;
    epoch++;
    pending = false;
    previewing = false;
    file.disabled = false;
    file.value = '';
    selectedFile = null;
    preview.replaceChildren();
    error.textContent = '';
    feedback.textContent =
      'Preview cancelled. Applied changes, if any, remain unsaved in the builder.';
    validate.disabled = true;
    validate.textContent = 'Preview JSON';
    if (file.isConnected && file.getClientRects().length) file.focus();
  }
  const validate = button('Preview JSON', async () => {
    const chosen = file.files[0];
    if (!chosen || pending) return;
    if (
      previewing &&
      !confirm(
        'Replace this review with a new preview? Current selections will be reset. Questions and rubric already applied stay unchanged.',
      )
    )
      return;
    const current = ++epoch;
    pending = true;
    file.disabled = true;
    validate.disabled = true;
    error.textContent = '';
    feedback.textContent = 'Validating JSON…';
    validate.textContent = 'Validating JSON…';
    try {
      if (chosen.size > 262144) throw Error('Choose a JSON file no larger than 256 KiB.');
      const source = new TextDecoder('utf-8', { fatal: true }).decode(await chosen.arrayBuffer());
      const proposal = await request('/api/assessments/proposals/validate', { source });
      if (epoch !== current) return;
      previewing = true;
      feedback.textContent = 'JSON validated. Review before applying.';
      renderProposalPreview(preview, proposal, {
        el,
        button,
        append,
        replaceRubric,
        cancel: clear,
      });
    } catch (e) {
      if (epoch === current) {
        feedback.textContent = '';
        error.textContent =
          'Unable to preview JSON. ' + e.message + ' Choose a corrected file or retry.';
      }
    } finally {
      if (epoch === current) {
        pending = false;
        file.disabled = false;
        validate.disabled = false;
        validate.textContent = 'Preview JSON';
      }
    }
  });
  validate.disabled = true;
  file.addEventListener('change', () => {
    if (
      (previewing || selectedFile) &&
      !confirm(
        'Discard the selected file and current review to choose another JSON file? Applied questions and rubric stay in the builder.',
      )
    ) {
      const retained = new DataTransfer();
      if (selectedFile) retained.items.add(selectedFile);
      file.files = retained.files;
      return;
    }
    selectedFile = file.files[0] ?? null;
    epoch++;
    previewing = false;
    preview.replaceChildren();
    error.textContent = '';
    feedback.textContent = '';
    validate.disabled = !file.files.length;
  });
  const actions = el('div', null, { class: 'proposal-actions' });
  actions.append(validate, button('Clear JSON import', clear));
  host.append(
    el('h3', 'Select a JSON file'),
    el(
      'p',
      'Use assessment-proposals-v1, UTF-8 JSON up to 256 KiB. Plain text only; no HTML or images. Up to 30 questions per file and per assessment. Review answers and apply the assessment rubric separately.',
    ),
    el('label', 'JSON proposal file', { for: file.id }),
    file,
    actions,
    feedback,
    error,
    preview,
  );
  return {
    work: () => ({ dirty: previewing || !!file.files.length, pending }),
    dispose: () => {
      epoch++;
    },
  };
}

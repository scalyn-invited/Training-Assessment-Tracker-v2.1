export const defaultMatrix = () => ({ instructions: '', notes_enabled: false, required: false,
    areas: [{ id: crypto.randomUUID(), text: '' }],
    ratings: ['Very confident', 'Fairly confident', 'Not very confident', 'Not at all confident'].map(text => ({ id: crypto.randomUUID(), text })) });

export function matrixReadiness(q, index) {
    const errors = {}, m = q.matrix, prefix = `questions.${index}.matrix`;
    if (!m.areas.length) errors[prefix + '.areas'] = 'Add at least one assessment area.';
    m.areas.forEach((a, i) => { if (!a.text?.trim()) errors[`${prefix}.areas.${i}.text`] = `Enter a statement for area ${i + 1}.`; });
    if (m.ratings.length < 2) errors[prefix + '.ratings'] = 'Add at least two rating columns.';
    const seen = new Set();
    m.ratings.forEach((r, i) => { const value = (r.text || '').trim().toLowerCase(); if (!value || seen.has(value)) errors[`${prefix}.ratings.${i}.text`] = `Use a distinct, non-blank heading for rating ${i + 1}.`; seen.add(value); });
    return errors;
}

export function matrixPreview(q, el) {
    const m = q.matrix, root = el('div', null, { class: 'assessment-matrix' });
    root.style.setProperty('--matrix-columns', m.ratings.length);
    root.classList.toggle('matrix-with-notes', m.notes_enabled);
    root.append(el('p', m.instructions || '', { class: 'section-instructions' }), el('p', `Self-assessment reflection (not graded). ${m.required ? 'A rating is required for every area.' : 'Ratings are optional.'}`));
    const header = el('div', null, { class: 'matrix-header', 'aria-hidden': 'true' });
    header.append(el('strong', 'Assessment area')); m.ratings.forEach(r => header.append(el('strong', r.text || 'Untitled rating'))); if (m.notes_enabled) header.append(el('strong', 'Notes')); root.append(header);
    m.areas.forEach(a => {
        const row = el('div', null, { class: 'matrix-row', role: 'radiogroup', 'aria-labelledby': 'preview-area-' + q.id + '-' + a.id });
        row.append(el('div', a.text || 'Untitled area', { id: 'preview-area-' + q.id + '-' + a.id, class: 'matrix-area' }));
        m.ratings.forEach(r => {
            const label = el('label', null, { class: 'matrix-choice' });
            label.append(el('input', null, { type: 'radio', name: `preview-matrix-${q.id}-${a.id}`, value: r.id, 'aria-label': `${a.text || 'Untitled area'}: ${r.text || 'Untitled rating'}` }), el('span', r.text || 'Untitled rating', { class: 'matrix-rating-label' })); row.append(label);
        });
        if (m.notes_enabled) { const label = el('label', 'Notes (optional)', { class: 'matrix-note' }); label.append(el('textarea', '', { maxlength: '500', rows: '2', 'aria-label': `Notes for ${a.text || 'Untitled area'}` })); row.append(label); }
        root.append(row);
    });
    return root;
}

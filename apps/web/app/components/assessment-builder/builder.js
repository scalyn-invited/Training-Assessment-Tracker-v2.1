import { Editor } from '@tiptap/core';
import { registerWorkGuard } from '../work-guard';
import { questionReference } from '../question-reference';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { defaultMatrix, matrixReadiness, matrixPreview } from './assessment-matrix.js';

const PrivateImage = Image.extend({
    parseHTML() { return [{ tag: 'img[src]', getAttrs: node => /^\/assessments\/media\/[a-f0-9-]{36}$/.test(node.getAttribute('src') || '') ? null : false }]; },
});

export function mountAssessmentBuilder(root, initial) {
const lifetime = new AbortController();

const mobileBar = document.querySelector('.mobile-bar');
const observer = mobileBar ? new ResizeObserver(() => root.style.setProperty('--builder-nav-offset', mobileBar.getBoundingClientRect().height+'px')) : null; if(mobileBar)observer.observe(mobileBar);

const $ = id => root.querySelector('#'+CSS.escape(id));
const uuid = () => crypto.randomUUID();
const clone = value => JSON.parse(JSON.stringify(value));
const state = structuredClone(initial);

state.answer_key ||= {};
const newQuestion = () => ({ id: uuid(), type: 'open_response', prompt: '', choices: [] });
if (!state.id && !state.questions.length) state.questions.push(newQuestion());
if (!state.id) state.sections = [{ id: uuid(), title: '', instructions: '', question_ids: state.questions.map(q => q.id) }];
state.sections ??= null;
let selectedSection = state.sections?.[0]?.id, sectionUndo = null;
syncOrder();
state.questions.forEach(q => { q.type ||= 'open_response'; q.choices ||= []; });
let selected = state.questions[0]?.id, editor, dirty = !state.id, saving = false, generation = 0, retryPayload = null;
let serverErrors = {}, removed = [], uploadPending = false;
let matrixRemoved = [];
let publication = null, conflict = false;
const csrf = $('builder-csrf').value;
const status = message => $('save-status').textContent = message;
const el = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text !== null) node.textContent = text;
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
};
function button(text, action, attrs = {}) {
    const node = el('button', text, { type: 'button', class: 'secondary', ...attrs });
    node.addEventListener('click', action);
    return node;
}
function changed() {
    dirty = true; generation++; serverErrors = {};
    status('Unsaved changes');
    $('save-definition').textContent = 'Save draft';
    updatePublish();
    updateCardErrors();
    updateSectionErrors();
}
function field(parent, label, value, change, id, type = 'text') {
    const input = el(type === 'textarea' ? 'textarea' : 'input', null, { id });
    if (type !== 'textarea') input.type = type;
    input.value = value ?? '';
    input.addEventListener('input', () => { change(input.value); changed(); });
    parent.append(el('label', label, { for: id }), input);
    return input;
}
function move(items, index, delta) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    changed();
}
function section(name, focus = true) {
    root.querySelectorAll('[data-section]').forEach(b => {
        if (b.dataset.section === name) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    root.querySelectorAll('.builder-section').forEach(s => s.hidden = s.id !== 'section-' + name);
    $('add-question-sticky').hidden = name !== 'questions';
    if (name === 'review') renderReview();
    if (focus) $(name + '-heading').focus();
}
root.querySelectorAll('[data-section]').forEach(b => b.addEventListener('click', () => section(b.dataset.section)));
$('assessment-title').value = state.title;
$('assessment-title').addEventListener('input', e => { state.title = e.target.value; changed(); });
$('assessment-threshold').value = state.threshold ?? '';
$('assessment-threshold').addEventListener('input', e => { state.threshold = e.target.value === '' ? null : Number(e.target.value); changed(); });

function activeSection() { return state.sections?.find(s => s.id === selectedSection); }
function syncOrder() {
    if (state.sections === null) return;
    const questions = new Map(state.questions.map(q => [q.id, q]));
    state.questions = state.sections.flatMap(s => s.question_ids.map(id => questions.get(id))).filter(Boolean);
}
function selectAssessmentSection(id) {
    selectedSection = id; selected = activeSection()?.question_ids[0];
    renderSections(); renderList(); renderQuestion(); $('section-title')?.focus();
}
function renderSections() {
    const host = $('assessment-section-manager'); host.replaceChildren();
    if (state.sections === null) {
        host.append(el('p', 'This assessment uses the original single-page learner flow.'), button('Organise into sections', () => {
            state.sections = [{ id: uuid(), title: '', instructions: '', question_ids: state.questions.map(q => q.id) }];
            changed(); selectAssessmentSection(state.sections[0].id);
        })); return;
    }
    const nav = el('nav', null, { 'aria-label': 'Question sections', class: 'builder-actions' });
    state.sections.forEach((s, i) => nav.append(button(`${i + 1}. ${s.title || 'Untitled section'} · ${s.question_ids.length} questions`, () => selectAssessmentSection(s.id), { 'aria-pressed': String(s.id === selectedSection) })));
    host.append(nav);
    const add = button('Add section', () => { const s = { id: uuid(), title: '', instructions: '', question_ids: [] }; state.sections.push(s); changed(); selectAssessmentSection(s.id); });
    add.disabled = state.sections.length >= 30; host.append(add);
    const current = activeSection();
    if (current) {
        const title = field(host, 'Section title (required for publication)', current.title, value => {
            current.title = value;
            nav.children[state.sections.indexOf(current)].textContent = `${state.sections.indexOf(current) + 1}. ${value || 'Untitled section'} · ${current.question_ids.length} questions`;
        }, 'section-title'); title.maxLength = 180;
        field(host, 'Learner instructions (optional)', current.instructions, value => current.instructions = value, 'section-instructions', 'textarea').maxLength = 4000;
        const actions = el('div', null, { class: 'builder-actions' });
        for (const [label, delta] of [['Move section up', -1], ['Move section down', 1]]) {
            const index = state.sections.indexOf(current);
            const b = button(label, () => { move(state.sections, index, delta); syncOrder(); renderSections(); renderList(); renderQuestion(); $('section-title').focus(); status('Section moved. Unsaved changes.'); });
            b.disabled = index + delta < 0 || index + delta >= state.sections.length; actions.append(b);
        }
        const removal = el('details', null); removal.append(el('summary', 'Remove section'), el('p', `This section contains ${current.question_ids.length} questions. Move them to another section, or remove them with the section. Undo is available until saving.`));
        const destinations = state.sections.filter(s => s.id !== current.id);
        const destination = el('select', null, { id: 'remove-section-destination' });
        destinations.forEach(s => destination.append(el('option', s.title || 'Untitled section', { value: s.id })));
        if (destinations.length && current.question_ids.length) {
            removal.append(el('label', 'Move questions to', { for: destination.id }), destination, button('Move questions and remove section', () => removeSection(current, destination.value)));
        } else if (current.question_ids.length) removal.append(el('p', 'Create another section first to move these questions.'));
        removal.append(button(current.question_ids.length ? 'Remove section and questions' : 'Remove empty section', () => {
            if (current.question_ids.length && !confirm(`Remove this section and its ${current.question_ids.length} questions? You can undo before saving.`)) return;
            removeSection(current);
        }), button('Cancel removal', () => { removal.open = false; removal.querySelector('summary').focus(); })); actions.append(removal); host.append(actions);
        host.append(el('div', null, { id: 'section-field-errors' }));
        updateSectionErrors();
    }
    if (sectionUndo) host.append(button('Undo section removal', () => {
        const missing = sectionUndo.questions.filter(q => !state.questions.some(existing => existing.id === q.id));
        if (state.questions.length + missing.length > 30 || state.sections.length >= 30) { status('Make room before restoring this section (30 questions and 30 sections maximum).'); return; }
        const restored = clone(sectionUndo.section);
        state.sections.forEach(s => s.question_ids = s.question_ids.filter(id => !restored.question_ids.includes(id)));
        state.sections.splice(sectionUndo.index, 0, restored); state.questions.push(...missing);
        missing.forEach(q => { if (sectionUndo.keys[q.id]) state.answer_key[q.id] = sectionUndo.keys[q.id]; });
        sectionUndo = null; syncOrder(); changed(); selectAssessmentSection(restored.id); status('Section removal undone. Unsaved changes.');
    }));
}
function updateSectionErrors() {
    const host = $('section-field-errors'); if (!host) return;
    const index = state.sections.indexOf(activeSection());
    const messages = Object.entries(readiness()).filter(([key]) => key.startsWith(`sections.${index}.`));
    host.replaceChildren(errorList(Object.fromEntries(messages))); host.hidden = !messages.length;
}
function removeSection(current, destination) {
    sectionUndo = clone({ section: current, index: state.sections.indexOf(current), questions: state.questions.filter(q => current.question_ids.includes(q.id)), keys: state.answer_key });
    if (destination) state.sections.find(s => s.id === destination).question_ids.push(...current.question_ids);
    else { current.question_ids.forEach(id => delete state.answer_key[id]); state.questions = state.questions.filter(q => !current.question_ids.includes(q.id)); }
    state.sections = state.sections.filter(s => s.id !== current.id); syncOrder(); changed(); selectAssessmentSection(destination || state.sections[0]?.id);
    status('Section removed. Undo is available until saving.');
}
function renderList() {
    $('question-list').replaceChildren();
    state.questions.forEach((q, i) => {
        if (state.sections !== null && !activeSection()?.question_ids.includes(q.id)) return;
        const li = el('li', null);
        const choose = button(`${i + 1}. ${q.prompt.trim().slice(0, 65) || 'Untitled question'}`, () => { selected = q.id; renderQuestion(); renderList(); $('question-type').focus(); }, { 'aria-pressed': String(selected === q.id) });
        choose.append(el('small', q.type === 'self_assessment' ? 'Self assessment' : q.type === 'multiple_choice' ? 'Multiple choice' : 'Open response'));
        li.append(choose); $('question-list').append(li);
    });
    $('question-count').textContent = `${state.questions.length} of 30 questions · Select a question to edit`;
    root.querySelectorAll('[data-add-question]').forEach(b => b.disabled = state.questions.length >= 30 || (state.sections !== null && !activeSection()));
}
function renderQuestion() {
    editor?.destroy(); editor = null;
    const card = $('question-card'); card.replaceChildren();
    const q = state.questions.find(q => q.id === selected);
    if (!q) { card.append(el('p', 'No questions yet. Add a question to get started.')); return; }
    const index = state.questions.indexOf(q);
    const order = activeSection()?.question_ids || state.questions;
    const localIndex = activeSection() ? order.indexOf(q.id) : index;
    card.append(el('h3', `Question ${index + 1}`));
    const actions = el('div', null, { class: 'builder-actions' });
    for (const [label, delta] of [['Move question up', -1], ['Move question down', 1]]) {
        const b = button(label, () => { move(order, localIndex, delta); syncOrder(); renderList(); renderQuestion(); $('question-type').focus(); status(`Question moved to position ${index + delta + 1}. Unsaved changes.`); });
        b.disabled = localIndex + delta < 0 || localIndex + delta >= order.length; actions.append(b);
    }
    const duplicate = button('Duplicate question', () => {
        const copy = clone(q), oldKey = state.answer_key[q.id]; copy.id = uuid();
        copy.choices.forEach(c => { const original = c.id; c.id = uuid(); if (original === oldKey) state.answer_key[copy.id] = c.id; });
        if (copy.matrix) for (const kind of ['areas', 'ratings']) copy.matrix[kind].forEach(item => item.id = uuid());
        state.questions.splice(index + 1, 0, copy); activeSection()?.question_ids.splice(localIndex + 1, 0, copy.id); syncOrder(); renderSections(); selected = copy.id; changed(); renderList(); renderQuestion(); $('question-type').focus();
    });
    duplicate.disabled = state.questions.length >= 30;
    actions.append(duplicate, button('Remove question', () => {
        removed.push({ question: clone(q), key: state.answer_key[q.id], index, sectionId: selectedSection, localIndex });
        activeSection()?.question_ids.splice(localIndex, 1); state.questions.splice(index, 1); renderSections(); delete state.answer_key[q.id]; selected = state.sections !== null ? activeSection()?.question_ids[Math.min(localIndex, activeSection().question_ids.length - 1)] : state.questions[Math.min(index, state.questions.length - 1)]?.id;
        $('removed-question').hidden = false; $('removed-message').textContent = `${removed.length} question(s) removed. Undo is available until you save.`;
        changed(); renderList(); renderQuestion(); $('undo-question').focus();
    })); card.append(actions);
    if (state.sections !== null && state.sections.length > 1) {
        const target = el('select', null, { id: 'question-destination' });
        state.sections.filter(s => s.id !== selectedSection).forEach(s => target.append(el('option', s.title || 'Untitled section', { value: s.id })));
        card.append(el('label', 'Move question to section', { for: target.id }), target, button('Move question', () => {
            activeSection().question_ids.splice(localIndex, 1); state.sections.find(s => s.id === target.value).question_ids.push(q.id);
            selectedSection = target.value; syncOrder(); changed(); renderSections(); renderList(); renderQuestion(); $('question-type').focus(); status('Question moved. Its answers and content are unchanged. Unsaved changes.');
        }));
    }
    card.append(el('label', 'Question type', { for: 'question-type' }));
    const type = el('select', null, { id: 'question-type' });
    type.append(el('option', 'Open response', { value: 'open_response' }), el('option', 'Multiple choice', { value: 'multiple_choice' }), el('option', 'Self assessment', { value: 'self_assessment' })); type.value = q.type;
    type.addEventListener('change', () => {
        q.type = type.value;
        if (q.type === 'multiple_choice' && !q.choices.length) q.choices = [{ id: uuid(), text: '' }, { id: uuid(), text: '' }];
        if (q.type === 'self_assessment') q.matrix ||= defaultMatrix();
        changed(); renderList(); renderQuestion(); $('question-type').focus();
    }); card.append(type);
    card.append(el('label', q.type === 'self_assessment' ? 'Matrix heading' : 'Question prompt', { id: 'prompt-label' }));
    const toolbar = el('div', null, { class: 'builder-toolbar', role: 'group', 'aria-label': 'Prompt formatting' });
    const editorHost = el('div', null, { class: 'prompt-editor' });
    card.append(toolbar, editorHost);
    const content = q.prompt_html ?? `<p>${escapeText(q.prompt).replaceAll('\n', '<br>')}</p>`;
    editor = new Editor({ element: editorHost, extensions: [StarterKit.configure({ heading: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, link: { openOnClick: false } }), PrivateImage.configure({ inline: true, allowBase64: false })], content,
        editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': 'prompt-label', 'data-testid': 'prompt-editor' } },
        onUpdate: ({ editor: instance }) => { q.prompt_html = instance.getHTML(); q.prompt = instance.getText(); changed(); renderList(); },
        onSelectionUpdate: () => updateToolbar(),
    });
    const formats = [['Bold', 'bold', 'toggleBold'], ['Italic', 'italic', 'toggleItalic'], ['Bullet list', 'bulletList', 'toggleBulletList'], ['Numbered list', 'orderedList', 'toggleOrderedList']];
    function updateToolbar() { toolbar.querySelectorAll('[data-format]').forEach(b => b.setAttribute('aria-pressed', String(editor?.isActive(b.dataset.format)))); }
    formats.forEach(([label, format, command]) => toolbar.append(button(label, () => { editor.chain().focus()[command]().run(); updateToolbar(); }, { 'data-format': format, 'aria-pressed': 'false' })));
    const linkFields = el('details', null); linkFields.append(el('summary', 'Insert or edit link'));
    const link = field(linkFields, 'Link URL', '', () => {}, 'prompt-link', 'url');
    linkFields.append(button('Apply link', () => {
        try { const url = new URL(link.value); if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) throw Error(); editor.chain().focus().extendMarkRange('link').setLink({ href: url.href }).run(); linkFields.open = false; }
        catch { link.setCustomValidity('Use an https, http or mailto link.'); link.reportValidity(); }
    }), button('Remove link', () => editor.chain().focus().unsetLink().run()));
    link.addEventListener('input', () => link.setCustomValidity(''));
    card.append(linkFields);
    const imageFields = el('details', null); imageFields.append(el('summary', 'Insert image or edit alt text'));
    const alt = field(imageFields, 'Image alt text', '', () => {}, 'image-alt'); alt.maxLength = 500;
    const file = field(imageFields, 'Image file (PNG, JPEG or WebP, up to 2 MiB)', '', () => {}, 'prompt-image', 'file'); file.accept = '.png,.jpg,.jpeg,.webp';
    const uploadStatus = el('p', '', { role: 'status' });
    const progress = el('progress', null, { max: '100', value: '0', 'aria-label': 'Image upload progress', hidden: '' });
    let mediaId, selectedFile;
    file.addEventListener('change', () => { mediaId = null; selectedFile = file.files[0]; });
    const uploadButton = button('Upload and insert image', async () => {
        if (uploadPending) return;
        selectedFile = file.files[0] || selectedFile;
        if (!selectedFile && !mediaId) { uploadStatus.textContent = 'Choose an image to upload.'; return; }
        if (!alt.value.trim()) { uploadStatus.textContent = 'Add alt text describing the image before inserting it.'; alt.focus(); return; }
        if (selectedFile?.size > 2 * 1024 * 1024) { uploadStatus.textContent = 'Choose an image smaller than 2 MiB.'; return; }
        uploadPending = true; uploadButton.disabled = true; uploadStatus.textContent = 'Uploading image…'; updatePublish();
        const altText = alt.value;
        try {
            if (mediaId) {
                const previous = await request(`/assessments/media/${mediaId}/status`);
                if (previous.status === 'unavailable') await request(`/assessments/media/${mediaId}/retry`, {});
            }
            else {
                const data = new FormData(); data.append('csrf',csrf); data.append('clientId',root.dataset.client); data.append('image', selectedFile); progress.hidden = false;
                const result = await upload(data, percent => progress.value = percent); mediaId = result.id;
            }
            progress.hidden = true; uploadStatus.textContent = 'Checking the image. Your prompt is preserved.';
            let result;
            for (let i = 0; i < 75; i++) {
                result = await request(`/assessments/media/${mediaId}/status`);
                if (!['quarantined', 'scanning'].includes(result.status)) break;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            if (result.status !== 'ready') {
                if (result.status === 'rejected') { mediaId = null; throw Error('This image was rejected. Choose another image.'); }
                throw Error('Image processing is unavailable or still pending. Retry after the scanner and worker are available.');
            }
            if (selected === q.id && editor) editor.chain().focus().setTextSelection(editor.state.selection.to).setImage({ src: result.url, alt: altText }).run();
            else { q.prompt_html = (q.prompt_html ?? `<p>${escapeText(q.prompt)}</p>`) + `<p><img src="${result.url}" alt="${escapeText(altText)}"></p>`; changed(); }
            mediaId = null; selectedFile = null; file.value = ''; uploadStatus.textContent = 'Image inserted. Save the draft to keep it.';
        } catch (error) { uploadStatus.textContent = error.message + ' Your prompt is intact.'; uploadButton.textContent = 'Retry image upload'; }
        finally { uploadPending = false; uploadButton.disabled = false; progress.hidden = true; updatePublish(); }
    });
    imageFields.append(uploadButton, button('Update selected image alt text', () => {
        if (!editor.isActive('image')) { uploadStatus.textContent = 'Select an image in the prompt first.'; return; }
        editor.chain().focus().updateAttributes('image', { alt: alt.value }).run();
    }), progress, uploadStatus); card.append(imageFields);
    if (q.type === 'multiple_choice') renderChoices(card, q);
    if (q.type === 'self_assessment') renderMatrix(card, q);
    const errors = readiness();
    const relevant = Object.entries(errors).filter(([key]) => key.startsWith(`questions.${index}.`));
    { const list = el('ul', null, { class: 'builder-field-errors' }); relevant.forEach(([, message]) => list.append(el('li', message))); list.hidden = !relevant.length; card.append(list); }
}
function renderMatrix(card, q) {
    const m = q.matrix;
    field(card, 'Matrix learner instructions (optional)', m.instructions, value => m.instructions = value, 'matrix-instructions', 'textarea').maxLength = 4000;
    for (const [key, text] of [['required', 'Require a rating for every area'], ['notes_enabled', 'Include optional Notes column']]) {
        const label = el('label', null, { class: 'correct-choice' }), checkbox = el('input', null, { type: 'checkbox' }); checkbox.checked = m[key];
        checkbox.addEventListener('change', () => { m[key] = checkbox.checked; changed(); }); label.append(checkbox, document.createTextNode(text)); card.append(label);
    }
    for (const [kind, singular, maximum] of [['areas', 'Assessment area', 30], ['ratings', 'Rating heading', 10]]) {
        const group = el('fieldset', null); group.append(el('legend', kind === 'areas' ? 'Assessment areas' : 'Rating columns'));
        m[kind].forEach((item, i) => {
            const row = el('div', null, { class: 'matrix-author-row' });
            field(row, `${singular} ${i + 1}`, item.text, value => item.text = value, `matrix-${kind}-${item.id}`, kind === 'areas' ? 'textarea' : 'text').maxLength = kind === 'areas' ? 4000 : 120;
            const actions = el('div', null, { class: 'builder-actions' });
            for (const [direction, delta] of [['up', -1], ['down', 1]]) {
                const control = button(`Move ${kind === 'areas' ? 'area' : 'rating'} ${i + 1} ${direction}`, () => { move(m[kind], i, delta); renderQuestion(); $(`matrix-${kind}-${item.id}`).focus(); });
                control.disabled = i + delta < 0 || i + delta >= m[kind].length; actions.append(control);
            }
            actions.append(button(`Remove ${kind === 'areas' ? 'area' : 'rating'} ${i + 1}`, () => { matrixRemoved.push({ question: q.id, kind, item: clone(item), index: i }); m[kind].splice(i, 1); changed(); renderQuestion(); $(`add-matrix-${kind}`).focus(); }));
            row.append(actions); group.append(row);
        });
        const add = button(kind === 'areas' ? 'Add assessment area' : 'Add rating column', () => { const item = { id: uuid(), text: '' }; m[kind].push(item); changed(); renderQuestion(); $(`matrix-${kind}-${item.id}`).focus(); }, { id: `add-matrix-${kind}` }); add.disabled = m[kind].length >= maximum; group.append(add); card.append(group);
    }
    const removedIndex = matrixRemoved.findLastIndex(item => item.question === q.id);
    if (removedIndex >= 0) card.append(button('Undo matrix removal', () => {
        const last = matrixRemoved[removedIndex]; if (m[last.kind].length >= (last.kind === 'areas' ? 30 : 10)) { status('Make room before restoring this item.'); return; }
        m[last.kind].splice(last.index, 0, last.item); matrixRemoved.splice(removedIndex, 1); changed(); renderQuestion(); $(`matrix-${last.kind}-${last.item.id}`).focus();
    }));
}
function renderChoices(card, q) {
    const group = el('fieldset', null); group.append(el('legend', 'Answer choices'), el('p', 'Choose one correct answer. Unanswered learner questions score zero.'));
    q.choices.forEach((choice, i) => {
        const row = el('div', null, { class: 'builder-choice' });
        const input = field(row, `Choice ${i + 1}`, choice.text, value => choice.text = value, 'choice-' + choice.id); input.maxLength = 1000;
        const label = el('label', null, { class: 'correct-choice' });
        const radio = el('input', null, { type: 'radio', name: 'correct-' + q.id, value: choice.id, 'aria-label': `Correct answer: choice ${i + 1}` }); radio.checked = state.answer_key[q.id] === choice.id;
        radio.addEventListener('change', () => { state.answer_key[q.id] = choice.id; changed(); }); label.append(radio, document.createTextNode('Correct answer')); row.append(label);
        const actions = el('div', null, { class: 'builder-actions' });
        for (const [name, delta] of [['up', -1], ['down', 1]]) {
            const b = button(`Move choice ${name}`, () => { move(q.choices, i, delta); renderQuestion(); $('choice-' + choice.id).focus(); }, { 'aria-label': `Move choice ${i + 1} ${name}` });
            b.disabled = i + delta < 0 || i + delta >= q.choices.length; actions.append(b);
        }
        actions.append(button('Remove choice', () => {
            q.choices.splice(i, 1); if (state.answer_key[q.id] === choice.id) delete state.answer_key[q.id]; changed(); renderQuestion(); $('add-choice').focus();
        }, { 'aria-label': `Remove choice ${i + 1}` })); row.append(actions); group.append(row);
    });
    const add = button('Add choice', () => { const c = { id: uuid(), text: '' }; q.choices.push(c); changed(); renderQuestion(); $('choice-' + c.id).focus(); }, { id: 'add-choice' }); add.disabled = q.choices.length >= 30;
    group.append(add); card.append(group);
}
root.querySelectorAll('[data-add-question]').forEach(b => b.addEventListener('click', () => { const q = newQuestion(); state.questions.push(q); activeSection()?.question_ids.push(q.id); syncOrder(); renderSections(); selected = q.id; changed(); renderList(); renderQuestion(); $('question-type').focus(); }));
$('undo-question').addEventListener('click', () => {
    if (state.questions.length >= 30) { status('Remove another question before restoring this one; the limit is 30.'); return; }
    const last = removed[removed.length - 1]; if (!last) return;
    if (state.sections !== null && !state.sections.some(s => s.id === last.sectionId)) { status('Undo the section removal first, or restore the question before removing its section.'); return; }
    removed.pop();
    if (state.sections !== null) { selectedSection = last.sectionId; activeSection().question_ids.splice(last.localIndex, 0, last.question.id); }
    state.questions.splice(Math.min(last.index, state.questions.length), 0, last.question); if (last.key) state.answer_key[last.question.id] = last.key;
    syncOrder(); renderSections(); selected = last.question.id; $('removed-question').hidden = !removed.length; changed(); renderList(); renderQuestion(); $('question-type').focus();
});
function renderRubric(openId) {
    const cards = $('criterion-cards'); cards.replaceChildren();
    if (!state.criteria.length) cards.append(el('p', 'No criteria yet. Add a criterion for open responses. A multiple-choice-only assessment does not need a rubric.'));
    state.criteria.forEach((c, i) => {
        const details = el('details', null); details.open = c.id === openId;
        details.append(el('summary', `${i + 1}. ${c.label || 'Untitled criterion'}`));
        for (const [key, label, type, max] of [['category', 'Category', 'text', 120], ['label', 'Criterion', 'text', 180], ['guidance', 'Scoring guidance', 'textarea', 4000]]) {
            const input = field(details, label, c[key], value => c[key] = value, `criterion-${c.id}-${key}`, type); input.maxLength = max;
        }
        const weight = field(details, 'Weight (%)', c.weight == null ? '' : Number((c.weight * 100).toFixed(4)), value => { c.weight = value === '' ? null : Number(value) / 100; weightTotal(); }, `criterion-${c.id}-weight`, 'number');
        weight.min = '0'; weight.max = '100'; weight.step = '0.0001';
        details.append(button('Remove criterion', () => { if (!confirm('Remove this scoring criterion from the draft?')) return; state.criteria.splice(i, 1); changed(); renderRubric(); $('add-criterion').focus(); })); cards.append(details);
    });
    $('add-criterion').disabled = state.criteria.length >= 30; $('equal-weights').disabled = !state.criteria.length; weightTotal();
}
function weightTotal() { $('weight-total').textContent = `Total weight: ${(state.criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0) * 100).toFixed(4).replace(/\.?0+$/, '') || '0'}% · Required: 100%`; }
$('add-criterion').addEventListener('click', () => { const c = { id: uuid(), category: '', label: '', guidance: '', weight: null }; state.criteria.push(c); changed(); renderRubric(c.id); $(`criterion-${c.id}-category`).focus(); });
$('equal-weights').addEventListener('click', () => { const n = state.criteria.length, base = Math.floor(1000000 / n), extra = 1000000 % n; state.criteria.forEach((c, i) => c.weight = (base + (i < extra ? 1 : 0)) / 1000000); changed(); renderRubric(state.criteria[0]?.id); });
function readiness() {
    const errors = {};
    if (state.sections !== null) {
        if (!state.sections.length) errors.sections = 'Add at least one section.';
        state.sections.forEach((s, i) => {
            if (!s.title?.trim()) errors[`sections.${i}.title`] = `Section ${i + 1}: add a title.`;
            if (!s.question_ids.length) errors[`sections.${i}.question_ids`] = `Section ${i + 1}: add at least one question.`;
        });
    }
    if (!state.title.trim()) errors.title = 'Add an assessment title.';
    if (state.threshold !== null && (!Number.isFinite(state.threshold) || state.threshold < 0 || state.threshold > 100)) errors.threshold = 'Use a threshold from 0 to 100.';
    if (!state.questions.length) errors.questions = 'Add at least one question.';
    state.questions.forEach((q, i) => {
        if (!q.prompt.trim()) errors[`questions.${i}.prompt`] = `Question ${i + 1}: add a prompt.`;
        if (q.type === 'self_assessment') Object.assign(errors, matrixReadiness(q, i));
        if (q.type === 'multiple_choice') {
            if (q.choices.length < 2 || q.choices.some(c => !c.text?.trim())) errors[`questions.${i}.choices`] = `Question ${i + 1}: add at least two choices and complete every choice.`;
            if (!q.choices.some(c => c.id === state.answer_key[q.id])) errors[`questions.${i}.correct`] = `Question ${i + 1}: select one correct answer.`;
        }
    });
    if (state.questions.some(q => q.type === 'open_response') && !state.criteria.length) errors.criteria = 'Add a rubric for open responses.';
    state.criteria.forEach((c, i) => { for (const field of ['category', 'label', 'guidance', 'weight']) if (!c[field] || (typeof c[field] === 'string' && !c[field].trim())) errors[`criteria.${i}.${field}`] = `Criterion ${i + 1}: complete ${field}.`; });
    if (state.criteria.length && Math.abs(state.criteria.reduce((n, c) => n + Number(c.weight || 0), 0) - 1) >= 0.000001) errors.criteria = 'Criterion weights must total 100%.';
    return { ...errors, ...serverErrors };
}
function updateCardErrors() {
    const list = $('question-card').querySelector('.builder-field-errors');
    if (!list) return;
    const index = state.questions.findIndex(q => q.id === selected);
    const errors = Object.entries(readiness()).filter(([key]) => key.startsWith(`questions.${index}.`));
    list.replaceChildren(...errors.map(([, message]) => el('li', Array.isArray(message) ? message.join(' ') : message)));
    list.hidden = !errors.length;
}
function goError(key) {
    if (key.startsWith('sections')) { const s = state.sections?.[Number(key.split('.')[1])]; section('questions'); selectAssessmentSection(s?.id || selectedSection); if (key.endsWith('question_ids')) $('add-question').focus(); }
    else if (key.startsWith('questions')) { const q = state.questions[Number(key.split('.')[1])]; if (q) { selected = q.id; selectedSection = state.sections?.find(s => s.question_ids.includes(q.id))?.id; } section('questions'); renderSections(); renderList(); renderQuestion(); const parts = key.split('.'); if (parts[2] === 'matrix') { const item = q?.matrix?.[parts[3]]?.[Number(parts[4])]; (item ? $(`matrix-${parts[3]}-${item.id}`) : $(`add-matrix-${parts[3]}`))?.focus(); } else editor?.commands.focus(); }
    else if (key.startsWith('criteria') || key.startsWith('rubric.criteria')) { const parts = key.replace('rubric.', '').split('.'); const c = state.criteria[Number(parts[1])]; section('rubric'); renderRubric(c?.id); if (c) $(`criterion-${c.id}-${parts[2] || 'category'}`)?.focus(); }
    else { section('details'); $(key.includes('threshold') ? 'assessment-threshold' : 'assessment-title').focus(); }
}
function errorList(errors) {
    const list = el('ul', null, { class: 'builder-checklist' });
    Object.entries(errors).forEach(([key, value]) => { const li = el('li', null); li.append(button(Array.isArray(value) ? value.join(' ') : value, () => goError(key))); list.append(li); });
    return list;
}
function mapSaveErrors(errors, payload) {
    const mapped = {};
    Object.entries(errors).forEach(([key, value]) => {
        key = key.replace(/^rubric\.criteria/, 'criteria');
        const match = /^(questions|criteria|sections)\.(\d+)(.*)$/.exec(key);
        if (match) {
            const id = payload[match[1]][Number(match[2])]?.id;
            const index = state[match[1]].findIndex(item => item.id === id);
            if (index < 0) return;
            key = `${match[1]}.${index}${match[3]}`;
            const matrix = /^\.matrix\.(areas|ratings)\.(\d+)(.*)$/.exec(match[3]);
            if (match[1] === 'questions' && matrix) {
                const itemId = payload.questions[Number(match[2])]?.matrix?.[matrix[1]]?.[Number(matrix[2])]?.id;
                const current = state.questions[index]?.matrix?.[matrix[1]]?.findIndex(item => item.id === itemId) ?? -1;
                if (current < 0) return;
                key = `questions.${index}.matrix.${matrix[1]}.${current}${matrix[3]}`;
            }
        }
        mapped[key] = value;
    });
    return mapped;
}
function renderReview() {
    const errors = readiness(); $('readiness-list').replaceChildren(Object.keys(errors).length ? errorList(errors) : el('p', 'Ready for publication checks. The server verifies the saved revision before publishing.'));
    const preview = $('learner-preview'); preview.replaceChildren(el('h4', state.title || 'Untitled assessment'));
    preview.append(el('p', 'Content preview — responses are not saved'), el('p', dirty ? 'Current unsaved local edits' : `Saved revision ${state.revision ?? '—'} · ${state.status} · version ${state.version}`), el('p', 'Content only: save, submission, permissions and file scanning are not simulated. Author rubric is separate; answer keys are not shown.'));
    state.questions.forEach((q, i) => {
        const group = state.sections?.find(s => s.question_ids[0] === q.id);
        if (group) preview.append(el('h4', group.title || 'Untitled section'), el('p', group.instructions || '', { class: 'section-instructions' }));
        const article = el('article', null, { class: 'builder-preview-question' }); article.append(el('h4', questionReference(q.id, state.questions, state.sections)));
        const prompt = el('div', null, { class: 'assessment-prompt' });
        // Editor schema restricts this HTML; the server independently sanitises persisted markup.
        const previewEditor = new Editor({ element: prompt, editable: false, extensions: [StarterKit, PrivateImage.configure({ inline: true })], content: q.prompt_html ?? `<p>${escapeText(q.prompt)}</p>` });
        const rendered = previewEditor.getHTML(); previewEditor.destroy(); prompt.innerHTML = rendered; article.append(prompt);
        if (q.type === 'self_assessment') {
            article.append(matrixPreview(q, el));
        } else if (q.type === 'multiple_choice') {
            const choices = el('fieldset', null); choices.append(el('legend', 'Choose one answer'));
            q.choices.forEach(c => { const label = el('label', null, { class: 'correct-choice' }); label.append(el('input', null, { type: 'radio', name: 'preview-' + q.id, value: c.id }), document.createTextNode(c.text || 'Blank choice')); choices.append(label); }); article.append(choices);
        } else { article.append(el('label', 'Your response', { for: 'preview-' + q.id }), el('textarea', '', { id: 'preview-' + q.id, rows: '3' })); }
        preview.append(article);
    });
    const summary = $('rubric-summary'); summary.replaceChildren();
    state.criteria.forEach(c => summary.append(el('p', `${c.category || 'No category'} · ${c.label || 'Untitled criterion'} · ${Number(((c.weight || 0) * 100).toFixed(4))}% — ${c.guidance || 'No guidance'}`)));
    if (!state.criteria.length) summary.append(el('p', 'No rubric criteria.'));
    updatePublish();
}
function updatePublish() {
    const provenance = $('definition-provenance');
    if (provenance) {
        provenance.replaceChildren(el('p', `${state.status === 'published' ? 'Published definition' : 'Draft'} ${state.id ?? 'not saved'} · revision ${state.revision ?? 'not yet known'} · edit version ${state.version}`));
        if (state.source_definition_id) provenance.append(el('p', `Source definition ${state.source_definition_id} · revision ${state.source_revision}`));
        else if (state.id) provenance.append(el('p', 'No direct copy source is recorded for this revision.'));
        provenance.append(el('p','Existing assignments and team rules remain pinned to their original published revision. Saving a published definition creates a separate draft; it does not migrate assignments.'));
    }
    $('save-definition').disabled = saving || !!publication || conflict;
    const assign = $('assign-definition');
    assign.hidden = state.status !== 'published' || dirty || !state.id;
    assign.href = `/assessments/definitions/${state.id}/assign`;
    $('publish-definition').disabled = saving || !!publication || conflict || uploadPending || dirty || !state.id || state.status !== 'draft' || Object.keys(readiness()).length > 0;
    $('publish-help').textContent = state.status === 'published' ? 'Published. Save edits to create a new draft revision.' : dirty ? 'Save the latest changes before publishing.' : Object.keys(readiness()).length ? 'Resolve the checklist items before publishing.' : 'Publishing freezes this revision for assignment. Existing assignments remain unchanged.';
}
async function request(url, body) {
    if(url.startsWith('/assessments/media/'))url='/api'+url;
    const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', signal: AbortSignal.any([lifetime.signal,AbortSignal.timeout(30000)]), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf }, ...(body === undefined ? {} : { body: JSON.stringify({...body,csrf,clientId:root.dataset.client}) }) });
    let result; try { result = await response.json(); } catch { throw Error('The server did not return a save receipt. Retry or copy your content before reloading.'); }
    if (!response.ok) { const error = Error(result.message || 'The request failed. Retry when connected.'); error.errors = result.errors; error.status = response.status; throw error; } return result;
}
function upload(data, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest(); lifetime.signal.addEventListener('abort',()=>xhr.abort(),{once:true}); xhr.open('POST', root.dataset.upload); xhr.timeout = 30000; xhr.setRequestHeader('Accept', 'application/json'); xhr.setRequestHeader('X-CSRF-TOKEN', csrf);
        xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(100 * e.loaded / e.total); };
        xhr.onload = () => { try { const result = JSON.parse(xhr.responseText); if (xhr.status >= 400) reject(Error(result.message || 'Upload failed. Retry.')); else resolve(result); } catch { reject(Error('Upload failed. Retry when connected.')); } };
        xhr.onerror = () => reject(Error('Upload failed. Check your connection and retry.'));
        xhr.ontimeout = () => reject(Error('The upload timed out. Retry when connected.')); xhr.send(data);
    });
}
async function save() {
    if (saving || publication || conflict) return;
    const sentGeneration = generation;
    // Reuse the exact failed mutation first: an uncertain response may already have committed.
    const payload = retryPayload || { action: 'save', id: state.id, expected_version: state.version, save_token: uuid(), title: state.title, threshold: state.threshold, sections: clone(state.sections), questions: clone(state.questions), criteria: clone(state.criteria), answer_key: clone(state.answer_key) };
    const replay = !!retryPayload;
    saving = true; $('save-definition').disabled = true; status('Saving draft…'); updatePublish();
    try {
        const result = await request(root.dataset.endpoint, payload);
        if (state.id !== result.id) { state.revision = undefined; state.source_definition_id = null; state.source_revision = null; }
        state.id = result.id; state.version = result.version; state.status = result.status;
        if (result.revision !== undefined) state.revision = result.revision;
        if (result.source_definition_id !== undefined) { state.source_definition_id = result.source_definition_id; state.source_revision = result.source_revision; }
        dirty = replay || generation !== sentGeneration;
        serverErrors = dirty ? {} : result.readiness; retryPayload = null;
        if (!dirty) { if (matrixRemoved.length) { matrixRemoved = []; renderQuestion(); } sectionUndo = null; renderSections(); removed = []; $('removed-question').hidden = true; }
        history.replaceState(null, '', '/assessments/definitions/' + state.id);
        status(dirty ? 'Previous changes saved. Save again to keep your latest edits.' : 'Draft saved. Not published.');
        $('builder-errors').hidden = true;
    } catch (error) {
        if (![422, 403, 404, 409, 419].includes(error.status)) retryPayload = payload;
        else retryPayload = null;
        if (error.status === 409) { conflict = true; compareButton.hidden = false; }
        serverErrors = mapSaveErrors(error.errors || {}, payload);
        $('builder-errors').replaceChildren(el('p', error.status === 409 ? 'This draft changed in another window. Writes are stopped. Your complete local draft remains here. Compare with the saved definition before deciding to discard and reload.' : 'Draft could not be saved. Your entered content remains here. Retry after correcting the problem.'), errorList(serverErrors)); $('builder-errors').hidden = false;
        status('Save failed. Your content is preserved.'); $('save-definition').textContent = 'Retry save';
    } finally { saving = false; $('save-definition').disabled = false; updatePublish(); }
}
$('save-definition').addEventListener('click', save);
const comparison = el('div', null, {id:'definition-comparison'});
const compareButton = button('Compare with saved definition', async () => {
    compareButton.disabled = true;
    comparison.replaceChildren();
    try {
        const row = await request('/api/assessments/definitions?' + new URLSearchParams({clientId:root.dataset.client,id:state.id}));
        if (row.id !== state.id) throw Error('The returned definition does not match.');
        const details = el('details');
        details.append(el('summary','Private structured comparison'), el('p','Author-only snapshot at comparison time. Includes answer keys. Nothing is exported or merged; neither version is overwritten.'));
        for (const [label, data] of [['Local draft',state], ['Saved definition',row]]) {
            const pre = el('pre',JSON.stringify(data,null,2)); pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere';
            details.append(el('h3',label),pre);
        }
        comparison.append(details, button('Discard local edits and reload', () => {
            if (confirm('Discard all local edits and load the saved definition? This cannot be undone.')) {
                window.dispatchEvent(new Event('tat:leave-committed')); window.location.reload();
            }
        }));
    } catch (error) { comparison.append(el('p','Comparison unavailable. Local edits are unchanged. ' + error.message)); }
    finally { compareButton.disabled = false; }
});
compareButton.hidden = true;
$('save-status').after(compareButton,comparison);
const reconcileButton = button('Check publication status', () => void reconcilePublication());
reconcileButton.hidden = true;
$('save-status').after(reconcileButton);
async function reconcilePublication() {
    if (!publication) return;
    reconcileButton.disabled = true;
    try {
        const row = await request('/api/assessments/definitions?' + new URLSearchParams({clientId: root.dataset.client, id: publication.id}));
        if (row.id !== publication.id) throw Error('The returned definition does not match.');
        // Publication increments the attempted saved version exactly once. A later
        // published version belongs to changed content, not this operation.
        if (row.status === 'published' && row.version === publication.version + 1) {
            state.status = row.status; state.version = row.version; publication = null;
            status('Publication confirmed for this exact definition. Existing assignments remain unchanged.');
        } else if (row.status === 'draft' && row.version === publication.version) {
            publication = null;
            status('This exact saved version is still a draft. You may explicitly retry publication.');
        } else if ((row.status === 'draft' || row.status === 'published') && row.version > publication.version) {
            // Exact-ID readback confirms changed saved content, not our publication.
            // Keep the local version/content intact and stop writes until explicit recovery.
            publication = null; conflict = true; compareButton.hidden = false;
            status(`Publication conflict: the saved version changed and ${row.status === 'published' ? 'a newer version was published' : 'is still a draft'}. Writes are stopped. Your complete local draft remains here; compare before deciding to discard and reload.`);
        } else {
            status('Publication outcome unknown: the saved version changed. Local edits are retained; reload only after comparing the current definition.');
        }
    } catch (error) {
        status('Publication outcome unknown. Writes are stopped; check status again when access and connection are restored. ' + error.message);
    } finally { reconcileButton.hidden = !publication; reconcileButton.disabled = false; updatePublish(); }
}
$('publish-definition').addEventListener('click', async () => {
    if (saving || publication || conflict || dirty) return;
    if (!confirm('Publish this saved revision? Its questions and scoring rules will be frozen for new assignments.')) return;
    publication = {id: state.id, version: state.version};
    saving = true; updatePublish(); status('Publishing assessment…');
    try { const result = await request(root.dataset.endpoint, { action: 'publish', id: publication.id, expected_version: publication.version }); state.version = result.version; state.status = result.status; publication = null; status('Assessment published. Save further edits as a new draft revision.'); }
    catch (error) {
        serverErrors = error.errors || {};
        if ([400, 401, 403, 404, 419, 422].includes(error.status)) { publication = null; status('Publication was not accepted. Your local content remains here. ' + error.message); renderReview(); }
        else await reconcilePublication();
    }
    finally { saving = false; updatePublish(); }
});
function escapeText(value) { const div = el('div', value); return div.innerHTML.replaceAll('"', '&quot;'); }
const releaseGuard = registerWorkGuard(() => ({ dirty: dirty || conflict, pending: saving || uploadPending, uncertain: !!retryPayload || !!publication }));
const provenance = el('div',null,{id:'definition-provenance',class:'notice'}); provenance.style.overflowWrap = 'anywhere'; $('save-status').before(provenance);
renderSections(); renderList(); renderQuestion(); renderRubric(); updatePublish();
status(dirty ? 'Unsaved changes' : state.status === 'published' ? 'Published revision. Saving creates a new draft.' : 'Draft saved. Not published.');

return () => { lifetime.abort(); observer?.disconnect(); editor?.destroy(); releaseGuard(); };
}
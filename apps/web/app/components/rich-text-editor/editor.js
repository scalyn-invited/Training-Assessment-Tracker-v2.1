import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle, Color } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import styles from './editor.module.css';
import loading from '../ui/loading-state.module.css';

const PrivateImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (node) =>
          /^\/assessments\/media\/[a-f0-9-]{36}$/.test(node.getAttribute('src') || '')
            ? null
            : false,
      },
    ];
  },
});
const safeLink = (value) => {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
// These are document colors, not interface tokens. Keep the server's bounded
// style policy aligned with their hex and browser-normalized rgb equivalents.
export const textColors = [
  ['Dark', '#111827'],
  ['Red', '#dc2626'],
  ['Orange', '#ea580c'],
  ['Yellow', '#ca8a04'],
  ['Green', '#16a34a'],
  ['Blue', '#2563eb'],
  ['Purple', '#9333ea'],
];
export const highlightColors = [
  ['Yellow', '#fef08a'],
  ['Green', '#bbf7d0'],
  ['Blue', '#bfdbfe'],
  ['Pink', '#fbcfe8'],
  ['Orange', '#fed7aa'],
];
export function promptExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, protocols: ['http', 'https', 'mailto'], isAllowedUri: safeLink },
    }),
    PrivateImage.configure({ inline: true, allowBase64: false }),
    TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
  ];
}
export function renderPromptPreview(host, content) {
  host.classList.add(styles.content);
  const editor = new Editor({
    element: host,
    editable: false,
    extensions: promptExtensions(),
    parseOptions: { preserveWhitespace: 'full' },
    content,
  });
  const html = editor.getHTML();
  editor.destroy();
  host.innerHTML = html;
}

const paths = {
  undo: 'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6',
  redo: 'm15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6',
  bold: 'M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z',
  italic: 'M10 4h9M5 20h9M15 4 9 20',
  underline: 'M6 3v8a6 6 0 0 0 12 0V3M4 21h16',
  strike: 'M17 5c-4-4-12-2-10 3 1 2 4 2 5 3m-5 6c4 4 12 2 10-3M3 12h18',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20',
  bullet: 'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1',
  ordered: 'M10 5h11M10 12h11M10 19h11M3 3h1v5M2 8h4M2 12c4-3 5 1 1 4l-1 2h4',
  quote: 'M4 5h6v7H4zm0 7c0 4 1 5 4 6M14 5h6v7h-6zm0 7c0 4 1 5 4 6',
  block: 'M3 3h18v18H3zM8 8l-3 4 3 4m8-8 3 4-3 4m-3-9-2 10',
  divider: 'M3 12h18',
  link: 'm10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  align: 'M3 4h18M3 9h12M3 14h18M3 19h12',
  clear: 'm4 16 9-12 8 6-9 12H8zm4-5 8 6M3 22h18',
  image: 'M3 3h18v18H3zm0 14 6-6 4 4 3-3 5 5M15 7h1',
  type: 'M3 5h18M12 5v15M8 20h8M3 5v3m18-3v3',
  color: 'm6 17 6-14 6 14M8 12h8M3 22h18',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name] || paths.type);
  svg.append(path);
  return svg;
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** Mount only the approved prompt field. The caller retains data and uploads. */
export function mountPromptEditor(
  host,
  { content, labelledBy, onUpdate, onImage, canImage, getBusy = () => '' },
) {
  host.classList.add(styles.root);
  const toolbar = node('div', styles.toolbar);
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Prompt formatting');
  const surface = node('div', `${styles.surface} ${styles.content}`);
  const body = node('div', styles.body);
  const busyOverlay = node('div', styles.busyOverlay);
  busyOverlay.setAttribute('role', 'status');
  busyOverlay.setAttribute('data-testid', 'prompt-image-busy');
  busyOverlay.hidden = true;
  const spinner = node('span', loading.spinner);
  spinner.setAttribute('aria-hidden', 'true');
  const busyLabel = node('p', styles.busyLabel);
  busyOverlay.append(spinner, busyLabel);
  body.append(surface, busyOverlay);
  host.append(toolbar, body);
  const lifetime = new AbortController();
  const controls = [],
    panels = [];
  const editor = new Editor({
    element: surface,
    extensions: promptExtensions(),
    parseOptions: { preserveWhitespace: 'full' },
    content,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        'data-testid': 'prompt-editor',
      },
    },
    onUpdate: ({ editor }) => onUpdate(editor),
  });
  function wholeListSelection() {
    const { doc, selection } = editor.state;
    if (selection.from !== 0 || selection.to !== doc.content.size) return null;
    const first = doc.firstChild;
    if (!first || !['bulletList', 'orderedList'].includes(first.type.name)) return null;
    // StarterKit appends an empty paragraph after lists. Its toggleList whole-
    // document handling only recognizes a sole list, not that trailing node.
    for (let i = 1; i < doc.childCount; i++) {
      const child = doc.child(i);
      if (child.type.name !== 'paragraph' || child.content.size) return null;
    }
    return first;
  }
  const group = () => {
    const group = node('div', styles.group);
    toolbar.append(group);
    return group;
  };
  function action(parent, label, glyph, run, active, can, text = false) {
    const button = node('button', text ? styles.menuButton : styles.iconButton);
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    if (glyph) button.append(icon(glyph));
    if (text) button.append(document.createTextNode(label));
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      run();
      refresh();
    });
    controls.push({ button, active, can });
    parent.append(button);
    return button;
  }
  function menu(parent, label, glyph) {
    const panel = node('div', styles.menu);
    panel.setAttribute('popover', 'auto');
    const trigger = action(parent, label, glyph, () => {
      if (panel.matches(':popover-open')) panel.hidePopover();
      else {
        panels.forEach(({ panel: other }) => {
          if (other.matches(':popover-open')) other.hidePopover();
        });
        panel.showPopover();
        position();
        panel.querySelector('button:not(:disabled), input')?.focus();
      }
    });
    trigger.setAttribute('aria-expanded', 'false');
    panel.id = `prompt-tools-${crypto.randomUUID()}`;
    trigger.setAttribute('aria-controls', panel.id);
    const position = () => {
      const rect = trigger.getBoundingClientRect();
      panel.style.left =
        Math.max(8, Math.min(rect.left, window.innerWidth - panel.offsetWidth - 8)) + 'px';
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      panel.style.maxHeight = Math.max(80, Math.max(below, above)) + 'px';
      panel.style.top =
        (below >= Math.min(panel.scrollHeight, 250) || below >= above
          ? rect.bottom + 4
          : Math.max(8, rect.top - panel.offsetHeight - 4)) + 'px';
    };
    panel.addEventListener('toggle', () =>
      trigger.setAttribute('aria-expanded', String(panel.matches(':popover-open'))),
    );
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        panel.hidePopover();
        trigger.focus();
      }
    });
    window.addEventListener(
      'resize',
      () => {
        if (panel.matches(':popover-open')) position();
      },
      { signal: lifetime.signal },
    );
    host.append(panel);
    panels.push({ panel, trigger });
    return panel;
  }
  const command = (parent, label, glyph, name, active, args, text = false) =>
    action(
      parent,
      label,
      glyph,
      () => {
        const list =
          ['toggleBulletList', 'toggleOrderedList'].includes(name) && wholeListSelection();
        if (list) editor.commands.setTextSelection({ from: 3, to: list.nodeSize - 3 });
        editor
          .chain()
          .focus()
          [name](...(args === undefined ? [] : [args]))
          .run();
        if (text) parent.hidePopover();
      },
      active,
      () =>
        (['toggleBulletList', 'toggleOrderedList'].includes(name) && !!wholeListSelection()) ||
        editor.can()[name](...(args === undefined ? [] : [args])),
      text,
    );
  const history = group();
  command(history, 'Undo', 'undo', 'undo');
  command(history, 'Redo', 'redo', 'redo');
  const textStyle = menu(group(), 'Text style', 'type');
  command(
    textStyle,
    'Paragraph',
    null,
    'setParagraph',
    () => editor.isActive('paragraph'),
    undefined,
    true,
  );
  [1, 2, 3].forEach((level) =>
    command(
      textStyle,
      `Heading ${level}`,
      null,
      'toggleHeading',
      () => editor.isActive('heading', { level }),
      { level },
      true,
    ),
  );
  const marks = group();
  [
    ['Bold', 'bold', 'toggleBold'],
    ['Italic', 'italic', 'toggleItalic'],
    ['Underline', 'underline', 'toggleUnderline'],
    ['Strikethrough', 'strike', 'toggleStrike'],
    ['Inline code', 'code', 'toggleCode'],
  ].forEach(([label, mark, cmd]) => command(marks, label, mark, cmd, () => editor.isActive(mark)));
  const colors = menu(group(), 'Text colour and highlight', 'color');
  colors.append(node('p', styles.menuLabel, 'Text colour'));
  command(colors, 'Default text colour', null, 'unsetColor', undefined, undefined, true);
  textColors.forEach(([name, color]) =>
    command(
      colors,
      `${name} text`,
      null,
      'setColor',
      () => editor.isActive('textStyle', { color }),
      color,
      true,
    ),
  );
  colors.append(node('p', styles.menuLabel, 'Highlight'));
  command(colors, 'Remove highlight', null, 'unsetHighlight', undefined, undefined, true);
  highlightColors.forEach(([name, color]) =>
    command(
      colors,
      `${name} highlight`,
      null,
      'setHighlight',
      () => editor.isActive('highlight', { color }),
      { color },
      true,
    ),
  );
  const lists = group();
  [
    ['Bullet list', 'bullet', 'toggleBulletList', 'bulletList'],
    ['Numbered list', 'ordered', 'toggleOrderedList', 'orderedList'],
    ['Quote', 'quote', 'toggleBlockquote', 'blockquote'],
  ].forEach(([label, glyph, cmd, format]) =>
    command(
      lists,
      label,
      glyph,
      cmd,
      () => editor.isActive(format) || wholeListSelection()?.type.name === format,
    ),
  );
  const inserts = group();
  const links = menu(inserts, 'Insert or edit link', 'link');
  const label = node('label', styles.menuLabel, 'Link URL');
  const input = node('input', styles.linkInput);
  input.id = `prompt-link-${crypto.randomUUID()}`;
  input.type = 'url';
  label.htmlFor = input.id;
  links.append(label, input);
  links.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') {
      input.value = editor.getAttributes('link').href || '';
      input.setCustomValidity('');
    }
  });
  action(
    links,
    'Apply link',
    null,
    () => {
      if (!safeLink(input.value)) {
        input.setCustomValidity('Use an https, http or mailto link.');
        input.reportValidity();
        return;
      }
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: new URL(input.value).href })
        .run();
      links.hidePopover();
    },
    undefined,
    undefined,
    true,
  );
  input.addEventListener('input', () => input.setCustomValidity(''));
  command(links, 'Remove link', null, 'unsetLink', undefined, undefined, true);
  command(inserts, 'Code block', 'block', 'toggleCodeBlock', () => editor.isActive('codeBlock'));
  command(inserts, 'Divider', 'divider', 'setHorizontalRule');
  const table = menu(inserts, 'Table', 'table');
  command(
    table,
    'Insert table',
    null,
    'insertTable',
    undefined,
    { rows: 3, cols: 3, withHeaderRow: true },
    true,
  );
  [
    ['Add row above', 'addRowBefore'],
    ['Add row below', 'addRowAfter'],
    ['Delete row', 'deleteRow'],
    ['Add column left', 'addColumnBefore'],
    ['Add column right', 'addColumnAfter'],
    ['Delete column', 'deleteColumn'],
    ['Header row', 'toggleHeaderRow'],
    ['Delete table', 'deleteTable'],
  ].forEach(([label, cmd]) => command(table, label, null, cmd, undefined, undefined, true));
  const layout = group(),
    align = menu(layout, 'Alignment', 'align');
  [
    ['left', 'Align left'],
    ['center', 'Align centre'],
    ['right', 'Align right'],
    ['justify', 'Justify'],
  ].forEach(([value, label]) =>
    command(
      align,
      label,
      null,
      'setTextAlign',
      () => editor.isActive({ textAlign: value }),
      value,
      true,
    ),
  );
  action(layout, 'Clear formatting', 'clear', () =>
    editor.chain().focus().clearNodes().unsetAllMarks().unsetTextAlign().run(),
  );
  const images = group();
  action(images, 'Insert image', 'image', onImage, undefined, canImage);
  const altPanel = menu(images, 'Edit image alt text', 'type');
  const altTrigger = panels.at(-1).trigger;
  controls.find(({ button }) => button === altTrigger).can = () => editor.isActive('image');
  const altLabel = node('label', styles.menuLabel, 'Image alt text');
  const altInput = node('input', styles.linkInput);
  altInput.id = `prompt-alt-${crypto.randomUUID()}`;
  altInput.maxLength = 500;
  altLabel.htmlFor = altInput.id;
  altPanel.append(altLabel, altInput);
  altPanel.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') altInput.value = editor.getAttributes('image').alt || '';
  });
  action(
    altPanel,
    'Apply image alt text',
    null,
    () => {
      if (!editor.isActive('image')) return;
      editor.chain().focus().updateAttributes('image', { alt: altInput.value }).run();
      altPanel.hidePopover();
    },
    undefined,
    () => editor.isActive('image'),
    true,
  );
  altInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      altPanel.querySelector('button').click();
    }
  });
  function refresh() {
    const message = getBusy();
    const busy = !!message;
    if (editor.isEditable === busy) editor.setEditable(!busy, false);
    surface.inert = busy;
    surface.setAttribute('aria-busy', String(busy));
    busyOverlay.hidden = !busy;
    if (busyLabel.textContent !== message) busyLabel.textContent = message;
    panels.forEach(({ panel }) => {
      if (busy && panel.matches(':popover-open')) panel.hidePopover();
      panel.inert = busy;
    });
    controls.forEach(({ button, active, can }) => {
      button.disabled = busy || (can ? !can() : false);
      if (active) button.setAttribute('aria-pressed', String(active()));
    });
  }
  toolbar.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...toolbar.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  });
  editor.on('transaction', refresh);
  editor.on('imageAvailability', refresh);
  refresh();
  editor.on('destroy', () => {
    lifetime.abort();
    panels.forEach(({ panel }) => panel.remove());
  });
  return editor;
}

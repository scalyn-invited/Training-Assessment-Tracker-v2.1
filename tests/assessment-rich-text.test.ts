import { describe, expect, it } from 'vitest';
import { draft, mediaIds, sanitize } from '../packages/domain/src/assessment-content.js';

const parse = (html: string) =>
  draft({
    title: 'Rich prompt',
    questions: [{ id: 'q1', prompt: '', prompt_html: html }],
    rubric: { threshold: null, criteria: [] },
  });

describe('assessment prompt rich text', () => {
  it('uses canonical HTML text rather than editor-specific separators for prompt limits', () => {
    const html = `<table><tbody><tr><td><p>${'a'.repeat(1999)}</p></td><td><p>${'b'.repeat(1999)}</p></td></tr></tbody></table>`;
    const input = {
      title: 'Table prompt',
      questions: [{ id: 'q1', prompt: 'x'.repeat(4008), prompt_html: html }],
      rubric: { threshold: null, criteria: [] },
    };
    expect(draft(input).questions[0].prompt).toHaveLength(3999);
    expect(() =>
      draft({ ...input, questions: [{ id: 'q1', prompt: 'x'.repeat(4001) }] }),
    ).toThrow();
    expect(() =>
      draft({
        ...input,
        questions: [{ id: 'q1', prompt: '', prompt_html: `<p>${'x'.repeat(4001)}</p>` }],
      }),
    ).toThrow('4,000');
  });
  it('retains URL safety and the existing private image path boundary', () => {
    const id = '12345678-1234-1234-1234-123456789abc';
    const path = `/assessments/media/${id}`;
    for (const url of [
      'javascript:alert(1)',
      'java&#x73;cript:alert(1)',
      'data:text/html,bad',
      'vbscript:bad',
    ]) {
      expect(sanitize(`<a href="${url}" onclick="evil()">Link</a>`)).toBe('<a>Link</a>');
    }
    for (const url of [
      'https://example.invalid',
      'http://example.invalid',
      'mailto:test@example.invalid',
    ]) {
      expect(sanitize(`<a href="${url}" title="Link">Link</a>`)).toContain(`href="${url}"`);
    }
    for (const src of [
      'https://example.invalid/image.png',
      '//example.invalid/image.png',
      'data:image/png;base64,AA',
      `${path}?x=1`,
      `${path}/extra`,
      '/other/image',
    ]) {
      expect(sanitize(`<img src="${src}">`)).toBe('');
    }
    const value = parse(
      `<h2>Image</h2><img src="${path}" alt="Diagram" onerror="evil()" style="display:none"><img src="${path}">`,
    );
    expect(value.questions[0].prompt_html).toBe(
      `<h2>Image</h2><img src="${path}" alt="Diagram" /><img src="${path}" />`,
    );
    expect(mediaIds(value.questions)).toEqual([id]);
  });
  it('preserves prompt limits after deriving text and before sanitizing HTML', () => {
    expect(parse(`<h1>${'x'.repeat(4000)}</h1>`).questions[0].prompt).toHaveLength(4000);
    expect(() => parse(`<pre><code>${'x'.repeat(4001)}</code></pre>`)).toThrow('4,000');
    expect(() =>
      parse(`<table><tr><td>${'x'.repeat(2000)}</td><td>${'x'.repeat(2000)}</td></tr></table>`),
    ).toThrow('4,000');
    expect(() => parse(`<p>${' '.repeat(50000)}</p>`)).toThrow();
  });
  it('derives meaningful plain text with block, rule and table cell boundaries', () => {
    const html =
      '<h1>Title</h1><h2>Section</h2><h3>Detail</h3><blockquote>Quote</blockquote><pre><code>one\ntwo</code></pre>Before<hr />After<table><thead><tr><th>Name</th><th>Score</th></tr></thead><tbody><tr><td>Ada</td><td>10</td></tr><tr><td><p>Lin</p></td><td><p>20</p></td></tr></tbody></table><p>End &amp; done</p>';
    const value = parse(html);
    expect(value.questions[0].prompt).toBe(
      'Title\nSection\nDetail\nQuote\none\ntwo\nBefore\nAfter\nName\tScore\nAda\t10\nLin\t20\nEnd & done',
    );
    expect(parse(value.questions[0].prompt_html!).questions).toEqual(value.questions);
  });
  it('allows only the prompt palette and block alignments, including browser RGB serialization', () => {
    for (const align of ['left', 'center', 'right', 'justify']) {
      for (const tag of ['p', 'h1', 'h2', 'h3']) {
        expect(sanitize(`<${tag} style="text-align: ${align}; position:fixed">Text</${tag}>`)).toBe(
          `<${tag} style="text-align:${align}">Text</${tag}>`,
        );
      }
    }
    for (const color of [
      '#111827',
      '#dc2626',
      '#ea580c',
      '#ca8a04',
      '#16a34a',
      '#2563eb',
      '#9333ea',
      'rgb(37, 99, 235)',
    ]) {
      expect(sanitize(`<span style="color: ${color}">Text</span>`)).toBe(
        `<span style="color:${color}">Text</span>`,
      );
    }
    for (const color of [
      '#fef08a',
      '#bbf7d0',
      '#bfdbfe',
      '#fbcfe8',
      '#fed7aa',
      'rgb(254, 240, 138)',
    ]) {
      expect(
        sanitize(
          `<mark style="background-color: ${color}; color:inherit" data-color="${color}">Text</mark>`,
        ),
      ).toBe(`<mark style="background-color:${color}">Text</mark>`);
    }
    for (const style of [
      'color:transparent',
      'color:#ffffff',
      'color:var(--evil)',
      'color:expression(evil())',
      'color:url(https://evil.invalid)',
      'background-image:url(https://evil.invalid)',
      'text-align:inherit',
      'display:none',
      'color:#2563eb !important',
    ]) {
      expect(sanitize(`<span style="${style}" onclick="evil()">Text</span>`)).toBe(
        '<span>Text</span>',
      );
    }
    expect(
      sanitize(
        '<p style="color:#2563eb;background-color:#fef08a">Text</p><span style="text-align:center;background-color:#fef08a">Text</span>',
      ),
    ).toBe('<p>Text</p><span>Text</span>');
  });
  it('preserves tables with only bounded positive integer cell spans', () => {
    const html =
      '<table><thead><tr><th colspan="2" rowspan="1">Heading</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>';
    expect(sanitize(html)).toBe(html);
    for (const span of ['0', '-1', '101', '999999999', '1.5', '2x', '1e2']) {
      expect(
        sanitize(
          `<table><tr><td colspan="${span}" rowspan="${span}" style="width:9999px" onclick="evil()" colwidth="99">A</td></tr></table>`,
        ),
      ).toBe('<table><tr><td>A</td></tr></table>');
    }
    expect(sanitize('<table><tr><td colspan="100" rowspan="100">A</td></tr></table>')).toContain(
      'colspan="100" rowspan="100"',
    );
  });
  it('preserves approved structural and inline formatting without executable attributes', () => {
    const html =
      '<h1>Title</h1><h2>Section</h2><h3>Detail</h3><p><u>Underline</u> <s>Strike</s> <code>x &lt; 2</code></p><blockquote><p>Quote</p></blockquote><pre><code>line one\nline two</code></pre><hr />';
    expect(sanitize(html)).toBe(html);
    expect(
      sanitize(
        '<h1 onclick="evil()" id="bad">Title</h1><pre class="bad"><code onmouseover="evil()">code</code></pre><h4>Other</h4><script>evil()</script>',
      ),
    ).toBe('<h1>Title</h1><pre><code>code</code></pre>Other');
  });
});

import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { sanitize } from '../../packages/domain/src/assessment-content.js';

test('image busy state locks the prompt without losing content and restores controls', async ({
  page,
}, info) => {
  const result = await build({
    stdin: {
      contents: `import {mountPromptEditor} from './apps/web/app/components/rich-text-editor/editor.js';import tokens from './apps/web/app/components/ui/tokens.module.css';document.body.className=tokens.theme;window.busy='';window.editor=mountPromptEditor(document.getElementById('editor'),{content:'<p>Preserved prompt</p>',labelledBy:'label',onUpdate:()=>{},onImage:()=>{},canImage:()=>true,getBusy:()=>window.busy});window.setBusy=(value)=>{window.busy=value;window.editor.emit('imageAvailability');};`,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/prompt-rendering',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  await page.route('http://localhost/prompt-busy', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en" data-theme="dark"><body><label id="label">Question prompt</label><div id="editor"></div></body></html>',
    }),
  );
  await page.goto('http://localhost/prompt-busy');
  await page.addStyleTag({ content: await readFile('apps/web/app/globals.css', 'utf8') });
  await page.addStyleTag({
    content: result.outputFiles
      .filter((f) => f.path.endsWith('.css'))
      .map((f) => f.text)
      .join('\n'),
  });
  await page.addScriptTag({
    content: result.outputFiles.find((f) => f.path.endsWith('.js'))!.text,
  });
  const prompt = page.getByTestId('prompt-editor');
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.evaluate(() => (window as any).setBusy('Uploading image…'));
  await expect(prompt).toHaveAttribute('contenteditable', 'false');
  await expect(page.getByRole('button', { name: 'Insert table', exact: true })).toBeHidden();
  await expect(page.getByRole('toolbar').locator('button:enabled')).toHaveCount(0);
  const overlay = page.getByTestId('prompt-image-busy');
  await expect(overlay).toContainText('Uploading image…');
  await expect(overlay.locator('[aria-hidden="true"]')).not.toHaveCSS('animation-name', 'none');
  await page.keyboard.type('unwanted edit');
  await expect(prompt).toHaveText('Preserved prompt');
  await page.evaluate(() => (window as any).setBusy('Checking image…'));
  await expect(overlay).toContainText('Checking image…');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(overlay).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`busy-${width}.png`), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(overlay.locator('[aria-hidden="true"]')).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => (window as any).setBusy(''));
  await expect(overlay).toBeHidden();
  await expect(prompt).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toBeEnabled();
  await prompt.fill('Editing restored');
  await expect(prompt).toHaveText('Editing restored');
});

test('wide tables scroll inside the serialized builder preview', async ({ page }) => {
  const html =
    '<table><tbody><tr>' +
    Array.from({ length: 20 }, (_, i) => `<td><p>Column ${i}</p></td>`).join('') +
    '</tr></tbody></table>';
  const result = await build({
    stdin: {
      contents: `import {renderPromptPreview} from './apps/web/app/components/rich-text-editor/editor.js';import tokens from './apps/web/app/components/ui/tokens.module.css';document.body.className=tokens.theme;renderPromptPreview(document.getElementById('preview'),${JSON.stringify(html)});`,
      resolveDir: process.cwd(),
      loader: 'js',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/prompt-rendering',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.setContent('<!doctype html><html><body><div id="preview"></div></body></html>');
  await page.addStyleTag({ content: await readFile('apps/web/app/globals.css', 'utf8') });
  await page.addStyleTag({
    content: result.outputFiles
      .filter((f) => f.path.endsWith('.css'))
      .map((f) => f.text)
      .join('\n'),
  });
  await page.addScriptTag({
    content: result.outputFiles.find((f) => f.path.endsWith('.js'))!.text,
  });
  await expect(page.locator('#preview td')).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#preview .tableWrapper')).toHaveCSS('overflow-x', 'auto');
});

test('saved rich prompts remain readable in learner and history rendering', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const prompt = sanitize(
    '<h2>Code and evidence</h2><p><u>Read</u> <s>old</s> <mark style="background-color:#fef08a">important</mark></p><ol><li>First</li><li>Second</li></ol><pre><code>' +
      'long_code_'.repeat(40) +
      '</code></pre><table><tbody><tr><th>Evidence</th><th>Result</th></tr><tr><td>Sample</td><td>Verified</td></tr></tbody></table>',
  );
  const result = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';import {ResponseQuestions} from './apps/web/app/components/response-questions';import tokens from './apps/web/app/components/ui/tokens.module.css';document.body.className=tokens.theme;createRoot(document.getElementById('root')).render(<ResponseQuestions questions={[{id:'rich',type:'open_response',prompt:'Code and evidence',prompt_html:${JSON.stringify(prompt)},choices:[]}]} answers={{}}/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/prompt-rendering',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  const base = await readFile('apps/web/app/globals.css', 'utf8');
  await page.setContent(
    '<!doctype html><html lang="en" data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Assessment</h1><main id="root"></main></body></html>',
  );
  await page.addStyleTag({
    content:
      base +
      result.outputFiles
        .filter((f) => f.path.endsWith('.css'))
        .map((f) => f.text)
        .join('\n'),
  });
  await page.addScriptTag({
    content: result.outputFiles.find((f) => f.path.endsWith('.js'))!.text,
  });
  await page.waitForTimeout(100);
  expect(errors).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Code and evidence' })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.assessment-prompt pre')).toHaveCSS('overflow-x', 'auto');
    await expect(page.locator('.assessment-prompt th').first()).toHaveCSS(
      'border-top-style',
      'solid',
    );
    await page.screenshot({ path: info.outputPath(`learner-${width}.png`), fullPage: true });
  }
});

import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

test('proposal dialogs retain work, guard discard and never focus late hidden previews', async ({
  page,
}) => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import {mountProposalDialogs} from './apps/web/app/components/assessment-builder/proposal-dialogs';
import {mountJsonProposalImport} from './apps/web/app/components/assessment-builder/proposal-preview.js';
import {mountTopicGeneration} from './apps/web/app/components/assessment-builder/topic-generation.js';
import {styleBuilderElement,styleBuilderRoot} from './apps/web/app/components/assessment-builder/presentation';
import tokens from './apps/web/app/components/ui/tokens.module.css';
document.body.className=tokens.theme;
const root=document.getElementById('root');styleBuilderRoot(root);
const el=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);styleBuilderElement(e);return e;};
const button=(text,fn)=>{const b=el('button',text,{type:'button'});b.addEventListener('click',fn);return b;};
const trigger=button('Import questions',()=>{});root.append(trigger);const host=el('section',null,{class:'proposal-import'});
window.requests=0;window.appended=0;
window.proposal={questions:[{reference:'one',type:'open_response',prompt:'Review fixture',choices:[],suggested_answer:'Private preview answer'}],rubric:null};
const controller=mountJsonProposalImport(host,{el,button,request:()=>{window.requests++;return new Promise((resolve,reject)=>{window.release=()=>resolve(window.proposal);window.fail=()=>reject(Error('Fixture validation outage'));});},append:()=>{window.appended++;},replaceRubric:()=>{}});
const generationTrigger=button('Generate questions',()=>{});root.append(generationTrigger);const generationHost=el('section',null,{class:'proposal-import'});
const generation=mountTopicGeneration(generationHost,{el,button,request:async()=>{if(window.failGeneration)throw Error('Fixture network error');return {id:'test-receipt',status:'complete'};},append:()=>{},replaceRubric:()=>{}});
const dialogs=mountProposalDialogs(root,[{id:'import',title:'Import questions',host,trigger,help:'Closing keeps your file and review.'},{id:'generate',title:'Generate questions',host:generationHost,trigger:generationTrigger,help:'Closing does not cancel generation.'}]);
window.dispose=()=>{controller.dispose();generation.dispose();dialogs.dispose();};`,
    },
    bundle: true,
    write: false,
    outdir: '.runtime/modal-components',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  await page.route('http://localhost/modal', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://localhost/modal');
  await page.addStyleTag({ content: await readFile('apps/web/app/globals.css', 'utf8') });
  await page.addStyleTag({
    content: bundle.outputFiles
      .filter((f) => f.path.endsWith('.css'))
      .map((f) => f.text)
      .join('\n'),
  });
  await page.addScriptTag({
    content: bundle.outputFiles.find((f) => f.path.endsWith('.js'))!.text,
  });
  const trigger = page.getByRole('button', { name: 'Import questions', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Import questions', exact: true });
  await trigger.click();
  await expect(
    dialog.getByRole('heading', { name: 'Import questions', exact: true }),
  ).toBeFocused();
  const file = page.getByLabel('JSON proposal file');
  await file.setInputFiles({
    name: 'one.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Validating JSON…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.evaluate(() => (window as any).release());
  await expect(trigger).toBeFocused();
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  await page.getByLabel('Select proposal 1').uncheck();
  await page.keyboard.press('Escape');
  await trigger.click();
  await expect(page.getByLabel('Select proposal 1')).not.toBeChecked();
  page.once('dialog', (d) => d.dismiss());
  await file.setInputFiles({
    name: 'replacement.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  expect(await file.evaluate((e) => (e as HTMLInputElement).files?.[0]?.name)).toBe('one.json');
  await expect(page.getByLabel('Select proposal 1')).not.toBeChecked();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  expect(await page.evaluate(() => (window as any).requests)).toBe(1);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await page.evaluate(() => (window as any).fail());
  await expect(
    page.getByRole('alert').filter({ hasText: 'Fixture validation outage' }),
  ).toBeVisible();
  await expect(page.getByLabel('Select proposal 1')).not.toBeChecked();
  expect(await file.evaluate((e) => (e as HTMLInputElement).files?.[0]?.name)).toBe('one.json');
  let confirmation = '';
  page.once('dialog', async (d) => {
    confirmation = d.message();
    await d.dismiss();
  });
  await page.getByRole('button', { name: 'Clear JSON import', exact: true }).click();
  expect(confirmation).toContain('Discard');
  await expect(page.getByLabel('Select proposal 1')).not.toBeChecked();
  expect(await file.evaluate((e) => (e as HTMLInputElement).files?.[0]?.name)).toBe('one.json');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Clear JSON import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).appended)).toBe(0);
  await page.evaluate(() =>
    document.getElementById('root')!.dispatchEvent(new Event('assessment-builder:detach')),
  );
  await expect(dialog).toBeHidden();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Generate questions', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  const generationDialog = page.getByRole('dialog', { name: 'Generate questions', exact: true });
  expect(
    await generationDialog.getByRole('button', { name: 'Close', exact: true }).evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    }),
  ).toBe(1);
  await page.getByRole('button', { name: 'Generate synthetic proposals', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Generation complete', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Refresh generation status', exact: true }),
  ).toBeEnabled();
  let generationConfirmation = '';
  page.once('dialog', async (d) => {
    generationConfirmation = d.message();
    await d.dismiss();
  });
  await page
    .getByRole('button', { name: 'Cancel generation / clear preview', exact: true })
    .click();
  expect(generationConfirmation).toContain('discard');
  await expect(
    page.getByRole('button', { name: 'Refresh generation status', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Generate questions', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh generation status', exact: true }),
  ).toBeEnabled();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Cancel generation / clear preview', exact: true })
    .click();
  await page.evaluate(() => {
    (window as any).failGeneration = true;
  });
  await page.getByRole('button', { name: 'Generate synthetic proposals', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Fixture network error');
  await expect(page.getByRole('status')).not.toContainText('Submitting request…');
  await page.keyboard.press('Escape');
  await trigger.click();
  await file.setInputFiles({
    name: 'late.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{}'),
  });
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await page.evaluate(() => (window as any).dispose());
  await page.evaluate(() => (window as any).release());
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).appended)).toBe(0);
});

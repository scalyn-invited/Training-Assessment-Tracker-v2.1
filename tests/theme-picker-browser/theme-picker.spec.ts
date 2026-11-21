import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { themes } from '../../packages/domain/src/theme.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

// Production shell, picker and CSS; isolated synthetic transport, no app/database.
let bundle: string, css: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';
        import {useState,useEffect} from 'react';
        import {ApplicationShell} from './apps/web/app/components/application-shell';
        import {themes} from './packages/domain/src/theme';
        function Fixture(){
          const [selected,setSelected]=useState(localStorage.getItem('theme-test')||'light');
          useEffect(()=>{const refresh=()=>setSelected(localStorage.getItem('theme-test')||'light');window.addEventListener('brandingchanged',refresh);return()=>window.removeEventListener('brandingchanged',refresh)},[]);
          useEffect(()=>{document.documentElement.dataset.theme=selected},[selected]);
          return <ApplicationShell themeClientId={location.search.includes('client')?'synthetic-client':undefined} context={{user:{global_admin:true},csrf:'synthetic'}} pathname='/platform' platform activePage='overview' navigationBusy={false} name='Synthetic user' brand={{displayName:'Scalyn',appName:'Assessment Training Tracker',mode:'cerebru',selectedTheme:selected,logo:null,palettes:{},platformPalettes:{},themes}} storageKey='theme-test' reload={()=>{}} logout={()=>{}} signingOut={false}><h1>Theme picker fixture</h1><button>Outside action</button></ApplicationShell>
        }createRoot(document.getElementById('root')).render(<Fixture/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/theme-picker-bundle',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  bundle = output.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
  css = await readFile('apps/web/app/globals.css', 'utf8');
  css += output.outputFiles
    .filter((file) => file.path.endsWith('.css'))
    .map((file) => file.text)
    .join('\n');
});
async function mount(page: Page, query = '') {
  await page.route('http://theme.invalid/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Theme fixture</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://theme.invalid/' + query);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
}

test('opening theme options does not change sidebar scroll height', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await mount(page);
  const sidebar = page.getByRole('complementary', { name: 'Platform workspace' });
  const before = await sidebar.evaluate((el) => el.scrollHeight);
  await sidebar.locator('.theme-picker').click();
  await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();
  expect(await sidebar.evaluate((el) => el.scrollHeight)).toBe(before);
  await expect(page.locator('.theme-options:popover-open')).toBeVisible();
  await page.screenshot({ path: info.outputPath('desktop.png') });
  await page.setViewportSize({ width: 900, height: 460 });
  const bounds = await page.getByRole('group', { name: 'Colour theme' }).boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(460);
  await page.screenshot({ path: info.outputPath('resized.png') });
});

test('pointer dismissal and trigger toggle retain intentional focus', async ({ page }) => {
  await mount(page);
  const trigger = page.getByRole('button', { name: 'Theme Light', exact: true });
  await trigger.click();
  await trigger.click();
  await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole('button', { name: 'Outside action' }).click();
  await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Outside action' })).toBeFocused();
  await trigger.click();
  await page.getByRole('heading', { name: 'Theme picker fixture' }).click();
  await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('all existing themes, selected state and local default reset persist', async ({ page }) => {
  await mount(page);
  const trigger = page.getByRole('complementary').getByRole('button', { name: /^Theme(?: |$)/ });
  for (const [value, label] of Object.entries(themes)) {
    await trigger.click();
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('theme-test'))).toBe(value);
    await trigger.click();
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
  }
  await mount(page);
  await trigger.click();
  await page.getByRole('button', { name: 'Use platform default' }).click();
  expect(await page.evaluate(() => localStorage.getItem('theme-test'))).toBeNull();
});

for (const viewport of [
  { width: 375, height: 420 },
  { width: 320, height: 568 },
  { width: 1280, height: 300 },
])
  test(`viewport bounds and independent scrolling ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await mount(page);
    const mobile = viewport.width < 800;
    if (mobile) await page.getByRole('button', { name: 'Personal settings' }).click();
    const owner = mobile
      ? page.getByRole('dialog', { name: 'Personal settings' })
      : page.getByRole('complementary');
    const trigger = owner.getByRole('button', { name: /^Theme(?: |$)/ });
    await trigger.scrollIntoViewIfNeeded();
    const before = await owner.evaluate((el) => el.scrollHeight);
    await trigger.click();
    const panel = page.getByRole('group', { name: 'Colour theme' });
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await owner.evaluate((el) => el.scrollHeight)).toBe(before);
    expect(await panel.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
    await page.keyboard.press('End');
    await expect(panel.getByRole('button', { name: 'Use platform default' })).toBeInViewport();
    await page.screenshot({ path: info.outputPath('constrained.png') });
    if (!mobile) {
      expect(
        await panel.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0),
      ).toBe(true);
      expect(
        await owner.evaluate((el) => el.scrollHeight > el.clientHeight && el.scrollTop > 0),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    if (mobile) await expect(owner).toBeVisible();
    else expect(await owner.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
  });

test('client pending and failed saves stay in the overlay with versioned payload and retry', async ({
  page,
}) => {
  await mount(page, '?client');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const payloads: unknown[] = [];
  await page.route('**/api/branding/preference', async (route) => {
    payloads.push(route.request().postDataJSON());
    await pending;
    await route.fulfill({
      status: 409,
      json: { message: 'Theme changed elsewhere. Reload appearance and try again.' },
    });
  });
  await page.getByRole('button', { name: 'Theme Light', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const panel = page.getByRole('group', { name: 'Colour theme' });
  await expect(panel.getByText('Saving theme...')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Light', exact: true })).toBeDisabled();
  release();
  await expect(panel.getByRole('alert')).toContainText('Theme changed elsewhere');
  await panel.getByRole('button', { name: 'Reload appearance' }).click();
  expect(payloads).toEqual([
    { csrf: 'synthetic', clientId: 'synthetic-client', version: 0, theme: 'dark' },
  ]);
  expect(await page.evaluate(() => localStorage.getItem('theme-test'))).toBeNull();
  await page.route('**/api/branding/preference', (route) => route.fulfill({ json: {} }));
  await panel.getByRole('button', { name: 'Use client default' }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Theme Light', exact: true })).toBeFocused();
});

test('open picker has no axe WCAG A/AA violations', async ({ page }) => {
  await mount(page);
  await page.getByRole('button', { name: 'Theme Light', exact: true }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.theme-picker')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('keyboard arrows, Home/End, Escape and Tab dismiss without trapping focus', async ({
  page,
}) => {
  await mount(page);
  const trigger = page.getByRole('button', { name: 'Theme Light', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Use platform default' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+Tab');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
});

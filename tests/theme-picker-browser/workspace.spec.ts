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
          return <ApplicationShell themeClientId={location.search.includes('client')?'synthetic-client':undefined} context={{user:{global_admin:!location.search.includes('member')},canAdmin:location.search.includes('admin'),csrf:'synthetic'}} pathname='/platform' platform activePage='overview' navigationBusy={false} name='Synthetic user' brand={{displayName:'Scalyn',appName:'Assessment Training Tracker',mode:location.search.includes('white')?'white-label':'cerebru',selectedTheme:selected,logo:null,palettes:{},platformPalettes:{},themes}} storageKey='theme-test' reload={()=>{}} logout={()=>{}} signingOut={false}><h1>Theme picker fixture</h1><button>Outside action</button></ApplicationShell>
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

test('workspace opening preserves sidebar and navigation geometry', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 460 });
  await mount(page);
  const sidebar = page.getByRole('complementary');
  const geometry = () =>
    sidebar.evaluate((el) => ({
      height: el.scrollHeight,
      width: el.scrollWidth,
      nav: el.querySelector('[aria-label="Main navigation"]')!.getBoundingClientRect().y,
    }));
  const before = await geometry();
  await sidebar.locator('summary,button').filter({ hasText: 'Workspace' }).first().click();
  await expect(page.getByRole('navigation', { name: 'Choose workspace' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('workspace.png') });
  expect(await geometry()).toEqual(before);
});

for (const size of [
  { width: 1280, height: 600 },
  { width: 1280, height: 300 },
  { width: 320, height: 300 },
  { width: 390, height: 420 },
  { width: 800, height: 300 },
]) {
  test(`workspace keyboard, bounds and focus ${size.width}x${size.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(size);
    await mount(page);
    const sidebar = page.getByRole('complementary');
    const trigger = sidebar.getByRole('button', { name: 'Workspace Platform administration' });
    const panel = page.getByRole('navigation', { name: 'Choose workspace' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      panel.getByRole('link', { name: 'Learning workspace', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(panel.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(trigger).toBeFocused();
    await expect(panel).not.toBeVisible();
    await page.keyboard.press('Space');
    const box = await panel.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(panel.getByRole('link').last()).toBeInViewport();
    expect(
      (
        await new AxeBuilder({ page })
          .include('[aria-label="Choose workspace"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({ path: info.outputPath('workspace.png') });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await trigger.click();
    await expect(panel).not.toBeVisible();
    await trigger.click();
    await page.getByRole('button', { name: 'Outside action' }).click();
    await expect(panel).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Outside action' })).toBeFocused();
  });
}
for (const query of ['', '?member', '?member&admin', '?white', '?member&white']) {
  test(`workspace permission and destination contract ${query}`, async ({ page }) => {
    await mount(page, query);
    await page.getByRole('button', { name: 'Workspace Platform administration' }).click();
    const links = page.getByRole('navigation', { name: 'Choose workspace' }).getByRole('link');
    const expected = [
      ...(!query.includes('member') ? ['/platform'] : []),
      '/dashboard',
      '/clients',
      ...(!query.includes('member') || query.includes('admin') ? ['/accounts'] : []),
      ...(!query.includes('white') ? ['https://opsbrain-eosin.vercel.app/home'] : []),
    ];
    expect(await links.evaluateAll((els) => els.map((el) => el.getAttribute('href')))).toEqual(
      expected,
    );
    if (!query.includes('member'))
      await expect(links.first()).toHaveAttribute('aria-current', 'page');
  });
}
test('workspace and theme popovers dismiss each other without stealing focus', async ({ page }) => {
  await mount(page);
  const workspace = page.getByRole('button', { name: 'Workspace Platform administration' });
  const theme = page.getByRole('complementary').getByRole('button', { name: /^Theme(?: |$)/ });
  await workspace.click();
  await theme.click();
  await expect(page.getByRole('navigation', { name: 'Choose workspace' })).not.toBeVisible();
  await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();
  await workspace.click();
  await expect(page.getByRole('group', { name: 'Colour theme' })).not.toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Choose workspace' }).getByRole('link').first(),
  ).toBeFocused();
});

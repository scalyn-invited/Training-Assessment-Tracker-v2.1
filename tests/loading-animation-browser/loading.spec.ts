import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
let bundle: string, css: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';
      import {useState} from 'react';
      import {Pending} from './apps/web/app/components/auth-ui';
      import {GuestPending} from './apps/web/app/components/guest-shell';
      function Fixture(){const [error,setError]=useState('');return <main><button onClick={()=>setError('Session unavailable. Try loading again.')}>Fail request</button><Pending error={error} retry={()=>setError('')}/></main>}
      createRoot(document.getElementById('root')).render(location.pathname === '/guest' ? <GuestPending retry={()=>{}}/> : <Fixture/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/loading-bundle',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  bundle = output.outputFiles.find((f) => f.path.endsWith('.js'))!.text;
  css = await readFile('apps/web/app/globals.css', 'utf8');
  css += output.outputFiles
    .filter((f) => f.path.endsWith('.css'))
    .map((f) => f.text)
    .join('\n');
});
async function mount(page: Page, path = '/') {
  await page.route('http://loading.invalid/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Loading fixture</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://loading.invalid' + path);
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:00Z'));
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
}
test('session wait is textless initially with stable accessible status and context after three seconds', async ({
  page,
}) => {
  await mount(page);
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  const status = page.getByRole('status');
  await expect(status).toHaveAccessibleName('Loading your session');
  await expect(status).toHaveText('Loading your session');
  await expect(page.locator('[data-loading-context]')).not.toBeVisible();
  await page.clock.fastForward(2999);
  await expect(page.locator('[data-loading-context]')).not.toBeVisible();
  await page.clock.fastForward(1);
  await expect(page.locator('[data-loading-context]')).toBeVisible();
  await expect(status).toHaveAccessibleName('Loading your session');
});
test('guest session uses the same initially textless animation', async ({ page }) => {
  await mount(page, '/guest');
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await expect(page.locator('[data-loading-context]')).not.toBeVisible();
});
test('confirmed session errors replace the spinner and retry resets its delay', async ({
  page,
}) => {
  await mount(page);
  await page.getByRole('button', { name: 'Fail request' }).click();
  await expect(page.getByRole('alert')).toContainText('Session unavailable');
  await expect(page.locator('[data-loading-spinner]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await expect(page.locator('[data-loading-context]')).not.toBeVisible();
});

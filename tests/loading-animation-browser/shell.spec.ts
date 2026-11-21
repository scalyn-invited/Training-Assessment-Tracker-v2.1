import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
let bundle: string, css: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';
    import {Fragment,useState} from 'react'; import * as shells from './apps/web/app/components/app-shell';
    import {usePathname} from 'next/navigation';
    import {api,loadContext} from './apps/web/app/components/auth-ui';
    window.refreshContext=loadContext; window.mutate=()=>api('/clients/select',{csrf:'synthetic',clientId:'next'});
    const Root=shells['AppShellRoot']||Fragment;
    function Page(){const path=usePathname();return <shells.AppShell><h1>Verified page {path}</h1><input aria-label="Unsaved note" defaultValue=""/><button onClick={()=>window.navigate('/platform/clients')}>Navigate</button></shells.AppShell>}
    function Fixture(){const path=usePathname();const [recovery,setRecovery]=useState(false);window.recover=setRecovery;return <Root>{recovery ? <><shells.ShellRecovery/><main id="main"><h1>Recovery</h1></main></> : <Page key={path}/>}</Root>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/loading-shell',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [
      {
        name: 'navigation-fixture',
        setup(build) {
          build.onResolve({ filter: /^next\/navigation$/ }, () => ({
            path: 'navigation',
            namespace: 'fixture',
          }));
          build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
            loader: 'js',
            resolveDir: process.cwd(),
            contents: `import {useSyncExternalStore} from 'react';let path='/platform';window.navigate=p=>{path=p;window.dispatchEvent(new Event('navigate'))};export function usePathname(){return useSyncExternalStore(cb=>{window.addEventListener('navigate',cb);return()=>window.removeEventListener('navigate',cb)},()=>path)};const router={replace:p=>window.navigate(p)};export const useRouter=()=>router;`,
          }));
        },
      },
    ],
  });
  bundle = output.outputFiles.find((f) => f.path.endsWith('.js'))!.text;
  css = await readFile('apps/web/app/globals.css', 'utf8');
  css += output.outputFiles
    .filter((f) => f.path.endsWith('.css'))
    .map((f) => f.text)
    .join('\n');
});
test('same-workspace route keeps chrome mounted while destination content waits for exact authority', async ({
  page,
}) => {
  let held = false;
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => (release = resolve));
  await page.route('http://shell.invalid/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/context')
      return route.fulfill({
        json: {
          installed: true,
          csrf: 'synthetic',
          user: {
            id: 'synthetic',
            name: 'Synthetic user',
            environment: 'test',
            global_admin: true,
          },
          client: null,
        },
      });
    if (url.pathname === '/api/clients') return route.fulfill({ json: [] });
    if (url.pathname === '/api/branding/current') {
      if (held) await wait;
      return route.fulfill({
        json: {
          displayName: 'Synthetic brand',
          appName: 'Synthetic app',
          mode: 'custom',
          selectedTheme: 'light',
          logo: null,
          palettes: {},
          platformPalettes: {},
        },
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><title>Shell fixture</title></head><body><div id="root"></div></body></html>',
    });
  });
  await page.goto('http://shell.invalid/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  await page.getByRole('complementary').evaluate((el) => ((window as any).originalSidebar = el));
  held = true;
  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  await expect(page.locator('[data-appearance-pending]')).toBeVisible();
  await expect(page.getByRole('complementary')).toBeVisible();
  expect(
    await page.getByRole('complementary').evaluate((el) => el === (window as any).originalSidebar),
  ).toBe(true);
  await expect(page.getByRole('heading', { name: /Verified page/ })).toHaveCount(0);
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  release();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform/clients', exact: true }),
  ).toBeVisible();
});

test('a permission change cannot reuse the previous appearance authority', async ({ page }) => {
  let downgraded = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('http://shell.invalid/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/context')
      return route.fulfill({
        json: {
          installed: true,
          csrf: 'synthetic',
          user: {
            id: 'synthetic',
            name: 'Synthetic user',
            environment: 'test',
            global_admin: !downgraded,
          },
          client: { id: 'a', name: 'Client A' },
        },
      });
    if (path === '/api/clients') return route.fulfill({ json: [] });
    if (path === '/api/branding/current') {
      if (downgraded) await held;
      return route.fulfill({
        json: {
          displayName: 'Synthetic brand',
          appName: 'Synthetic app',
          selectedTheme: 'light',
          palettes: {},
          platformPalettes: {},
        },
      });
    }
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('http://shell.invalid/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  downgraded = true;
  await page.evaluate(() => (window as any).refreshContext());
  await expect(page.locator('[data-appearance-pending]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Verified page/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'People & access' })).toHaveCount(0);
  release();
});

test('one pending transition keeps its accessible status stable across session and appearance', async ({
  page,
}) => {
  const { state, start } = await mountControlled(page);
  let releaseSession!: () => void, releaseBrand!: () => void;
  state.contextGate = new Promise<void>((resolve) => (releaseSession = resolve));
  state.brandGate = new Promise<void>((resolve) => (releaseBrand = resolve));
  await start();
  const status = page.locator('[data-loading-state] [role="status"]');
  await expect(status).toBeVisible();
  const label = await status.getAttribute('aria-label');
  releaseSession();
  await expect.poll(() => page.locator('[data-loading-state]').count()).toBe(1);
  await page.waitForTimeout(100);
  await expect(status).toHaveAttribute('aria-label', label!);
  releaseBrand();
});

test('leaving a client for a guest route keeps unresolved canvas neutral', async ({ page }) => {
  const { state, start } = await mountControlled(page);
  await start();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  let release!: () => void;
  state.brandGate = new Promise<void>((resolve) => (release = resolve));
  await page.evaluate(() => (window as any).navigate('/login'));
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-shell-neutral', '');
  await expect(page.getByText('Client A brand', { exact: true })).toHaveCount(0);
  release();
});

for (const width of [1440, 820, 390])
  test(`removed-control focus reaches main through context failure and keyboard retry ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { state, start } = await mountControlled(page);
    await start();
    const navigate = page.getByRole('button', { name: 'Navigate', exact: true });
    await expect(navigate).toBeVisible();
    let release!: () => void;
    state.contextGate = new Promise<void>((r) => (release = r));
    await navigate.focus();
    await navigate.press('Enter');
    await expect(page.locator('[data-loading-spinner]')).toBeVisible();
    await expect(page.locator('main#main')).toBeFocused();
    state.contextFailure = true;
    release();
    await expect(page.getByRole('alert')).toContainText('Session unavailable');
    await expect(page.locator('main#main')).toBeFocused();
    await page.keyboard.press('Tab');
    const retry = page.getByRole('button', { name: 'Try loading again' });
    await expect(retry).toBeFocused();
    state.contextFailure = false;
    state.contextGate = new Promise<void>((r) => (release = r));
    await retry.press('Enter');
    await expect(page.locator('[data-loading-spinner]')).toBeVisible();
    await expect(page.locator('main#main')).toBeFocused();
    release();
    await expect(navigate).toBeVisible();
    await expect(page.locator('main#main')).toBeFocused();
  });

test('background context and appearance refresh preserve input focus value and DOM identity', async ({
  page,
}) => {
  const { state, start } = await mountControlled(page);
  await start();
  const input = page.getByRole('textbox', { name: 'Unsaved note' });
  await input.fill('Keep my unsaved note');
  await input.evaluate((el) => ((window as any).focusedInput = el));
  for (const kind of ['context', 'appearance']) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    if (kind === 'context') state.contextGate = gate;
    else state.brandGate = gate;
    const request = page.waitForRequest(
      kind === 'context' ? '**/api/auth/context' : '**/api/branding/current*',
    );
    await page.evaluate((kind) => {
      if (kind === 'context') void (window as any).refreshContext();
      else window.dispatchEvent(new Event('brandingchanged'));
    }, kind);
    await request;
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Keep my unsaved note');
    const response = page.waitForResponse(
      kind === 'context' ? '**/api/auth/context' : '**/api/branding/current*',
    );
    release();
    await response;
    await page.waitForTimeout(100);
    await expect(input).toBeFocused();
    expect(await input.evaluate((el) => el === (window as any).focusedInput)).toBe(true);
    await expect(input).toHaveValue('Keep my unsaved note');
  }
});

async function mountControlled(page: import('@playwright/test').Page) {
  const state = {
    session: {
      installed: true,
      csrf: 'synthetic',
      user: {
        id: 'synthetic',
        name: 'Synthetic user',
        environment: 'test',
        global_admin: true,
      } as any,
      client: { id: 'a', name: 'Client A' },
    },
    contextGate: null as Promise<void> | null,
    brandGate: null as Promise<void> | null,
    contextFailure: false,
    mutationFailure: false,
  };
  await page.route('http://shell.invalid/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/context') {
      const snapshot = structuredClone(state.session);
      if (state.contextGate) await state.contextGate;
      return route.fulfill(
        state.contextFailure
          ? { status: 503, json: { message: 'Session unavailable. Check again.' } }
          : { json: snapshot },
      );
    }
    if (path === '/api/clients/select')
      return route.fulfill(
        state.mutationFailure
          ? { status: 503, json: { message: 'Workspace selection could not be confirmed.' } }
          : { json: {} },
      );
    if (path === '/api/clients') return route.fulfill({ json: [] });
    if (path === '/api/branding/current') {
      if (state.brandGate) await state.brandGate;
      return route.fulfill({
        json: {
          displayName: 'Client A brand',
          appName: 'Synthetic app',
          mode: 'white-label',
          selectedTheme: 'light',
          palettes: {},
          platformPalettes: {},
        },
      });
    }
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Loading</title></head><body><div id="root"></div></body></html>',
    });
  });
  await page.goto('http://shell.invalid/');
  await page.addStyleTag({ content: css });
  return { state, start: () => page.addScriptTag({ content: bundle }) };
}

test('signed-out context never reveals protected page content', async ({ page }) => {
  const { state, start } = await mountControlled(page);
  state.session.user = null;
  await start();
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await page.waitForTimeout(100);
  await expect(page.getByRole('heading', { name: /Verified page/ })).toHaveCount(0);
});

test('failed client mutation conceals old scope and immediately offers session verification, not a second POST', async ({
  page,
}) => {
  const { state, start } = await mountControlled(page);
  await start();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Theme/ })
    .click();
  state.mutationFailure = true;
  await page.evaluate(() => (window as any).mutate().catch(() => {}));
  await expect(page.getByRole('heading', { name: /Verified page/ })).toHaveCount(0);
  await expect(page.locator(':popover-open')).toHaveCount(0);
  await expect(page.getByText('Client A brand', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try loading again' })).toBeVisible();
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
});

test('held route context uses neutral stable chrome, then failure and explicit retry', async ({
  page,
}) => {
  const { state, start } = await mountControlled(page);
  await start();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  await page.locator('aside').evaluate((el) => ((window as any).originalSidebar = el));
  let release!: () => void;
  state.contextGate = new Promise<void>((r) => (release = r));
  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await expect(page.getByText('Synthetic user', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Client A brand', { exact: true })).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-shell-neutral', '');
  expect(await page.locator('aside').evaluate((el) => el === (window as any).originalSidebar)).toBe(
    true,
  );
  state.contextFailure = true;
  release();
  await expect(page.getByRole('alert')).toContainText('Session unavailable');
  await expect(page.locator('[data-loading-spinner]')).toHaveCount(0);
  state.contextFailure = false;
  state.contextGate = null;
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform/clients', exact: true }),
  ).toBeVisible();
});

test('same-path recovery suppresses all chrome and resumes without duplicate main', async ({
  page,
}) => {
  const { start } = await mountControlled(page);
  await start();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Personal settings' }).click();
  await page.evaluate(() => (window as any).recover(true));
  await expect(page.getByRole('heading', { name: 'Recovery' })).toBeVisible();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main#main')).toHaveCount(1);
  await page.evaluate(() => (window as any).recover(false));
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  await expect(page.locator('main#main')).toHaveCount(1);
});

test('route verification does not join or publish an older in-flight page refresh', async ({
  page,
}) => {
  const { state, start } = await mountControlled(page);
  await start();
  await expect(
    page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
  ).toBeVisible();
  let release!: () => void;
  state.contextGate = new Promise<void>((r) => (release = r));
  const request = page.waitForRequest('**/api/auth/context');
  await page.evaluate(() => {
    void (window as any).refreshContext();
  });
  await request;
  state.contextGate = null;
  state.session.user.name = 'New verified identity';
  await page.getByRole('button', { name: 'Navigate', exact: true }).click();
  await expect(page.getByText('New verified identity', { exact: true })).toBeVisible();
  release();
  await page.waitForTimeout(100);
  await expect(page.getByText('Synthetic user', { exact: true })).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
]) {
  test(`content loader occupies and centers within the available area ${viewport.width}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { state, start } = await mountControlled(page);
    await start();
    await expect(
      page.getByRole('heading', { name: 'Verified page /platform', exact: true }),
    ).toBeVisible();
    let release!: () => void;
    state.brandGate = new Promise<void>((r) => (release = r));
    await page.getByRole('button', { name: 'Navigate', exact: true }).click();
    await expect(page.locator('[data-loading-spinner]')).toBeVisible();
    const main = await page.locator('main').boundingBox();
    const spinner = await page.locator('[data-loading-spinner]').boundingBox();
    expect(main!.height).toBeGreaterThan(viewport.height * 0.6);
    expect(Math.abs(spinner!.x + spinner!.width / 2 - (main!.x + main!.width / 2))).toBeLessThan(
      12,
    );
    expect(Math.abs(spinner!.y + spinner!.height / 2 - (main!.y + main!.height / 2))).toBeLessThan(
      18,
    );
    expect(
      await page
        .locator('[data-loading-spinner]')
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `docs/loading-animation/loading-${viewport.width}.png` });
    release();
  });
}

test('context deadline replaces an indefinite wait with actionable recovery', async ({ page }) => {
  const { state, start } = await mountControlled(page);
  state.contextGate = new Promise<void>(() => {});
  await start();
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 12500 });
  await expect(page.locator('[data-loading-spinner]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Try loading again' })).toBeVisible();
});

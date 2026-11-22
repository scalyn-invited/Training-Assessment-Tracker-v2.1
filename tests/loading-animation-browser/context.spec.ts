import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

test('a pre-switch context response cannot publish after an identity mutation', async ({
  page,
}) => {
  const output = await build({
    stdin: {
      contents: `
    import {createRoot} from 'react-dom/client';
    import {api,useContext} from './apps/web/app/components/auth-ui';
    function Fixture(){const {context,load}=useContext();window.reloadContext=load;
      window.switchIdentity=()=>api('mock-login',{identityId:'synthetic'});
      return <p>{context?.user?.name ?? 'unresolved'}</p>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/loading-context',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  let requested = false,
    release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('http://context.invalid/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/context') {
      requested = true;
      await held;
      return route.fulfill({
        json: {
          installed: true,
          csrf: 'synthetic',
          user: { id: 'old', name: 'Obsolete identity', global_admin: true },
        },
      });
    }
    if (path === '/api/auth/mock-login')
      return route.fulfill({ json: { user: { global_admin: false } } });
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('http://context.invalid/');
  await page.addScriptTag({
    content: output.outputFiles.find((file) => file.path.endsWith('.js'))!.text,
  });
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => (window as any).switchIdentity());
  release();
  await page.waitForTimeout(100);
  await expect(page.getByText('Obsolete identity')).toHaveCount(0);
});

test('a late mutation failure cannot invalidate a newer session epoch', async ({ page }) => {
  const output = await build({
    stdin: {
      contents: `import {api} from './apps/web/app/components/auth-ui';window.api=api;window.failures=0;window.addEventListener('trackercontextfailed',()=>window.failures++);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/loading-context',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('http://mutation.invalid/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/logout') {
      await held;
      return route.fulfill({ status: 503, json: { message: 'uncertain' } });
    }
    if (path === '/api/auth/mock-login') return route.fulfill({ json: {} });
    return route.fulfill({ contentType: 'text/html', body: '<main>Fixture</main>' });
  });
  await page.goto('http://mutation.invalid/');
  await page.addScriptTag({
    content: output.outputFiles.find((f) => f.path.endsWith('.js'))!.text,
  });
  const arrived = page.waitForRequest('**/api/auth/logout');
  await page.evaluate(() => {
    (window as any).oldMutation = (window as any).api('logout', {}).catch(() => {});
  });
  await arrived;
  await page.evaluate(() => (window as any).api('mock-login', {}));
  release();
  await page.evaluate(() => (window as any).oldMutation);
  expect(await page.evaluate(() => (window as any).failures)).toBe(0);
});

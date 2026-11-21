import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('built Next retains chrome nodes across page mounts and suppresses them for standalone recovery', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const post = async (path: string, data: Record<string, unknown>) => {
    const context = await (await page.request.get('/api/auth/context')).json();
    const response = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: context.csrf },
    });
    expect(response.ok(), path).toBe(true);
    return response.json();
  };
  await post('/auth/setup', {
    name: 'Loading QA',
    email: 'loading@example.invalid',
    password: 'Isolated loading QA passphrase',
    demoPassword: 'Isolated loading demo passphrase',
  });
  await post('/auth/login', {
    email: 'loading@example.invalid',
    password: 'Isolated loading QA passphrase',
  });
  await mkdir('docs/loading-animation/built', { recursive: true });
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/platform');
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
    await page.locator('aside').evaluate((node) => ((window as any).sidebar = node));
    await page.getByRole('banner').evaluate((node) => ((window as any).header = node));
    let release!: () => void,
      seen = false;
    const hold = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/branding/current?*', async (route) => {
      seen = true;
      await hold;
      await route.continue();
    });
    const nav = page.getByRole('navigation', {
      name: width < 800 ? 'Mobile platform navigation' : 'Main navigation',
      exact: true,
    });
    await nav.getByRole('link', { name: 'Clients', exact: true }).click();
    await expect.poll(() => seen).toBe(true);
    await expect(page.locator('[data-appearance-pending] [data-loading-spinner]')).toBeVisible();
    expect(await page.locator('aside').evaluate((node) => node === (window as any).sidebar)).toBe(
      true,
    );
    expect(await page.getByRole('banner').evaluate((node) => node === (window as any).header)).toBe(
      true,
    );
    await expect(page.locator('main h1')).toHaveCount(0);
    await expect(page.locator('main#main')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: `docs/loading-animation/built/navigation-${width}.png` });
    release();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await page.unroute('**/api/branding/current?*');
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  }
  // Fresh document must not reveal protected content while browser session verification waits.
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/auth/context', async (route) => {
    await hold;
    await route.continue();
  });
  await page.goto('/platform');
  await expect(page.locator('[data-loading-spinner]')).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(0);
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.screenshot({ path: 'docs/loading-animation/built/initial-session.png' });
  release();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await page.unroute('**/api/auth/context');
  // Next native history notification exercises unknown-path rendering under the persistent layout.
  await page.goto('/platform/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Personal settings' })).toHaveCount(0);
  await expect(page.locator('main#main')).toHaveCount(1);
  await page.getByRole('link', { name: 'Return to the application' }).click();
  await expect(page.locator('[data-application-shell]')).toBeVisible();
  expect(errors).toEqual([]);
});

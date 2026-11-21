import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('client People preserves directory scope, paging, recovery and client themes', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Client directory administrator passphrase',
    demo = 'Client directory fictional passphrase';
  const request = page.request;
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await request.get('/api/auth/context')).json();
    const response = await request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  async function a11y() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await post('/auth/setup', {
    name: 'Directory reviewer',
    email: 'directory@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/people');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'directory@example.invalid', password });
  await page.goto('/people');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  await post('/clients/select', { clientId: client });
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/clients/people?*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/people');
  await expect(page.getByText('Loading client members...', { exact: true })).toBeVisible();
  release();
  const table = page.getByRole('table', {
    name: 'People with an active membership in the selected client',
  });
  await expect(table.getByRole('row')).toHaveCount(11);
  await page.unroute('**/api/clients/people?*');
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'People', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await a11y();
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await page.screenshot({
    path: 'output/playwright/client-admin/people-desktop.png',
    fullPage: true,
  });
  for (const width of [320, 390, 800]) {
    await page.setViewportSize({ width, height: 844 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'output/playwright/client-admin/people-mobile.png',
    fullPage: true,
  });
  const brand = await (await request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: brand.version,
    displayName: 'Synthetic client brand',
    appName: brand.appName,
    mode: 'white-label',
    accent: '#7255a4',
    theme: 'client-dark',
    reason: 'Verify client scoped shared shell',
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // Personal choice wins.
  await page.getByRole('button', { name: 'Personal settings' }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings' });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await a11y();
  await expect(page.getByRole('link', { name: 'Synthetic client brand — Overview' })).toBeVisible();
  await page.route('**/api/clients/people?*', (r) =>
    r.fulfill({
      status: 503,
      json: { message: 'Client people unavailable. Retry the directory.' },
    }),
  );
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page.unroute('**/api/clients/people?*');
  await page.getByRole('button', { name: 'Retry people' }).click();
  await expect(table.getByRole('row')).toHaveCount(11);
  await page.route('**/api/clients/people?*', (r) => r.fulfill({ json: { people: [], total: 0 } }));
  await page.reload();
  await expect(page.getByText('No people are available in this client.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next people' })).toBeDisabled();
  await a11y();
  await page.unroute('**/api/clients/people?*');
  const fixture = Array.from({ length: 21 }, (_, i) => ({
    id: String(i),
    name: 'Synthetic directory person ' + i,
    sync_policy: 'local_only',
    active: true,
  }));
  await page.route('**/api/clients/people?*', (r) => {
    const n = Number(new URL(r.request().url()).searchParams.get('page'));
    return r.fulfill({ json: { total: 21, people: fixture.slice((n - 1) * 20, n * 20) } });
  });
  await page.reload();
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.getByRole('button', { name: 'Next people' }).click();
  await expect(table).toContainText('Synthetic directory person 20');
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Next people' })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous people' }).click();
  await expect(table.getByRole('row')).toHaveCount(21);
  await page.unroute('**/api/clients/people?*');
  for (const [email, allowed] of [
    ['demo.1.0@example.invalid', true],
    ['demo.1.2@example.invalid', false],
    ['demo.1.3@example.invalid', false],
  ] as const) {
    const isolated = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const p = await isolated.newPage();
      await p.goto(origin + '/login');
      await p.getByLabel('Email', { exact: true }).fill(email);
      await p.getByLabel('Password', { exact: true }).fill(demo);
      await p.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(p).toHaveURL(/\/clients$/);
      await p.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
      await expect(p).toHaveURL(/\/dashboard$/);
      await p.goto(origin + '/people');
      if (allowed) await expect(p.getByRole('table')).toBeVisible();
      else {
        await expect(p.getByRole('main').getByRole('alert')).toBeVisible();
        await expect(p.getByRole('table')).toHaveCount(0);
      }
      expect(
        (await p.request.get(origin + '/api/clients/people?clientId=' + client)).status(),
      ).toBe(allowed ? 200 : 403);
    } finally {
      await isolated.close();
    }
  }
});

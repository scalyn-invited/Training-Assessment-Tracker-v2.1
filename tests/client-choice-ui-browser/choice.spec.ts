import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('client choice retains scoped access, selection recovery and responsive shared presentation', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated client chooser administrator';
  const demoPassword = 'Isolated client chooser demo password';
  const request = page.request;
  const context = async () => (await request.get('/api/auth/context')).json();
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await context();
    const response = await request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  async function a11y(p = page) {
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      (await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await post('/auth/setup', {
    name: 'Client choice reviewer',
    email: 'choice@example.invalid',
    password,
    demoPassword,
  });
  await page.goto('/clients');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'choice@example.invalid', password });
  const clients = (await (await request.get('/api/clients')).json()) as {
    id: string;
    name: string;
  }[];
  await page.setViewportSize({ width: 1440, height: 900 });
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/clients', async (route) => {
    await loading;
    await route.continue();
  });
  await page.goto('/clients');
  await expect(page.getByText('Loading your clients…', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('main').getByRole('button', { name: /^Demo Client/ })).toHaveCount(3);
  await page.unroute('**/api/clients');
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  expect((await context()).client).toBeNull(); // Visiting the chooser does not select automatically.
  await a11y();
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await page.screenshot({ path: 'output/playwright/client-choice/desktop.png', fullPage: true });
  for (const width of [320, 390, 800]) {
    await page.setViewportSize({ width, height: 844 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/client-choice/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menu = page.getByRole('dialog', { name: 'Workspace menu' });
  await expect(
    menu.getByRole('link', { name: 'Platform administration', exact: true }),
  ).toBeVisible();
  await menu.getByRole('link', { name: 'Account security', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Close navigation' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();

  await page.route('**/api/clients', (route) =>
    route.fulfill({ status: 503, json: { message: 'Client list temporarily unavailable.' } }),
  );
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert').first()).toHaveText(
    'Client list temporarily unavailable.',
  );
  await page.unroute('**/api/clients');
  await page.getByRole('button', { name: 'Try loading clients again' }).click();
  await page.getByRole('button', { name: 'Retry workspace navigation' }).click();
  await expect(page.getByRole('main').getByRole('button', { name: /^Demo Client/ })).toHaveCount(3);
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await page.route('**/api/clients', (route) => route.fulfill({ json: [] }));
  await page.reload();
  await expect(
    page.getByText('No active client access is available. Contact your administrator.'),
  ).toBeVisible();
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
  await a11y();
  await page.unroute('**/api/clients');

  const longName = 'Synthetic organisation ' + 'LongClientName'.repeat(15);
  await page.route('**/api/clients', (route) =>
    route.fulfill({ json: [{ ...clients[0], name: longName }, ...clients.slice(1)] }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: longName, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await a11y();
  await page.unroute('**/api/clients');
  await page.reload();

  let finish!: () => void;
  const choosing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route('**/api/clients/select', async (route) => {
    await choosing;
    await route.fulfill({
      status: 503,
      json: { message: 'Client could not be opened. Try again.' },
    });
  });
  const before = await context();
  await page.getByRole('button', { name: clients[0].name, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Opening ' + clients[0].name + '…', exact: true }),
  ).toBeDisabled();
  for (const button of await page.getByRole('main').getByRole('button').all())
    await expect(button).toBeDisabled();
  finish();
  await expect(page.getByText('Client could not be opened. Try again.')).toBeVisible();
  expect((await context()).csrf).toBe(before.csrf);
  expect((await context()).client).toBeNull();
  await page.unroute('**/api/clients/select');
  const selected = page.waitForResponse(
    (r) => r.url().endsWith('/api/clients/select') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: clients[0].name, exact: true }).click();
  expect((await selected).status()).toBe(201);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Client choice reviewer.', exact: true }),
  ).toBeVisible();
  const after = await context();
  expect(after.client.id).toBe(clients[0].id);
  expect(after.csrf).not.toBe(before.csrf);
  expect(
    (
      await request.post('/api/clients/select', {
        headers: { Origin: origin },
        data: { csrf: before.csrf, clientId: clients[0].id },
      })
    ).status(),
  ).toBe(403);

  // All non-platform roles retain the same permitted choice; no navigation grants authority.
  for (const email of [
    'demo.1.0@example.invalid',
    'demo.1.2@example.invalid',
    'demo.1.3@example.invalid',
  ]) {
    const isolated = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const p = await isolated.newPage();
      await p.goto(origin + '/login');
      await p.getByLabel('Email', { exact: true }).fill(email);
      await p.getByLabel('Password', { exact: true }).fill(demoPassword);
      await p.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(p).toHaveURL(/\/clients$/);
      const button = p
        .getByRole('main')
        .getByRole('button', { name: 'Demo Client 1', exact: true });
      await expect(button).toBeVisible();
      await expect(p.getByRole('main').getByRole('button')).toHaveCount(1);
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      await a11y(p);
      const ctx = await (await p.request.get(origin + '/api/auth/context')).json();
      expect(ctx.client).toBeNull();
      const forbidden = clients.find((c) => c.name === 'Demo Client 2')!;
      expect(
        (
          await p.request.post(origin + '/api/clients/select', {
            headers: { Origin: origin },
            data: { csrf: ctx.csrf, clientId: forbidden.id },
          })
        ).status(),
      ).toBe(404);
      await button.click();
      await expect(p).toHaveURL(/\/dashboard$/);
      expect((await (await p.request.get(origin + '/api/auth/context')).json()).client.name).toBe(
        'Demo Client 1',
      );
    } finally {
      await isolated.close();
    }
  }
  expect(errors).toEqual([]);
});

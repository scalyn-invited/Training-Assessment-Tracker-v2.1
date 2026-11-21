import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared recovery, framework 404 and existing root redirects across roles', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const request = page.request;
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated recovery administrator password';
  const demo = 'Isolated recovery demo password';
  async function post(client: APIRequestContext, route: string, data: Record<string, unknown>) {
    const ctx = await (await client.get('/api/auth/context')).json();
    const response = await client.post('/api' + route, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok(), route + ': ' + response.status()).toBe(true);
    return response.json();
  }
  async function a11y(target: Page) {
    expect(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(target.locator('main')).toHaveCount(1);
    expect(
      (await new AxeBuilder({ page: target }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    if (target.viewportSize()!.width <= 800) {
      expect(
        (await target
          .locator('main')
          .getByRole('button')
          .or(target.locator('main').getByRole('link'))
          .boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
  }
  async function shot(name: string) {
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({
      path: `output/playwright/recovery-ui/${name}.png`,
      fullPage: true,
      style: 'nextjs-portal { display: none; }',
    });
  }
  // A fresh install keeps the existing / -> dashboard -> login -> setup chain.
  const root = await request.get('/', { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toBe('/dashboard');
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Before we begin' })).toBeVisible();
  await post(request, '/auth/setup', {
    name: 'Recovery administrator',
    email: 'recovery@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  let recoveryRequests = 0;
  await page.route('**/api/**', (r) => {
    recoveryRequests++;
    return r.abort();
  });
  const missing = await page.goto('/not-a-route-for-recovery-qa');
  expect(missing!.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.getByRole('heading', { name: 'Page unavailable' })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  expect(recoveryRequests).toBe(0);
  await expect(page.getByRole('link', { name: 'Return to the application' })).toHaveAttribute(
    'href',
    '/',
  );
  for (const theme of ['light', 'dark', 'neon-cyan', 'platform-dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await a11y(page);
    if (theme === 'dark') await shot('not-found-desktop');
    await page.setViewportSize({ width: 320, height: 812 });
    await a11y(page);
    if (theme === 'dark') {
      await page.setViewportSize({ width: 390, height: 844 });
      await shot('not-found-mobile');
    }
  }
  await page.unroute('**/api/**');
  await page.getByRole('link', { name: 'Return to the application' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login$/);

  await post(request, '/auth/login', { email: 'recovery@example.invalid', password });
  // Global admins without a selected client follow the learning-root client chooser, not a new platform redirect.
  await page.goto('/');
  await expect(page).toHaveURL(/\/clients$/);
  await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Recovery administrator.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await settings.getByRole('button', { name: /^Theme(?: |$)/ }).click();
  await settings.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const overviewUrl =
    '/api/enrolments?clientId=' +
    (await (await request.get('/api/auth/context')).json()).client.id +
    '&view=overview&page=1';
  const savedBefore = await (await request.get(overviewUrl)).json();
  let brokenReads = 0;
  // A malformed read fixture causes an actual page render error and exercises Next's real error boundary.
  await page.route('**/api/enrolments?*view=overview*', (r) => {
    brokenReads++;
    return r.fulfill({ json: { total: 1, page: 1, records: [null] } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/enrolments');
  await expect(page.getByRole('heading', { name: 'Training records', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Overview', exact: true })
    .click();
  // Suppress the development-only overlay so the real fallback remains operable in dev QA.
  await page.addStyleTag({ content: 'nextjs-portal { display: none; }' });
  await expect(page.getByRole('heading', { name: 'This page could not load' })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('main')).not.toContainText('TypeError');
  await expect(page.getByRole('main')).not.toContainText('Cannot read');
  await page.setViewportSize({ width: 1440, height: 900 });
  await a11y(page);
  await shot('error-desktop');
  for (const width of [800, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await a11y(page);
    if (width === 390) await shot('error-mobile');
  }
  const beforeRetry = brokenReads;
  await page.getByRole('button', { name: 'Try again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => brokenReads).toBeGreaterThan(beforeRetry);
  await expect(page.getByRole('heading', { name: 'This page could not load' })).toBeVisible();
  await page.unroute('**/api/enrolments?*view=overview*');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Recovery administrator.' }),
  ).toBeVisible();
  expect(await (await request.get(overviewUrl)).json()).toEqual(savedBefore);

  // Selected-client membership and role checks remain actual API decisions.
  for (const [email, canAdmin, canCoordinate] of [
    ['demo.1.0@example.invalid', true, false],
    ['demo.1.1@example.invalid', false, true],
    ['demo.1.3@example.invalid', false, false],
  ] as const) {
    const context = await browser.newContext({ baseURL: origin });
    try {
      await post(context.request, '/auth/login', { email, password: demo });
      const rolePage = await context.newPage();
      await rolePage.goto('/');
      await expect(rolePage).toHaveURL(/\/dashboard$/);
      await expect(rolePage.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
      const ctx = await (await context.request.get('/api/auth/context')).json();
      expect(ctx.canAdmin).toBe(canAdmin);
      expect(ctx.canCoordinate).toBe(canCoordinate);
      const selected = ctx.client.id;
      const response = await rolePage.goto('/unavailable-recovery-page');
      expect(response!.status()).toBe(404);
      await rolePage.getByRole('link', { name: 'Return to the application' }).click();
      await expect(rolePage).toHaveURL(/\/dashboard$/);
      await expect(rolePage.getByRole('heading', { name: /Welcome back,/ })).toBeVisible();
      expect((await (await context.request.get('/api/auth/context')).json()).client.id).toBe(
        selected,
      );
    } finally {
      await context.close();
    }
  }
});

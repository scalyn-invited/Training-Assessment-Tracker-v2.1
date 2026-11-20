import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('training directory preserves scoped search, repeat search, paging and private-detail links', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated training directory administrator',
    demo = 'Isolated training directory demonstration';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    const r = await page.request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
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
  async function screenshot(name: string) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      scrollTo(0, 0);
    });
    await page.screenshot({
      path: 'output/playwright/training-directory/' + name + '.png',
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Directory reviewer',
    email: 'training-directory@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/enrolments');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'training-directory@example.invalid', password });
  await page.goto('/enrolments');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  const other = clients.find((c: { name: string }) => c.name === 'Demo Client 2').id;
  await post('/clients/select', { clientId: client });
  const choices = await (
    await page.request.get('/api/enrolments/choices?clientId=' + client)
  ).json();
  for (let i = 0; i < 21; i++)
    await post('/enrolments', {
      clientId: client,
      memberId: choices.members.find((m: { name: string }) => m.name === 'Demo Member 1.3').id,
      coordinatorId: choices.coordinators.find(
        (m: { name: string }) => m.name === 'Demo Coordinator 1.2',
      ).id,
      groupId: null,
      title: 'Record ' + String(i).padStart(2, '0'),
      reason: 'Isolated training directory fixture',
    });
  await page.goto('/enrolments');
  await expect(
    page.getByText('No training records are available for your current permissions.', {
      exact: false,
    }),
  ).toBeVisible();
  const brand = await (await page.request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: brand.version,
    displayName: 'Training fixture client',
    appName: brand.appName,
    accent: '#7255a4',
    mode: 'white-label',
    theme: 'client-dark',
    reason: 'Directory theme verification',
  });
  await post('/auth/login', { email: 'demo.1.3@example.invalid', password: demo });
  await post('/clients/select', { clientId: client });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/enrolments?*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/enrolments');
  await expect(page.getByText('Loading training records', { exact: false })).toBeVisible();
  release();
  const records = page.getByRole('article');
  const search = page.getByRole('searchbox', { name: 'Search training records', exact: true });
  const submit = page.getByRole('button', { name: 'Search records', exact: true });
  await expect(records).toHaveCount(20);
  await page.unroute('**/api/enrolments?*');
  await expect(records.first().getByRole('heading')).toContainText('Record 20');
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Learning plans' }),
  ).toHaveAttribute('aria-current', 'page');
  await a11y();
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await a11y();
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await search.focus();
  await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  // Repeating an unchanged empty search previously cleared data without running a request.
  await submit.click();
  await expect(records).toHaveCount(20);
  await submit.click();
  await expect(records).toHaveCount(20);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(records).toHaveCount(1);
  await expect(records.first().getByRole('heading')).toContainText('Record 00');
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await search.fill('Record 20');
  await submit.click();
  await expect(records).toHaveCount(1);
  await expect(page.getByText('Page 1 · 1 records', { exact: true })).toBeVisible();
  await submit.click();
  await expect(records).toHaveCount(1);
  const open = records.first().getByRole('link', { name: 'Open training record', exact: true });
  const href = await open.getAttribute('href');
  await expect(
    records.first().getByRole('link', { name: 'Open onboarding', exact: true }),
  ).toHaveAttribute('href', href + '/onboarding');
  await expect(
    records.first().getByRole('link', { name: 'Open learning plan', exact: true }),
  ).toHaveAttribute('href', href + '/delivery');
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(href + '$'));
  await expect(page.getByRole('heading', { name: 'Record 20', exact: true })).toBeVisible();
  await page.goBack();
  await expect(records).toHaveCount(20);
  await search.fill('No matching synthetic record');
  await submit.click();
  await expect(page.getByText('No records match this search.', { exact: false })).toBeVisible();
  await expect(search).toHaveValue('No matching synthetic record');
  await submit.click();
  await expect(page.getByText('No records match this search.', { exact: false })).toBeVisible();
  await page.route('**/api/enrolments?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic training search outage.' } }),
  );
  await search.fill('Record 20');
  await submit.click();
  await expect(page.getByText('Synthetic training search outage.')).toBeVisible();
  await expect(search).toHaveValue('Record 20');
  await page.unroute('**/api/enrolments?*');
  await page.getByRole('button', { name: 'Retry training records', exact: true }).click();
  await expect(records).toHaveCount(1);
  await screenshot('desktop');
  for (const width of [320, 390, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(search).toHaveCSS('font-size', '16px');
  await screenshot('mobile');
  // Inject long text and multiple statuses without changing backend projections.
  const actual = await (await page.request.get('/api/enrolments?clientId=' + client)).json();
  await page.route('**/api/enrolments?*', (route) =>
    route.fulfill({
      json: {
        total: 2,
        page: 1,
        records: [
          {
            ...actual.records[0],
            title: 'LongTrainingTitle'.repeat(15),
            memberName: 'Long member name '.repeat(10),
            status: 'awaiting_review',
            canDetails: true,
          },
          { ...actual.records[1], canDetails: false, status: 'paused' },
        ],
      },
    }),
  );
  await page.reload();
  await expect(records).toHaveCount(2);
  await expect(
    records.last().getByText('Private inputs require separate sensitive access.', { exact: true }),
  ).toBeVisible();
  await a11y();
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.unroute('**/api/enrolments?*');
  await page.reload();
  await expect(records).toHaveCount(20);
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await a11y();
  expect((await page.request.get('/api/enrolments?clientId=' + other)).status()).toBe(403);
  for (const [email, summaryOnly] of [
    ['demo.1.0@example.invalid', false],
    ['demo.1.2@example.invalid', true],
  ] as const) {
    const ctx = await browser.newContext({
      baseURL: origin,
      viewport: { width: 390, height: 900 },
      isMobile: true,
      hasTouch: true,
    });
    const p = await ctx.newPage();
    try {
      const guest = await (await p.request.get('/api/auth/context')).json();
      expect(
        (
          await p.request.post('/api/auth/login', {
            headers: { Origin: origin },
            data: { csrf: guest.csrf, email, password: demo },
          })
        ).ok(),
      ).toBe(true);
      const user = await (await p.request.get('/api/auth/context')).json();
      expect(
        (
          await p.request.post('/api/clients/select', {
            headers: { Origin: origin },
            data: { csrf: user.csrf, clientId: client },
          })
        ).ok(),
      ).toBe(true);
      await p.goto('/enrolments');
      await expect(p.locator('[data-application-shell="learning"]')).toBeVisible();
      const projection = await (await p.request.get('/api/enrolments?clientId=' + client)).json();
      await expect(p.getByRole('article')).toHaveCount(projection.records.length);
      if (summaryOnly) {
        expect(projection.records.every((r: { canDetails: boolean }) => !r.canDetails)).toBe(true);
        await expect(p.getByRole('link', { name: 'Open onboarding', exact: true })).toHaveCount(0);
        await expect(
          p.getByText('Private inputs require separate sensitive access.', { exact: true }),
        ).toHaveCount(20);
        expect(
          (await p
            .getByRole('link', { name: 'Open training record', exact: true })
            .first()
            .boundingBox())!.height,
        ).toBeGreaterThanOrEqual(44);
        await p.screenshot({
          path: 'output/playwright/training-directory/summary-mobile.png',
          fullPage: true,
        });
      }
      expect(
        (await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    } finally {
      await ctx.close();
    }
  }
  expect(errors).toEqual([]);
});

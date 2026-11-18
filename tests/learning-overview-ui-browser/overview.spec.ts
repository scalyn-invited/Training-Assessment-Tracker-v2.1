import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('learning Overview retains scoped plans, receipts, navigation and responsive themes', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated learning overview administrator',
    demo = 'Isolated learning overview demonstration';
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
      path: 'output/playwright/learning-overview/' + name + '.png',
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Learning reviewer',
    email: 'learning-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'learning-ui@example.invalid', password });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  const other = clients.find((c: { name: string }) => c.name === 'Demo Client 2').id;
  await post('/clients/select', { clientId: client });
  const choices = await (
    await page.request.get('/api/enrolments/choices?clientId=' + client)
  ).json();
  for (let i = 12; i >= 0; i--)
    await post('/enrolments', {
      clientId: client,
      memberId: choices.members.find((m: { name: string }) => m.name === 'Demo Member 1.3').id,
      coordinatorId: choices.coordinators.find(
        (m: { name: string }) => m.name === 'Demo Coordinator 1.2',
      ).id,
      groupId: null,
      title: 'Learning plan ' + String(i).padStart(2, '0'),
      reason: 'Isolated Overview navigation fixture',
    });
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { name: 'No enrolments available', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  const brand = await (await page.request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: brand.version,
    displayName: 'Learning fixture client',
    appName: brand.appName,
    mode: 'co-branded',
    accent: '#316656',
    theme: 'client-light',
    reason: 'Isolated learning branding verification',
  });
  await post('/auth/login', { email: 'demo.1.3@example.invalid', password: demo });
  await post('/clients/select', { clientId: client });
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/enrolments?*view=overview*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/dashboard');
  await expect(page.getByText('Loading your learning plans...', { exact: true })).toBeVisible();
  release();
  const plans = page.getByRole('link').filter({ has: page.getByRole('heading', { level: 3 }) });
  await expect(plans).toHaveCount(12);
  await page.unroute('**/api/enrolments?*view=overview*');
  await expect(plans.getByRole('heading').first()).toHaveText('Learning plan 00');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-light');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await screenshot('desktop');
  await plans.first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/enrolments\/[a-f0-9-]+$/);
  await expect(page.getByRole('heading', { name: 'Learning plan 00', exact: true })).toBeVisible();
  // Both Overview and the migrated record detail now use shared receipts.
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Background check receipts', exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(plans).toHaveCount(12);
  await page.getByRole('link', { name: 'View learning plans', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard#learning-plans$/);
  await expect(
    page.getByRole('heading', { name: 'Training plans in your scope', exact: true }),
  ).toBeInViewport();
  await page.getByRole('button', { name: 'Next plans', exact: true }).click();
  await expect(plans.getByRole('heading')).toHaveText('Learning plan 12');
  await expect(page.getByRole('button', { name: 'Next plans', exact: true })).toBeDisabled();
  // Page-two records removed elsewhere: preserve the existing explicit return action.
  await page.getByRole('button', { name: 'Previous plans', exact: true }).click();
  await expect(plans).toHaveCount(12);
  await page.route('**/api/enrolments?*view=overview*', (route) =>
    route.fulfill({ json: { total: 0, page: 2, records: [] } }),
  );
  await page.getByRole('button', { name: 'Next plans', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No enrolments available', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/enrolments?*view=overview*');
  await page.getByRole('button', { name: 'Return to first page', exact: true }).click();
  await expect(plans).toHaveCount(12);
  await page.route('**/api/enrolments?*view=overview*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic learning list outage.' } }),
  );
  await page.reload();
  await expect(page.getByText('Synthetic learning list outage.')).toBeVisible();
  const receipts = page.getByRole('region', { name: 'Background check receipts', exact: true });
  await expect(receipts.getByText('No checks requested yet.', { exact: false })).toBeVisible();
  await page.unroute('**/api/enrolments?*view=overview*');
  await page.getByRole('button', { name: 'Retry learning plans', exact: true }).click();
  await expect(plans).toHaveCount(12);
  const actual = await (
    await page.request.get('/api/enrolments?clientId=' + client + '&view=overview&page=1')
  ).json();
  await page.route('**/api/enrolments?*view=overview*', (route) =>
    route.fulfill({
      json: {
        ...actual,
        records: [
          {
            ...actual.records[0],
            title: 'LongLearningPlan'.repeat(12),
            memberName: 'Long member name '.repeat(8),
            groupName: 'LongTeam'.repeat(20),
            status: 'awaiting_review',
            durationWeeks: 52,
            dailyMinutes: 120,
          },
        ],
      },
    }),
  );
  let receiptRequests = 0;
  await page.route('**/api/jobs?*', (route) => {
    receiptRequests++;
    return route.fulfill({
      json: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          state: 'queued',
          errorCode: null,
          createdAt: '2026-11-18T00:00:00Z',
          receiptAt: null,
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          state: 'complete',
          errorCode: null,
          createdAt: '2026-11-18T00:00:00Z',
          receiptAt: '2026-11-18T00:01:00Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000003',
          state: 'cancelled',
          errorCode: 'authority_or_version_changed',
          createdAt: '2026-11-18T00:00:00Z',
          receiptAt: null,
        },
        {
          id: '00000000-0000-4000-8000-000000000004',
          state: 'failed',
          errorCode: 'retry_budget_exhausted',
          createdAt: '2026-11-18T00:00:00Z',
          receiptAt: null,
        },
      ],
    });
  });
  await page.reload();
  await expect(plans).toHaveCount(1);
  await expect(
    receipts.getByText('This check exhausted its retries.', { exact: false }),
  ).toBeVisible();
  await expect(
    receipts.getByText('Access or the enrolment version changed before this check ran.', {
      exact: true,
    }),
  ).toBeVisible();
  const initialRequests = receiptRequests;
  await expect.poll(() => receiptRequests, { timeout: 10000 }).toBeGreaterThan(initialRequests);
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await receipts.screenshot({ path: 'output/playwright/learning-overview/receipts-mobile.png' });
  await page.unroute('**/api/enrolments?*view=overview*');
  await page.unroute('**/api/jobs?*');
  await page.route('**/api/jobs?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic receipt outage.' } }),
  );
  await page.reload();
  await expect(receipts.getByText('Synthetic receipt outage.')).toBeVisible();
  await expect(plans).toHaveCount(12);
  await page.unroute('**/api/jobs?*');
  await receipts.getByRole('button', { name: 'Retry background receipts', exact: true }).click();
  await expect(receipts.getByText('No checks requested yet.', { exact: false })).toBeVisible();
  await a11y();
  await screenshot('mobile');
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Workspace menu', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Close navigation', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(menu.getByRole('link').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-light');
  await a11y();
  await screenshot('branded-mobile');
  expect(
    (await page.request.get('/api/enrolments?clientId=' + other + '&view=overview')).status(),
  ).toBe(403);
  // Scoped navigation is checked for every applicable role without inventing client permissions.
  for (const [email, admin, coordinator] of [
    ['demo.1.0@example.invalid', true, false],
    ['demo.1.2@example.invalid', false, true],
  ] as const) {
    const ctx = await browser.newContext({ baseURL: origin });
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
      await p.goto('/dashboard');
      await expect(p.locator('[data-application-shell="learning"]')).toBeVisible();
      const nav = p.getByRole('navigation', { name: 'Main navigation', exact: true });
      await expect(nav.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(
        admin ? 1 : 0,
      );
      await expect(nav.getByRole('link', { name: 'Review queue', exact: true })).toHaveCount(
        coordinator ? 1 : 0,
      );
      await expect(nav.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const visible = await (
        await p.request.get('/api/enrolments?clientId=' + client + '&view=overview')
      ).json();
      await expect(
        p.getByRole('link').filter({ has: p.getByRole('heading', { level: 3 }) }),
      ).toHaveCount(visible.records.length);
    } finally {
      await ctx.close();
    }
  }
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
test('source shell, role redirects, scoped overviews, client switching and mobile navigation', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Private shell administrator password',
    demo = 'Separate browser demo passphrase';
  async function post(route: string, data: Record<string, unknown>) {
    const context = await (await request.get('/api/auth/context')).json();
    const response = await request.post('/api' + route, {
      headers: { Origin: origin },
      data: { ...data, csrf: context.csrf },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await post('/auth/setup', {
    name: 'Shell administrator',
    email: 'shell-admin@example.invalid',
    password,
    demoPassword: demo,
  });
  await post('/auth/login', { email: 'shell-admin@example.invalid', password });
  const clients = await (await request.get('/api/clients')).json(),
    client = clients.find((row: { name: string }) => row.name === 'Demo Client 1').id;
  await post('/clients/select', { clientId: client });
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    const members = (
      await db.pool.query(
        'SELECT cm.id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
        [client],
      )
    ).rows;
    const team = (await db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
      .rows[0].id;
    for (let i = 12; i >= 0; i--)
      await post('/enrolments', {
        clientId: client,
        memberId: members.find((r) => r.email === 'demo.1.3@example.invalid')!.id,
        coordinatorId: members.find((r) => r.email === 'demo.1.2@example.invalid')!.id,
        groupId: team,
        title: 'Plan ' + String(i).padStart(2, '0'),
        reason: 'Verify scoped dashboard pagination',
      });
    async function login(target: typeof page, email: string, secret: string) {
      await target.goto(origin + '/login');
      await target.getByLabel('Email', { exact: true }).fill(email);
      await target.getByLabel('Password', { exact: true }).fill(secret);
      await target.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    let failContext = true;
    await page.route('**/api/auth/context', async (route) => {
      if (failContext) {
        failContext = false;
        await route.fulfill({ status: 503, json: { message: 'Session temporarily unavailable.' } });
      } else await route.continue();
    });
    await page.goto(origin + '/login');
    await expect(page.getByText('Session temporarily unavailable.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Try loading again', exact: true }).click();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await page.unroute('**/api/auth/context');
    await login(page, 'shell-admin@example.invalid', password);
    await expect(page).toHaveURL(/\/platform$/);
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Only one active Global Admin', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'View system status' }).first().click();
    await expect(page.getByText('Password sign-in', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 375, height: 812 });
    const settingsButton = page.getByRole('button', { name: 'Personal settings' });
    await settingsButton.click();
    const drawer = page.getByRole('dialog', { name: 'Personal settings', exact: true });
    await expect(drawer).toBeVisible();
    const first = drawer.getByRole('button', { name: 'Close', exact: true });
    await expect(first).toBeFocused();
    await first.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(drawer.getByRole('button', { name: /^Theme(?: |$)/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(settingsButton).toBeFocused();
    await expect(drawer).not.toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await settingsButton.click();
    await drawer.getByRole('button', { name: /^Theme(?: |$)/ }).click();
    await drawer.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape'); // Close theme menu first.
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await settingsButton.click();
    await drawer.getByRole('button', { name: /^Theme(?: |$)/ }).click();
    await drawer.getByRole('button', { name: 'Use platform default', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.locator('summary').filter({ hasText: 'Workspace' }).click();
    await page.getByRole('link', { name: 'Choose your client', exact: true }).click();
    await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole('heading', { name: 'No enrolments available' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'People', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'People in this client' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Demo Member 1.3', exact: true })).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Active client', exact: true })
      .selectOption({ label: 'Demo Client 2' });
    await page.getByRole('button', { name: 'Switch client', exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole('combobox', { name: 'Active client', exact: true })).toHaveValue(
      clients.find((row: { name: string }) => row.name === 'Demo Client 2').id,
    );
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/login/);
    await login(page, 'demo.1.3@example.invalid', demo);
    await expect(page).toHaveURL(/clients/);
    let fail = true;
    await page.route('**/api/enrolments?*view=overview*', async (route) => {
      if (fail) {
        fail = false;
        await route.fulfill({
          status: 503,
          json: { message: 'Learning plans temporarily unavailable.' },
        });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await expect(
      page.getByText('Learning plans temporarily unavailable.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry learning plans' }).click();
    const plans = page.getByRole('link').filter({ has: page.getByRole('heading', { level: 3 }) });
    await expect(plans).toHaveCount(12);
    await expect(plans.getByRole('heading').first()).toHaveText('Plan 00');
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'People', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Review queue', exact: true })).toHaveCount(0);
    expect((await page.request.get('/api/platform/overview')).status()).toBe(403);
    expect((await page.request.get('/api/clients/people?clientId=' + client)).status()).toBe(403);
    await page.getByRole('button', { name: 'Next plans' }).click();
    await expect(plans.getByRole('heading')).toHaveText('Plan 12');
    await page.getByRole('button', { name: 'Previous plans' }).click();
    await expect(plans).toHaveCount(12);
    await page.getByRole('combobox', { name: 'Active client', exact: true }).focus();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: 'output/playwright/workspace-shell-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.getByRole('combobox', { name: 'Active client', exact: true }).focus();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: 'output/playwright/workspace-shell-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.screenshot({ path: 'output/playwright/workspace-menu-mobile.png', fullPage: false });
    const secondary = await browser.newContext();
    try {
      const coordinator = await secondary.newPage();
      await login(coordinator, 'demo.1.2@example.invalid', demo);
      await expect(coordinator).toHaveURL(/clients/);
      await coordinator.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
      await expect(
        coordinator.getByRole('link', { name: 'Review queue', exact: true }),
      ).toBeVisible();
    } finally {
      await secondary.close();
    }
  } finally {
    await db.close();
  }
});

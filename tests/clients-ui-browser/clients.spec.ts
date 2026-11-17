import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const screenshotDir = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright';

test('Clients presentation preserves real management, workspace selection and responsive access', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated clients administrator passphrase';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
    name: 'Clients reviewer',
    email: 'clients@example.invalid',
    password,
    demoPassword: 'Isolated fictional member passphrase',
  });
  await post('/auth/login', { email: 'clients@example.invalid', password });
  const expected = await (await request.get('/api/platform/clients')).json();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('clients@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Clients', exact: true })
    .click();
  const main = page.getByRole('main'),
    table = page.getByRole('table', { name: 'Client directory' });
  await expect(main.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await expect(main.getByRole('status')).toHaveText(`${expected.total} of ${expected.all} clients`);
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Clients', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  for (const client of expected.clients) {
    const row = table
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Manage ' + client.name, exact: true }) });
    await expect(row.locator('[data-label="Members"]')).toHaveText(String(client.members));
    await expect(row.locator('[data-label="Client admins"]')).toHaveText(String(client.admins));
  }
  async function accessibility() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await accessibility();
  await page.screenshot({ path: `${screenshotDir}/clients-light-desktop.png`, fullPage: true });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await accessibility();
  await page.screenshot({ path: `${screenshotDir}/clients-dark-desktop.png`, fullPage: true });
  expect(
    await page
      .locator('img[src^="/images/clients/"], img[src^="/images/overview/"]')
      .evaluateAll((images) =>
        images.flatMap((node) => {
          const img = node as HTMLImageElement,
            box = img.getBoundingClientRect();
          return !img.getClientRects().length ||
            (img.complete &&
              img.naturalWidth > 0 &&
              box.width === img.naturalWidth &&
              box.height === img.naturalHeight)
            ? []
            : [img.src];
        }),
      ),
  ).toEqual([]);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 1458 });
  await accessibility();
  await page.screenshot({ path: `${screenshotDir}/clients-dark-mobile.png`, fullPage: true });
  await page.getByRole('button', { name: 'Personal settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await settings.locator('summary').filter({ hasText: 'Theme' }).click();
  await settings.getByRole('button', { name: 'Light', exact: true }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await accessibility();
  await page.screenshot({ path: `${screenshotDir}/clients-light-mobile.png`, fullPage: true });
  await main.getByRole('button', { name: 'Create client', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await dialog.getByLabel('Directory name').fill('UI QA client');
  await dialog.getByLabel('Creation reason').fill('Verify the existing client creation workflow');
  await accessibility();
  await dialog.getByRole('button', { name: 'Create client', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(main.getByText('Client created.', { exact: true })).toBeVisible();
  const manage = table.getByRole('button', { name: 'Manage UI QA client', exact: true });
  await manage.click();
  await dialog.getByLabel('Directory name').fill('UI QA renamed client');
  await dialog.getByLabel('Client change reason').fill('Verify the existing client name update');
  await dialog.getByRole('button', { name: 'Save directory name' }).click();
  await expect(dialog).not.toBeVisible();
  const renamed = table.getByRole('row').filter({
    has: page.getByRole('button', { name: 'Manage UI QA renamed client', exact: true }),
  });
  await renamed.getByRole('button', { name: 'Manage UI QA renamed client', exact: true }).click();
  await dialog
    .getByLabel('Client change reason')
    .fill('Verify guarded suspension of isolated client');
  await dialog.getByRole('button', { name: 'Suspend client', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Confirm client access change' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Suspend client', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Suspend client', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm suspension', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    renamed.getByRole('button', { name: 'Open workspace for UI QA renamed client' }),
  ).toBeDisabled();
  await expect(renamed.locator('[data-label="Status"]')).toHaveText('Suspended');
  await renamed.getByRole('button', { name: 'Manage UI QA renamed client', exact: true }).click();
  await dialog
    .getByLabel('Client change reason')
    .fill('Verify guarded reactivation of isolated client');
  await dialog.getByRole('button', { name: 'Reactivate client', exact: true }).click();
  await expect(dialog).toContainText('Ended grants and stopped work will remain ended.');
  await dialog.getByRole('button', { name: 'Confirm reactivation', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    renamed.getByRole('button', { name: 'Open workspace for UI QA renamed client' }),
  ).toBeEnabled();

  // A competing real directory update must still reject the stale displayed version.
  await renamed.getByRole('button', { name: 'Manage UI QA renamed client', exact: true }).click();
  const fresh = (await (await request.get('/api/platform/clients?search=UI+QA')).json()).clients[0];
  await post('/platform/clients', {
    id: fresh.id,
    name: fresh.name,
    version: fresh.version,
    reason: 'Competing change verifies the stale version safeguard',
  });
  await dialog.getByLabel('Directory name').fill('Unsaved stale name');
  await dialog.getByLabel('Client change reason').fill('This stale update must be refused');
  await dialog.getByRole('button', { name: 'Save directory name' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel('Directory name')).toHaveValue('Unsaved stale name');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(
    renamed.getByRole('button', { name: 'Manage UI QA renamed client', exact: true }),
  ).toBeFocused();
  const search = page.getByRole('searchbox', { name: 'Search clients', exact: true });
  await search.fill('no matching client');
  await expect(table.getByText('No clients found')).toBeVisible();
  await main.getByRole('button', { name: 'Clear search and status' }).click();
  await expect(
    table.getByRole('button', { name: 'Manage Demo Client 1', exact: true }),
  ).toBeVisible();
  await page.route('**/api/platform/clients?*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Directory temporarily unavailable' }),
    }),
  );
  await search.fill('Demo');
  await expect(main.getByRole('button', { name: 'Try loading the directory again' })).toBeVisible();
  await page.unroute('**/api/platform/clients?*');
  await main.getByRole('button', { name: 'Try loading the directory again' }).click();
  await expect(main.getByRole('button', { name: 'Try loading the directory again' })).toHaveCount(
    0,
  );
  await page
    .getByRole('navigation', { name: 'Mobile platform navigation' })
    .getByRole('link', { name: 'People & access' })
    .click();
  await expect(page).toHaveURL(/\/platform\/people$/);
  await expect(page.getByRole('heading', { name: 'People & access' })).toBeVisible();
  // Existing saved links into client access remain supported.
  await page.goto('/platform/clients#client-account-access');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Client account access' })).toBeVisible();

  const touch = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const mobile = await touch.newPage();
  await mobile.goto('/platform/clients');
  await expect(
    mobile.getByRole('button', { name: 'Manage Demo Client 1', exact: true }),
  ).toBeVisible();
  for (const control of [
    mobile.getByRole('main').getByRole('button', { name: 'Create client', exact: true }),
    mobile.getByRole('button', { name: 'Manage Demo Client 1', exact: true }),
    mobile.getByRole('searchbox', { name: 'Search clients', exact: true }),
    mobile.getByRole('combobox', { name: 'Status', exact: true }),
  ]) {
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await mobile.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const footer = await mobile.locator('footer').boundingBox();
  const bottomNav = await mobile
    .getByRole('navigation', { name: 'Mobile platform navigation' })
    .boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(bottomNav!.y);
  await mobile.screenshot({ path: `${screenshotDir}/clients-touch-mobile.png` });
  await touch.close();
  await page.goto('/platform/clients');
  await page.route('**/api/clients/select', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Client access changed. Try again.' }),
    }),
  );
  await page.getByRole('button', { name: 'Open workspace for Demo Client 1', exact: true }).click();
  await expect(main.getByRole('alert')).toContainText('Client access changed');
  await expect(
    page.getByRole('button', { name: 'Open workspace for Demo Client 1', exact: true }),
  ).toBeEnabled();
  await page.unroute('**/api/clients/select');
  await page.getByRole('button', { name: 'Open workspace for Demo Client 1', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const chosen = await page.evaluate(async () => (await fetch('/api/auth/context')).json());
  expect(chosen.user).toBeTruthy();
  expect(chosen.client.id).toBe(
    expected.clients.find((c: { name: string }) => c.name === 'Demo Client 1').id,
  );
  expect(errors).toEqual([]);
  const memberContext = await browser.newContext({ baseURL: origin });
  const member = await memberContext.newPage();
  await member.goto('/login');
  await member.getByLabel('Email', { exact: true }).fill('demo.1.3@example.invalid');
  await member.getByLabel('Password', { exact: true }).fill('Isolated fictional member passphrase');
  await member.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(member).toHaveURL(/\/clients$/);
  await member.goto('/platform/clients');
  await expect(member.getByRole('heading', { name: 'Global Admin access required' })).toBeVisible();
  expect((await member.request.get('/api/platform/clients')).status()).toBe(403);
  await memberContext.close();
});

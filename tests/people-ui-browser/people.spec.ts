import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
const screenshots = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright';
test.use({ hasTouch: true });

test('People directory preserves account and Global Admin safeguards on desktop and mobile', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated people administrator passphrase';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function post(path: string, data: Record<string, unknown>) {
    const context = await (await request.get('/api/auth/context')).json();
    const response = await request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: context.csrf },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await post('/auth/setup', {
    name: 'People reviewer',
    email: 'people@example.invalid',
    password,
    demoPassword: 'Isolated fictional member passphrase',
  });
  await post('/auth/login', { email: 'people@example.invalid', password });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('people@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'People & access' })
    .click();
  const main = page.getByRole('main'),
    tabs = page.getByRole('navigation', { name: 'Account directories' });
  const all = tabs.getByRole('button', { name: 'All accounts' }),
    admins = tabs.getByRole('button', { name: 'Global admins' });
  const search = page.getByRole('searchbox', { name: 'Search name or email' });
  async function find(value: string) {
    await search.fill(value);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
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
  await expect(all).toHaveText('All accounts 31');
  await expect(
    main.getByRole('table', { name: 'All accounts', exact: true }).locator('tbody tr'),
  ).toHaveCount(20);
  await expect(main.getByRole('link', { name: 'Add account' })).toHaveAttribute(
    'href',
    '/accounts',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'People & access' }),
  ).toHaveAttribute('aria-current', 'page');
  await a11y();
  await page.screenshot({ path: `${screenshots}/people-light-desktop.png`, fullPage: true });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await page.screenshot({ path: `${screenshots}/people-dark-desktop.png`, fullPage: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(main.getByRole('status')).toHaveText('Showing 21–31 of 31');
  await page.reload();
  await expect(main.getByRole('status')).toHaveText('Showing 21–31 of 31');
  await admins.click();
  await expect(admins).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('table', { name: 'Global admins', exact: true }).locator('tbody tr'),
  ).toHaveCount(1);
  await a11y();
  await page.screenshot({ path: `${screenshots}/people-admins-dark-desktop.png`, fullPage: true });
  const manageOwner = page.getByRole('button', {
    name: 'Manage access for People reviewer',
    exact: true,
  });
  await manageOwner.click();
  const dialog = page.getByRole('dialog', { name: 'Manage access', exact: true });
  await expect(dialog).toHaveCSS('border-top-width', '1px');
  await expect(dialog).toHaveCSS('border-top-style', 'solid');
  await expect(
    dialog.getByText('Protected: the last active Global Admin cannot be removed.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Confirm revocation' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(manageOwner).toBeFocused();
  await page.goBack();
  await expect(main.getByRole('status')).toHaveText('Showing 21–31 of 31');
  await all.click();
  await find('not-a-real-person');
  await expect(
    page.getByText('No accounts match this search. Clear filters or try another name or email.'),
  ).toBeVisible();
  await expect(all).toHaveText('All accounts 31');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(main.getByRole('status')).toHaveText('Showing 1–20 of 31');
  await page.route('**/api/platform/client-accounts?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'People temporarily unavailable.' } }),
  );
  await find('Demo');
  await expect(main.getByRole('alert')).toContainText('People temporarily unavailable.');
  await page.unroute('**/api/platform/client-accounts?*');
  await page.getByRole('button', { name: 'Retry accounts' }).click();
  await expect(main.getByRole('status')).toHaveText('Showing 1–20 of 30');

  await find('demo.1.3@example.invalid');
  const manageMember = page.getByRole('button', {
    name: 'Manage access for Demo Member 1.3',
    exact: true,
  });
  await manageMember.click();
  const clientForm = dialog.getByRole('form', {
    name: 'Manage client access for demo.1.3@example.invalid',
  });
  await a11y();
  await dialog.getByRole('button', { name: 'Confirm appointment' }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm appointment' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.screenshot({ path: `${screenshots}/people-access-dialog-desktop.png` });
  await page.setViewportSize({ width: 375, height: 900 });
  await a11y();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  for (const control of await dialog.locator('select, input:not([type=checkbox]), button').all()) {
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: `${screenshots}/people-access-dialog-mobile.png` });
  await dialog.getByRole('button', { name: 'Confirm appointment' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshots}/people-global-access-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    clientForm
      .getByRole('combobox', { name: 'Action', exact: true })
      .locator('option[value="join"]'),
  ).toHaveCount(0);
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    await db.pool.query(
      "UPDATE users SET permission_version=permission_version+1 WHERE email='demo.1.3@example.invalid'",
    );
    await clientForm.getByRole('combobox', { name: 'Action', exact: true }).selectOption('grant');
    await clientForm
      .getByLabel('Reason', { exact: true })
      .fill('Reviewed People directory client access');
    await clientForm.getByRole('checkbox').check();
    await clientForm.getByRole('button', { name: 'Apply access change' }).click();
    await expect(clientForm.getByRole('alert')).toContainText('This account changed');
    await expect(clientForm.getByRole('button', { name: 'Apply access change' })).toBeDisabled();
    await clientForm.getByRole('button', { name: 'Reload accounts' }).click();
    await manageMember.click();
    await clientForm.getByRole('combobox', { name: 'Action', exact: true }).selectOption('grant');
    await clientForm
      .getByLabel('Reason', { exact: true })
      .fill('Reviewed refreshed People client access');
    await clientForm.getByRole('checkbox').check();
    await clientForm.getByRole('button', { name: 'Apply access change' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(main.getByText('Client Admin', { exact: true })).toBeVisible();
    await manageMember.click();
    const globalForm = dialog.getByRole('form', {
      name: 'Manage Global Admin access for demo.1.3@example.invalid',
    });
    await globalForm
      .getByLabel('Reason', { exact: true })
      .fill('Reviewed temporary Global Admin appointment');
    await globalForm.getByRole('checkbox').check();
    await globalForm.getByRole('button', { name: 'Confirm appointment' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(admins).toHaveText('Global admins 2');
    await admins.click();
    await find('demo.1.3@example.invalid');
    await expect(
      page.getByRole('table', { name: 'Global admins', exact: true }).locator('tbody tr'),
    ).toHaveCount(1);
    await manageMember.click();
    await globalForm
      .getByLabel('Reason', { exact: true })
      .fill('Revoke temporary Global Admin after verification');
    await globalForm.getByRole('checkbox').check();
    await globalForm.getByRole('button', { name: 'Confirm revocation' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(admins).toHaveText('Global admins 1');
    await all.click();
    await find('demo.1.3@example.invalid');
    await manageMember.click();
    await clientForm.getByRole('combobox', { name: 'Action', exact: true }).selectOption('revoke');
    await clientForm
      .getByLabel('Reason', { exact: true })
      .fill('Revoke temporary Client Admin after verification');
    await clientForm.getByRole('checkbox').check();
    await clientForm.getByRole('button', { name: 'Apply access change' }).click();
    await expect(dialog).not.toBeVisible();
    expect(
      (
        await db.pool.query(
          "SELECT r.id FROM role_assignments r JOIN users u ON u.id=r.user_id WHERE u.email='demo.1.3@example.invalid' AND r.role='admin' AND r.ends_at IS NULL",
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await db.close();
  }

  await all.click();
  await expect(main.getByRole('status')).toHaveText('Showing 1–20 of 31');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await page.screenshot({ path: `${screenshots}/people-dark-mobile.png`, fullPage: true });
  await admins.click();
  await expect(
    page.getByText('The last active Global Admin cannot be removed.', { exact: true }),
  ).toBeVisible();
  await a11y();
  await page.screenshot({ path: `${screenshots}/people-admins-dark-mobile.png`, fullPage: true });
  await manageOwner.click();
  await a11y();
  await page.keyboard.press('Escape');
  const settingsNav = page.getByRole('navigation', { name: 'Mobile platform navigation' });
  await page.getByRole('button', { name: 'Personal settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await settings.locator('summary').filter({ hasText: 'Theme' }).click();
  await settings.getByRole('button', { name: 'Light', exact: true }).click();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await a11y();
  await page.screenshot({ path: `${screenshots}/people-admins-light-mobile.png`, fullPage: true });
  expect(
    await page
      .locator(
        'img[src^="/images/people/"],img[src^="/images/overview/"],img[src^="/images/clients/"]',
      )
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
  const touch = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const mobile = await touch.newPage();
  await mobile.goto('/platform/people');
  await expect(mobile.getByRole('button', { name: 'All accounts' })).toHaveText('All accounts 31');
  for (const control of [
    mobile.getByRole('link', { name: 'Add account' }),
    mobile.getByRole('button', { name: 'Search', exact: true }),
    mobile.getByRole('button', { name: 'Manage access for Demo Member 1.3', exact: true }),
    mobile.getByRole('button', { name: 'Page 1', exact: true }),
  ])
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await touch.close();
  const member = await browser.newContext({ baseURL: origin });
  const memberPage = await member.newPage();
  await memberPage.goto('/login');
  await memberPage.getByLabel('Email', { exact: true }).fill('demo.3.9@example.invalid');
  await memberPage
    .getByLabel('Password', { exact: true })
    .fill('Isolated fictional member passphrase');
  await memberPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(memberPage).not.toHaveURL(/\/login$/);
  await memberPage.goto('/platform/people');
  await expect(
    memberPage.getByRole('heading', { name: 'Global Admin access required' }),
  ).toBeVisible();
  expect((await member.request.get('/api/platform/client-accounts?view=admins')).status()).toBe(
    403,
  );
  await member.close();
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const screenshotDir = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright';

test('Overview design uses live scoped data, preserves access, and works on desktop and mobile', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated overview admin passphrase';
  const demoPassword = 'Isolated fictional member passphrase';
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
    name: 'Overview reviewer',
    email: 'overview@example.invalid',
    password,
    demoPassword,
  });
  await post('/auth/login', { email: 'overview@example.invalid', password });
  for (let i = 1; i <= 3; i++)
    await post('/platform/clients', {
      id: null,
      version: 0,
      name: 'Overview QA client ' + i,
      reason: 'Isolated Overview activity verification',
    });
  const expected = await (await request.get('/api/platform/overview')).json();
  const accounts = await (await request.get('/api/platform/client-accounts')).json();
  const audit = await (await request.get('/api/platform/audit')).json();
  // Protected-page context failures use the shared guest system before a session resolves.
  await page.route('**/api/auth/context', (route) =>
    route.fulfill({ status: 503, json: { message: 'Session temporarily unavailable.' } }),
  );
  await page.goto('/platform');
  await expect(page.locator('[data-guest-shell="session"]')).toBeVisible();
  await expect(page.getByText('Session temporarily unavailable.', { exact: true })).toBeVisible();
  await expect(page.locator('[data-application-shell], .app-sidebar, .guest-header')).toHaveCount(
    0,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    const retry = page.getByRole('button', { name: 'Try loading again', exact: true });
    await retry.focus();
    await expect(retry).toBeFocused();
    if (width <= 800) expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${screenshotDir}/session-error-${width}.png`, fullPage: true });
  }
  await page.unroute('**/api/auth/context');
  await page.getByRole('button', { name: 'Try loading again', exact: true }).press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('overview@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await expect(
    page.getByText('What needs attention across the platform.', { exact: true }),
  ).toHaveCSS('margin-top', '8px');
  const main = page.getByRole('main');
  await expect(
    main.getByRole('link', { name: 'Manage clients', exact: true }).locator('strong'),
  ).toHaveText(String(expected.clients));
  await expect(
    main
      .getByRole('link', { name: 'Accounts — active accounts with active sign-in identities' })
      .locator('strong'),
  ).toHaveText(String(accounts.total));
  const activity = page.getByRole('region', { name: 'Recent administrative activity' });
  await expect(activity.getByRole('listitem')).toHaveCount(3);
  const title = (action: string) => {
    const value = action.replace(/[._]/g, ' ');
    return value.charAt(0).toUpperCase() + value.slice(1);
  };
  for (let i = 0; i < 3; i++)
    await expect(activity.getByRole('listitem').nth(i)).toContainText(
      title(audit.events[i].action),
    );

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
  await page.screenshot({ path: `${screenshotDir}/overview-light-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await accessibility();
  await page.screenshot({ path: `${screenshotDir}/overview-dark-desktop.png`, fullPage: true });

  // All exported assets must load at their intrinsic Figma dimensions.
  const assetErrors = await page.locator('img[src^="/images/overview/"]').evaluateAll((images) =>
    images.flatMap((node) => {
      const image = node as HTMLImageElement;
      if (!image.getClientRects().length) return [];
      const box = image.getBoundingClientRect();
      return image.complete &&
        image.naturalWidth > 0 &&
        box.width === image.naturalWidth &&
        box.height === image.naturalHeight
        ? []
        : [image.src];
    }),
  );
  expect(assetErrors).toEqual([]);

  const status = page.getByRole('button', { name: 'View system status' }).first();
  await status.click();
  const system = page.getByRole('dialog', { name: 'System overview' });
  await expect(system.getByText('Password sign-in', { exact: true })).toBeVisible();
  await accessibility();
  await page.keyboard.press('Escape');
  await expect(status).toBeFocused();
  await main.getByRole('link', { name: 'Review access', exact: true }).click();
  await expect(page).toHaveURL(/\/platform\/admins$/);
  await expect(page.getByRole('heading', { name: 'Global admins', exact: true })).toBeVisible();
  await page.goto('/platform');
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'People & access' })
    .click();
  await expect(page).toHaveURL(/\/platform\/people$/);
  await expect(page.getByRole('heading', { name: 'People & access' })).toBeVisible();
  await page.goto('/platform');

  // One section failing does not remove working metrics, and retry restores real data.
  await page.route('**/api/platform/audit', (route) =>
    route.fulfill({ status: 503, json: { message: 'Activity temporarily unavailable.' } }),
  );
  await page.route('**/api/platform/client-accounts', (route) =>
    route.fulfill({ status: 503, json: { message: 'Account count temporarily unavailable.' } }),
  );
  await page.reload();
  await expect(page.getByText('Activity temporarily unavailable.')).toBeVisible();
  await expect(page.getByText('Account count temporarily unavailable.')).toBeVisible();
  await expect(
    main.getByRole('link', { name: 'Manage clients', exact: true }).locator('strong'),
  ).toHaveText(String(expected.clients));
  await page.unroute('**/api/platform/audit');
  await page.unroute('**/api/platform/client-accounts');
  await page.getByRole('button', { name: 'Retry recent activity' }).click();
  await page.getByRole('button', { name: 'Retry account count' }).click();
  await expect(activity.getByRole('listitem')).toHaveCount(3);
  await expect(main.getByRole('link', { name: /^Accounts —/ }).locator('strong')).toHaveText(
    String(accounts.total),
  );

  // Explicit response fixtures exercise empty states without altering the saved installation.
  await page.route('**/api/platform/overview', (route) =>
    route.fulfill({
      json: { ...expected, clients: 0, activeAdmins: 2, emailConfigured: true, aiConfigured: true },
    }),
  );
  await page.route('**/api/platform/audit', (route) => route.fulfill({ json: { events: [] } }));
  await page.reload();
  await expect(page.getByRole('link', { name: 'Create first client' })).toBeVisible();
  await expect(page.getByText('No administrative activity recorded yet.')).toBeVisible();
  await expect(page.getByText('No configuration notices.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'View system status' }).click();
  await expect(system.getByText('Configured; delivery not verified here')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('**/api/platform/overview');
  await page.unroute('**/api/platform/audit');
  await page.reload();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole('navigation', { name: 'Mobile platform navigation' });
  await expect(mobile).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeHidden();
  await accessibility();
  await page.setViewportSize({ width: 390, height: 1458 });
  await page.screenshot({ path: `${screenshotDir}/overview-dark-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Personal settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await expect(settings.getByRole('link', { name: 'Account security', exact: true })).toBeVisible();
  await expect(settings.getByRole('link', { name: 'Global admins', exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(settings.getByRole('button', { name: /^Theme(?: |$)/ })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await settings.getByRole('button', { name: /^Theme(?: |$)/ }).click();
  await settings.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Exercise the shared dialog's field boundary with an isolated DOM fixture. The old
  // button-only focus list skipped fields at either edge of a form dialog.
  await settings.evaluate((dialog) => {
    const field = document.createElement('input');
    field.setAttribute('aria-label', 'Dialog keyboard fixture');
    field.dataset.keyboardFixture = 'true';
    dialog.append(field);
    const disabled = document.createElement('fieldset');
    disabled.disabled = true;
    disabled.dataset.keyboardFixture = 'true';
    disabled.append(document.createElement('input'));
    dialog.append(disabled);
  });
  const fixture = settings.getByRole('textbox', { name: 'Dialog keyboard fixture' });
  await settings.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(fixture).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await settings
    .locator('[data-keyboard-fixture]')
    .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Personal settings' })).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await accessibility();
  await page.setViewportSize({ width: 390, height: 1458 });
  await page.screenshot({ path: `${screenshotDir}/overview-light-mobile.png`, fullPage: true });
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await accessibility();
  }
  const touchContext = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const touch = await touchContext.newPage();
    await touch.goto(origin + '/platform');
    await expect(touch.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
    expect(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    for (const action of await touch.getByRole('button', { name: 'View system status' }).all()) {
      expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await touch.getByRole('button', { name: 'Personal settings' }).tap();
    await expect(
      touch.getByRole('dialog', { name: 'Personal settings', exact: true }),
    ).toBeVisible();
    await touch
      .getByRole('dialog', { name: 'Personal settings', exact: true })
      .getByRole('button', { name: 'Close', exact: true })
      .tap();
    await touch.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const footer = await touch.locator('footer').boundingBox();
    const bottomNav = await touch
      .getByRole('navigation', { name: 'Mobile platform navigation' })
      .boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(bottomNav!.y);
    await touch.screenshot({ path: `${screenshotDir}/overview-touch-mobile.png` });
  } finally {
    await touchContext.close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Workspace / }).click();
  await page.getByRole('link', { name: 'Choose your client' }).click();
  await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Workspace menu' });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill('demo.1.3@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await page.goto('/platform');
  await expect(page.getByRole('heading', { name: 'Global Admin access required' })).toBeVisible();
  expect((await page.request.get('/api/platform/overview')).status()).toBe(403);
  expect((await page.request.get('/api/platform/audit')).status()).toBe(403);
  expect((await page.request.get('/api/platform/client-accounts')).status()).toBe(403);
  expect(errors).toEqual([]);
});

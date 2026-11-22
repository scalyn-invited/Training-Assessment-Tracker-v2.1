import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';
const screenshots = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright';

test('Settings preserves versioned branding, previews, status and permissions on desktop/mobile', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated Settings admin passphrase';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(route: string, values: Record<string, unknown>) {
    const context = await (await request.get('/api/auth/context')).json();
    const response = await request.post('/api' + route, {
      headers: { Origin: origin },
      data: { ...values, csrf: context.csrf },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await post('/auth/setup', {
    name: 'Settings reviewer',
    email: 'settings@example.invalid',
    password,
    demoPassword: 'Isolated demonstration member passphrase',
  });
  await post('/auth/login', { email: 'settings@example.invalid', password });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('settings@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await page.setViewportSize({ width: 1440, height: 1040 });
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings' })
    .click();
  const form = page.getByRole('form', { name: 'Platform appearance' });
  const name = form.getByLabel('Platform display name', { exact: true });
  const reason = form.getByLabel('Reason for change', { exact: true });
  const save = form.getByRole('button', { name: 'Save appearance', exact: true });
  const sections = page.getByRole('navigation', { name: 'Settings sections' });
  async function a11y() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await expect(name).toHaveValue('Scalyn');
  await expect(
    page.getByText(
      'Platform defaults inherited by all clients. Client settings and personal themes take precedence.',
      { exact: true },
    ),
  ).toHaveCSS('margin-top', '8px');
  await name.focus();
  await page.keyboard.press('Tab');
  await expect(form.getByLabel('Application name', { exact: true })).toBeFocused();
  await sections.getByRole('link', { name: 'Appearance', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(sections.getByRole('link', { name: 'System status' })).toBeFocused();
  await a11y();
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await page.screenshot({ path: `${screenshots}/settings-appearance-desktop.png`, fullPage: true });
  await sections.getByRole('link', { name: 'System status' }).click();
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(page.getByText('Password sign-in', { exact: true })).toBeVisible();
  await expect(page.getByText('Email is not configured', { exact: true })).toBeVisible();
  await expect(page.getByText('AI generation is not configured', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
  await a11y();
  await page.screenshot({ path: `${screenshots}/settings-status-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 1000 });
  await a11y();
  await page.screenshot({ path: `${screenshots}/settings-status-mobile.png`, fullPage: true });
  await sections.getByRole('link', { name: 'Appearance', exact: true }).click();
  await expect(name).toHaveValue('Scalyn');
  await expect(name).toHaveCSS('font-size', '16px');
  await expect(form.getByLabel('Default theme')).toHaveCSS('font-size', '16px');
  await a11y();
  await page.setViewportSize({ width: 390, height: 1900 });
  await page.screenshot({ path: `${screenshots}/settings-appearance-mobile.png`, fullPage: true });
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 1440, height: 1040 });
  await name.fill('Unsaved preview');
  await form.getByLabel('Brand colour hex value').fill('#224466');
  await expect(
    page
      .getByRole('complementary', { name: 'Live appearance preview' })
      .getByRole('heading', { name: 'Unsaved preview', exact: true }),
  ).toHaveCount(2);
  expect((await (await request.get('/api/branding')).json()).displayName).toBe('Scalyn');
  await form.getByRole('button', { name: 'Discard changes' }).click();
  await expect(name).toHaveValue('Scalyn');
  await expect(reason).toHaveValue('');
  await name.fill('Reviewed platform');
  await reason.fill('short');
  await save.click();
  expect((await (await request.get('/api/branding')).json()).displayName).toBe('Scalyn');
  await reason.fill('Isolated Settings browser verification');
  const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#224466' } })
    .png()
    .toBuffer();
  await form
    .locator('input[type=file]')
    .setInputFiles({ name: 'review-logo.png', mimeType: 'image/png', buffer: png });
  await save.click();
  await expect(page.getByText('Platform appearance saved.', { exact: true })).toBeVisible();
  await expect(form.getByRole('img', { name: 'Current platform logo' })).toBeVisible();
  await expect(reason).toHaveValue('');
  await page.reload();
  await expect(name).toHaveValue('Reviewed platform');
  const saved = await (await request.get('/api/branding')).json();
  expect(saved.customLogo).toBe(true);
  const audit = await (
    await request.get('/api/platform/audit?action=platform.appearance.saved')
  ).json();
  expect(
    audit.events.some(
      (e: { reason: string }) => e.reason === 'Isolated Settings browser verification',
    ),
  ).toBe(true);
  // Another editor wins; the stale form must preserve the draft and refuse overwrite.
  await post('/branding', {
    clientId: null,
    version: saved.version,
    displayName: 'Concurrent edit',
    appName: saved.appName,
    mode: 'white-label',
    accent: saved.accent,
    theme: saved.theme,
    reason: 'Concurrent administrator verification',
  });
  await name.fill('Stale draft');
  await reason.fill('Attempt stale browser update');
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Branding changed while you were editing',
  );
  await expect(name).toHaveValue('Stale draft');
  expect((await (await request.get('/api/branding')).json()).displayName).toBe('Concurrent edit');
  await page.getByRole('button', { name: 'Reload appearance', exact: true }).click();
  await expect(name).toHaveValue('Concurrent edit');
  await form.getByLabel('Remove custom logo').check();
  await reason.fill('Remove synthetic test logo');
  await save.click();
  await expect(form.getByRole('img', { name: 'Current platform logo' })).toHaveCount(0);
  await form
    .locator('input[type=file]')
    .setInputFiles({ name: 'oversize.png', mimeType: 'image/png', buffer: Buffer.alloc(2097153) });
  await reason.fill('Reject oversized logo upload');
  await save.click();
  await expect(page.getByText('Logo must be no larger than 2 MB.', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Discard changes' }).click();
  await expect(reason).toHaveValue('');
  await form.locator('input[type=file]').setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await reason.fill('Reject invalid logo contents');
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  expect((await (await request.get('/api/branding')).json()).customLogo).toBe(false);
  await form.getByRole('button', { name: 'Discard changes' }).click();
  await expect(reason).toHaveValue('');
  // A failed status request offers recovery; configured is never described as verified.
  let fail = true;
  await page.route('**/api/platform/overview', async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({ status: 503, json: { message: 'Temporary status failure' } });
    } else await route.continue();
  });
  await sections.getByRole('link', { name: 'System status' }).click();
  await expect(page.getByText('Temporary status failure', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry system status' }).click();
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await page.unroute('**/api/platform/overview');
  await page.route('**/api/platform/overview', (route) =>
    route.fulfill({
      json: {
        clients: 3,
        assignments: 1,
        identityMode: 'mock',
        emailConfigured: true,
        aiConfigured: true,
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByText('Configured; delivery not verified here', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Configured; provider access not verified here', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Local mock sign-in', { exact: true })).toBeVisible();
  await page.unroute('**/api/platform/overview');
  await page.goBack();
  await expect(name).toBeVisible();
  await page.goto('/platform/appearance');
  await expect(name).toHaveValue('Concurrent edit');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Personal settings' }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await expect(personal.getByRole('link', { name: 'Account security' })).toBeVisible();
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Light', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await a11y();
  for (const theme of [
    'neon-cyan',
    'neon-emerald',
    'neon-amber',
    'platform-light',
    'platform-dark',
  ]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await a11y();
  }
  const touch = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const touchPage = await touch.newPage();
    await touchPage.goto(origin + '/platform/settings');
    const action = touchPage.getByRole('button', { name: 'Save appearance', exact: true });
    await expect(action).toBeVisible();
    expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await touchPage.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const footer = await touchPage.locator('footer').boundingBox();
    const nav = await touchPage
      .getByRole('navigation', { name: 'Mobile platform navigation' })
      .boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(nav!.y);
  } finally {
    await touch.close();
  }
  const restricted = await browser.newContext();
  try {
    const member = await restricted.newPage();
    await member.goto(origin + '/login');
    await member.getByLabel('Email', { exact: true }).fill('demo.1.3@example.invalid');
    await member
      .getByLabel('Password', { exact: true })
      .fill('Isolated demonstration member passphrase');
    await member.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(member).not.toHaveURL(/\/login$/);
    for (const path of [
      '/platform/settings',
      '/platform/settings/status',
      '/platform/appearance',
    ]) {
      await member.goto(origin + path);
      await expect(
        member.getByRole('heading', { name: 'Global Admin access required' }),
      ).toBeVisible();
      await expect(member.getByRole('button', { name: 'Save appearance' })).toHaveCount(0);
    }
    const denial = await restricted.request.get(origin + '/api/platform/overview');
    expect(denial.status()).toBe(403);
  } finally {
    await restricted.close();
  }
  expect(errors).toEqual([]);
});

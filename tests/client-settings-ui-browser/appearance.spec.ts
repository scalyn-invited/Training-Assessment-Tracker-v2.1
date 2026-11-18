import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import sharp from 'sharp';

test('client Appearance preserves branding, personal precedence, logo safeguards and editor authority', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated appearance administrator password';
  const demo = 'Isolated appearance demonstration password';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    const response = await page.request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok(), await response.text()).toBe(true);
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
  async function screenshot(file: string) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: 'output/playwright/client-settings/' + file, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Appearance reviewer',
    email: 'appearance-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/settings/appearance');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'appearance-ui@example.invalid', password });
  await page.goto('/settings/appearance');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  const otherClient = clients.find((c: { name: string }) => c.name === 'Demo Client 2').id;
  await post('/clients/select', { clientId: client });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/branding?clientId=*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/settings/appearance');
  await expect(page.getByText('Loading appearance settings', { exact: false })).toBeVisible();
  release();
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Client branding', exact: true }) });
  const name = section.getByLabel('Client name', { exact: true });
  const app = section.getByLabel('Application name', { exact: true });
  const hex = section.getByLabel('Brand colour hex value', { exact: true });
  const mode = section.getByRole('combobox', { name: 'Branding mode', exact: true });
  const theme = section.getByRole('combobox', { name: 'Default theme', exact: true });
  const save = section.getByRole('button', { name: 'Save client branding', exact: true });
  const discard = section.getByRole('button', { name: 'Discard changes', exact: true });
  const gallery = page.getByRole('group', { name: 'Workspace theme', exact: true });
  await expect(name).toHaveValue('Scalyn');
  await page.unroute('**/api/branding?clientId=*');
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Appearance', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await mode.focus();
  await page.keyboard.press('Tab');
  await expect(name).toBeFocused();
  await gallery.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(gallery.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await a11y();
  await screenshot('appearance-desktop.png');
  for (const width of [320, 390, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(name).toHaveCSS('font-size', '16px');
  await screenshot('appearance-mobile.png');
  await name.fill('Unsaved client branding');
  await hex.fill('#7255a4');
  expect(
    (await (await page.request.get('/api/branding?clientId=' + client)).json()).displayName,
  ).toBe('Scalyn');
  await expect(section.getByRole('region', { name: 'light theme preview' })).toBeVisible();
  await discard.click();
  await expect(name).toHaveValue('Scalyn');
  await hex.fill('#zzzzzz');
  await save.click();
  expect(await hex.evaluate((el: HTMLInputElement) => el.validity.patternMismatch)).toBe(true);
  await hex.fill('#7255a4');
  await name.fill('Reviewed client');
  await app.fill('Reviewed learning');
  await mode.selectOption('co-branded');
  await theme.selectOption('client-dark');
  await section.getByText('Logo', { exact: true }).click();
  const file = section.locator('input[type=file]');
  const png = await sharp({ create: { width: 40, height: 40, channels: 4, background: '#7255a4' } })
    .png()
    .toBuffer();
  await file.setInputFiles({ name: 'client-test-logo.png', mimeType: 'image/png', buffer: png });
  await save.click();
  await expect(
    page.getByText('Client branding saved. Personal theme choices remain unchanged.', {
      exact: true,
    }),
  ).toBeVisible();
  await section.getByText('Logo', { exact: true }).click();
  await expect(section.getByRole('img', { name: 'Current logo' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(name).toHaveValue('Reviewed client');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Use client default', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await a11y();
  await gallery.getByRole('button', { name: 'Client Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-light');
  await a11y();
  await screenshot('appearance-branded-mobile.png');
  // A concurrent branding edit must reject the stale save and retain entered values.
  const saved = await (await page.request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: saved.version,
    displayName: 'Concurrent client edit',
    appName: saved.appName,
    accent: saved.accent,
    mode: 'white-label',
    theme: 'client-dark',
    reason: 'Isolated concurrent branding editor',
  });
  await name.fill('Stale client draft');
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Branding changed while you were editing',
  );
  await expect(name).toHaveValue('Stale client draft');
  await page.getByRole('button', { name: 'Reload appearance', exact: true }).click();
  await expect(name).toHaveValue('Concurrent client edit');
  await section.getByText('Logo', { exact: true }).click();
  await section.getByLabel('Remove custom logo').check();
  await save.click();
  await expect(
    page.getByText('Client branding saved. Personal theme choices remain unchanged.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get('/api/branding?clientId=' + client)).json()).customLogo,
  ).toBe(false);
  await section.getByText('Logo', { exact: true }).click();
  await file.setInputFiles({
    name: 'oversize.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(2097153),
  });
  await save.click();
  await expect(page.getByText('Logo must be no larger than 2 MB.', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('Concurrent client edit');
  await discard.click();
  await expect(name).toHaveValue('Concurrent client edit');
  await section.getByText('Logo', { exact: true }).click();
  await file.setInputFiles({
    name: 'invalid.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid synthetic image'),
  });
  await save.click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  expect(
    (await (await page.request.get('/api/branding?clientId=' + client)).json()).customLogo,
  ).toBe(false);
  await discard.click();
  await expect(name).toHaveValue('Concurrent client edit');
  await page.route('**/api/branding', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { message: 'Synthetic branding outage.' } })
      : route.continue(),
  );
  await name.fill('Recovered client');
  await save.click();
  await expect(page.getByText('Synthetic branding outage.')).toBeVisible();
  await expect(name).toHaveValue('Recovered client');
  await page.unroute('**/api/branding');
  await save.click();
  await expect(
    page.getByText('Client branding saved. Personal theme choices remain unchanged.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.route('**/api/branding/preference', (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic preference outage.' } }),
  );
  await gallery.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.getByText('Synthetic preference outage.')).toBeVisible();
  await page.unroute('**/api/branding/preference');
  await gallery.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Read failure is recoverable without a blank, inert page.
  await page.route('**/api/branding?clientId=*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic appearance load outage.' } }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reload appearance', exact: true })).toBeVisible();
  await page.unroute('**/api/branding?clientId=*');
  await page.getByRole('button', { name: 'Reload appearance', exact: true }).click();
  await expect(name).toHaveValue('Recovered client');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('combobox', { name: 'Active client', exact: true })
    .selectOption(otherClient);
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/settings/appearance');
  await expect(name).toHaveValue('Scalyn');
  const other = await (await page.request.get('/api/branding?clientId=' + otherClient)).json();
  expect(other.preference).toBeNull();
  for (const [email, allowed] of [
    ['demo.1.0@example.invalid', true],
    ['demo.1.1@example.invalid', false],
    ['demo.1.3@example.invalid', false],
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
      let user = await (await p.request.get('/api/auth/context')).json();
      expect(
        (
          await p.request.post('/api/clients/select', {
            headers: { Origin: origin },
            data: { csrf: user.csrf, clientId: client },
          })
        ).ok(),
      ).toBe(true);
      await p.goto('/settings/appearance');
      const personal = p.getByRole('group', { name: 'Workspace theme', exact: true });
      await personal.getByRole('button', { name: 'Dark', exact: true }).click();
      await expect(p.locator('html')).toHaveAttribute('data-theme', 'dark');
      if (allowed) {
        await p
          .getByRole('combobox', { name: 'Branding mode', exact: true })
          .selectOption('cerebru');
        await p.getByRole('button', { name: 'Save client branding', exact: true }).click();
        await expect(
          p.getByText('Client branding saved. Personal theme choices remain unchanged.', {
            exact: true,
          }),
        ).toBeVisible();
        expect((await p.locator('input[type=color]').boundingBox())!.height).toBeGreaterThanOrEqual(
          44,
        );
      } else {
        await expect(p.getByRole('heading', { name: 'Client branding', exact: true })).toHaveCount(
          0,
        );
        user = await (await p.request.get('/api/auth/context')).json();
        const b = await (await p.request.get('/api/branding?clientId=' + client)).json();
        expect(
          (
            await p.request.post('/api/branding', {
              headers: { Origin: origin },
              data: {
                csrf: user.csrf,
                clientId: client,
                version: b.version,
                displayName: 'Denied change',
                appName: b.appName,
                accent: b.accent,
                mode: b.mode,
                theme: b.savedTheme,
                reason: 'Denied UI verification',
              },
            })
          ).status(),
        ).toBe(403);
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

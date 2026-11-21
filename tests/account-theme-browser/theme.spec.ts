import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const evidence = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright/account-theme';
test('Learning account routes retain the selected workspace appearance', async ({ page }) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const post = async (path: string, data: Record<string, unknown>) => {
    const context = await (await page.request.get('/api/auth/context')).json();
    const response = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: context.csrf },
    });
    expect(response.ok(), path).toBe(true);
    return response.json();
  };
  // Existing isolated account-suite credentials; never use the operator database.
  await post('/auth/setup', {
    name: 'Account theme reviewer',
    email: 'account-theme@example.invalid',
    password: 'Isolated account shell passphrase',
    demoPassword: 'Isolated account demo passphrase',
  });
  await post('/auth/login', {
    email: 'account-theme@example.invalid',
    password: 'Isolated account shell passphrase',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((row: { name: string }) => row.name === 'Demo Client 2');
  // With no selected client, account tools retain their shared theme picker.
  await page.goto('/account/security');
  await expect(page.getByRole('heading', { name: 'Account security', exact: true })).toBeVisible();
  await page.locator('summary:visible').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await post('/clients/select', { clientId: client.id });
  const branding = await (await page.request.get('/api/branding?clientId=' + client.id)).json();
  await post('/branding', {
    clientId: client.id,
    version: branding.version,
    displayName: 'Account theme client',
    appName: 'Account theme QA',
    accent: '#206070',
    mode: 'white-label',
    theme: 'dark',
    reason: 'Isolated account appearance qualification',
  });
  const palettes = [
    'dark',
    'light',
    'neon-cyan',
    'neon-emerald',
    'neon-amber',
    'platform-light',
    'platform-dark',
    'client-light',
    'client-dark',
  ];
  for (const theme of palettes) {
    const brand = await (await page.request.get('/api/branding?clientId=' + client.id)).json();
    await post('/branding/preference', {
      clientId: client.id,
      version: brand.preferenceVersion,
      theme,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/dashboard');
    await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const reference = await page.locator('main').evaluate((el) => {
      const style = getComputedStyle(el);
      return ['--ui-background', '--ui-surface', '--ui-text', '--ui-border', '--ui-accent'].map(
        (key) => style.getPropertyValue(key),
      );
    });
    await page.screenshot({ path: `${evidence}/${theme}-dashboard.png`, fullPage: true });
    for (const [route, title, link] of [
      ['/accounts', 'Accounts', 'Account access'],
      ['/account/security', 'Account security', 'Account security'],
    ]) {
      await page
        .locator('a[href="' + route + '"]:visible')
        .filter({ hasText: link })
        .first()
        .click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Active client', exact: true })).toHaveValue(
        client.id,
      );
      const slug = route.replaceAll('/', '-');
      await page.screenshot({ path: `${evidence}/${theme}${slug}-desktop.png`, fullPage: true });
      await expect.soft(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect
        .soft(
          await page.locator('main').evaluate((el) => {
            const style = getComputedStyle(el);
            return [
              '--ui-background',
              '--ui-surface',
              '--ui-text',
              '--ui-border',
              '--ui-accent',
            ].map((key) => style.getPropertyValue(key));
          }),
        )
        .toEqual(reference);
      // Fresh documents exercise the server resolver as well as SPA navigation.
      await page.reload();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect.soft(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const width of [390, 800]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({ path: `${evidence}/${theme}${slug}-${width}.png`, fullPage: true });
      }
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  // The account picker writes the client preference, not the platform browser preference.
  await page.locator('summary:visible').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Back to workspace', exact: true }).click();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/platform');
  await expect(page.locator('[data-application-shell="platform"]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

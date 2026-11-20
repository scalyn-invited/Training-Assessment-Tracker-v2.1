import { test, expect } from '@playwright/test';

const colors: Record<string, string> = {
  light: 'rgb(244, 248, 251)',
  dark: 'rgb(7, 11, 22)',
  'neon-cyan': 'rgb(7, 13, 17)',
  'neon-emerald': 'rgb(8, 15, 13)',
  'neon-amber': 'rgb(16, 13, 8)',
  'platform-light': 'rgb(238, 244, 250)',
  'platform-dark': 'rgb(17, 34, 51)',
};
for (const theme of Object.keys(colors))
  test(`${theme}: pre-hydration palette, native scheme, reload and OS independence`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
    await page.addInitScript(
      (value) => localStorage.setItem('training.v21.appearance.platform.guest', value),
      theme,
    );
    let release!: () => void;
    const hydration = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/_next/**/*.js*', async (route) => {
      await hydration;
      await route.continue();
    });
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('body')).toHaveCSS('background-color', colors[theme]);
    await expect(page.locator('html')).toHaveCSS(
      'color-scheme',
      theme.endsWith('light') ? 'light' : 'dark',
    );
    release();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  });

for (const mode of ['missing', 'malformed', 'blocked'])
  test(`${mode} storage uses configured generated default before hydration`, async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'default-dark', value: '1', url: 'http://127.0.0.1:3280' }]);
    await page.addInitScript((kind) => {
      if (kind === 'malformed')
        localStorage.setItem('training.v21.appearance.platform.guest', 'system');
      if (kind === 'blocked')
        Object.defineProperty(window, 'localStorage', {
          get() {
            throw new DOMException('Denied', 'SecurityError');
          },
        });
    }, mode);
    await page.route('**/_next/**/*.js*', (route) => route.abort());
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-dark');
    await expect(page.locator('body')).toHaveCSS('background-color', colors['platform-dark']);
  });

for (const scope of ['shared', 'client'])
  test(`${scope} identity never temporarily uses guest override`, async ({ page, context }) => {
    await context.addCookies([
      { name: 'tracker_session', value: scope, url: 'http://127.0.0.1:3280' },
    ]);
    await page.addInitScript(() => {
      localStorage.setItem('training.v21.appearance.platform.guest', 'neon-amber');
      localStorage.setItem('training.v21.appearance.platform.test.shared-user', 'dark');
      localStorage.setItem('training.v21.appearance.platform.test.client-user', 'light');
    });
    let release!: () => void;
    const session = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/auth/context', async (route) => {
      await session;
      await route.continue();
    });
    await page.goto(scope === 'shared' ? '/account/security' : '/dashboard', {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      scope === 'shared' ? 'dark' : 'client-dark',
    );
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      scope === 'shared' ? colors.dark : colors['platform-dark'],
    );
    // Inspect a frame with hydration complete but session still pending.
    await expect(
      page.getByRole('button', { name: 'Dark', exact: true, includeHidden: true }),
    ).toBeDisabled();
    release();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      scope === 'shared' ? 'dark' : 'client-dark',
    );
  });

test('reset returns to configured default and survives reload', async ({ page, context }) => {
  await context.addCookies([{ name: 'default-dark', value: '1', url: 'http://127.0.0.1:3280' }]);
  await page.goto('/login');
  await page.locator('summary').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('summary').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name: 'Use platform default' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-dark');
});

test('return navigation does not replay an obsolete document default', async ({
  page,
  context,
}) => {
  await page.goto('/account/link');
  await expect(page.locator('.theme-current')).toHaveText('Light');
  await context.addCookies([{ name: 'default-dark', value: '1', url: 'http://127.0.0.1:3280' }]);
  await page.locator('[data-guest-shell] > header a').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-dark');
  await page.goBack();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-dark');
  await expect(page.locator('.theme-current')).toHaveText('Platform Dark');
});

test('appearance failure keeps saved built-in theme and exposes retry without blanking', async ({
  page,
  context,
}) => {
  await context.addCookies([{ name: 'brand-failure', value: '1', url: 'http://127.0.0.1:3280' }]);
  await page.addInitScript(() =>
    localStorage.setItem('training.v21.appearance.platform.guest', 'dark'),
  );
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Retry appearance', exact: true })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await context.clearCookies();
  await page.getByRole('button', { name: 'Retry appearance', exact: true }).click();
  await expect(page.locator('[data-guest-shell] > header')).toContainText('Scalyn');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

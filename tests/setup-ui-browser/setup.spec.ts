import { test, expect } from '@playwright/test';
import { setupA11y, setupTheme, setupShot } from '../setup-ui-checks.js';

test('legacy initializer keeps review, validation, failed retry and installation closure', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.route('**/api/auth/context', (r) =>
    r.fulfill({ status: 503, json: { message: 'Session temporarily unavailable.' } }),
  );
  await page.goto('/setup');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Session temporarily unavailable',
  );
  await page.unroute('**/api/auth/context');
  await page.getByRole('button', { name: 'Try loading again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Before we begin' })).toBeVisible();
  await setupTheme(page, 'Dark');
  await page.setViewportSize({ width: 1440, height: 900 });
  await setupA11y(page);
  for (const theme of ['neon-cyan', 'platform-dark']) {
    await page.evaluate(
      (t) => localStorage.setItem('training.v21.appearance.platform.guest', t),
      theme,
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await setupA11y(page);
  }
  await setupTheme(page, 'Light');
  await page.setViewportSize({ width: 320, height: 844 });
  await setupA11y(page);
  await page.getByRole('button', { name: 'Continue to administrator' }).click();
  await page.getByRole('button', { name: 'Review installation' }).click();
  await expect(page.getByLabel('Your name', { exact: true })).toBeFocused();
  await page.getByLabel('Your name', { exact: true }).fill('Setup UI owner');
  await page.getByLabel('Email address', { exact: true }).fill('setup-owner@example.invalid');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('banner').getByRole('link').click();
  await expect(page).toHaveURL(/\/setup$/);
  const password = 'Isolated legacy setup passphrase';
  await page.getByLabel('Administrator password', { exact: true }).fill(password);
  await page
    .getByLabel('Demo account password', { exact: true })
    .fill('Different isolated demo passphrase');
  await page.getByRole('button', { name: 'Review installation' }).click();
  await expect(page.getByRole('heading', { name: 'Review and install' })).toBeFocused();
  await expect(page.getByRole('main')).not.toContainText(password);
  await setupA11y(page);
  await setupShot(page, 'legacy-review-mobile');
  await page.route('**/api/auth/setup', (r) =>
    r.fulfill({ status: 503, json: { message: 'Installation unavailable. Try again.' } }),
  );
  await page.getByRole('button', { name: 'Install workspace' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Installation unavailable');
  await expect(page.getByText('setup-owner@example.invalid', { exact: true })).toBeVisible();
  await page.unroute('**/api/auth/setup');
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/auth/setup', async (r) => {
    await pending;
    await r.continue();
  });
  await page.getByRole('button', { name: 'Install workspace' }).click();
  await expect(page.getByRole('button', { name: 'Installing…' })).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    void d.accept();
  });
  await page.getByRole('banner').getByRole('link').click();
  await expect(page).toHaveURL(/\/setup$/);
  release();
  await expect(page.getByRole('heading', { name: 'Workspace installed' })).toBeVisible();
  await setupA11y(page);
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill('setup-owner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await page.goto('/setup');
  await expect(page).not.toHaveURL(/\/setup$/);
});

test('installer recovery fixtures retain drafts and current authority states', async ({ page }) => {
  test.setTimeout(120000);
  const ctx = {
    csrf: 'isolated-ui-fixture',
    mode: 'hosted',
    step: 'database',
    started: false,
    requirements: { 'Node.js 24': true },
    database: null,
    administrator: null,
  };
  let unavailable = true;
  let step = 'database';
  await page.route('**/api/installation/context', (r) =>
    r.fulfill(
      unavailable
        ? { status: 503, json: { message: 'Setup context unavailable.' } }
        : { json: { ...ctx, step } },
    ),
  );
  await page.route('**/api/installation/completion', (r) =>
    r.fulfill({ json: { complete: false } }),
  );
  await page.goto('/setup/hosted');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Setup context unavailable',
  );
  unavailable = false;
  await page.getByRole('button', { name: 'Reload setup' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your database' })).toBeFocused();
  await setupTheme(page, 'Dark');
  await page.getByLabel('Database name', { exact: true }).fill('retained_empty_workspace');
  await page.getByLabel('Database username', { exact: true }).fill('setup_ui_owner');
  await page.route('**/api/installation/action', (r) =>
    r.fulfill({ status: 503, json: { message: 'Connection unavailable.' } }),
  );
  await page.getByRole('button', { name: 'Check database and continue' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Connection unavailable');
  unavailable = true;
  await page.getByRole('button', { name: 'Reload saved step' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Setup context unavailable',
  );
  await expect(page.getByLabel('Database name', { exact: true })).toHaveValue(
    'retained_empty_workspace',
  );
  unavailable = false;
  await page.getByRole('button', { name: 'Reload saved step' }).click();
  await expect(page.getByLabel('Database name', { exact: true })).toHaveValue(
    'retained_empty_workspace',
  );
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connect your database' })).toBeVisible();
  await page.unroute('**/api/installation/action');
  await page.route('**/api/installation/action', (r) =>
    r.fulfill({
      status: 403,
      json: { code: 'setup_owner_required', message: 'Setup ownership changed. Unlock again.' },
    }),
  );
  await page.getByRole('button', { name: 'Check database and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock hosted setup' })).toBeFocused();
  await expect(page.getByLabel('Database name', { exact: true })).toHaveCount(0);
  await setupA11y(page);
  // Simulated post-commit response loss must resolve from completion rather than repeat setup.
  await page.unroute('**/api/installation/action');
  await page.route('**/api/installation/action', (r) =>
    r.fulfill({ status: 503, json: { message: 'Response lost.' } }),
  );
  step = 'review';
  await page.getByRole('button', { name: 'Reload saved step' }).click();
  await page.unroute('**/api/installation/completion');
  await page.route('**/api/installation/completion', (r) =>
    r.fulfill({ json: { complete: true } }),
  );
  await page.getByRole('button', { name: 'Install hosted workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace installed' })).toBeVisible();
  await expect(page.getByText(/Restart the API and worker/)).toBeVisible();
});

test('setup loading, requirements failure, upgrade gate and guest branding precedence', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('training.v21.appearance.platform.guest', 'dark'),
  );
  let brandUnavailable = true;
  await page.route('**/api/branding/current?*', async (r) => {
    if (brandUnavailable) return r.fulfill({ status: 503, json: {} });
    const response = await r.fetch();
    await r.fulfill({
      json: {
        ...(await response.json()),
        displayName: 'Setup branding fixture',
        selectedTheme: 'light',
      },
    });
  });
  let release!: () => void;
  const pending = new Promise<void>((r) => {
    release = r;
  });
  let step = 'requirements';
  await page.route('**/api/installation/context', async (r) => {
    await pending;
    await r.fulfill({
      json: {
        csrf: 'ui-fixture',
        step,
        started: false,
        upgrade: true,
        mode: 'local',
        localDatabaseAvailable: false,
        requirements: { 'Node.js 24': true, 'Writable installation storage': false },
        database: null,
        administrator: null,
      },
    });
  });
  await page.goto('/setup/local');
  await expect(page.getByText('Checking the private setup session...')).toBeVisible();
  // Healthy SSR authority bypasses the initial browser fetch. Exercise an explicit
  // refresh outage here; fresh-document outages have their own first-paint suite.
  const failedBrand = page.waitForResponse(
    (r) => r.url().includes('/api/branding/current?') && r.status() === 503,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('brandingchanged')));
  await failedBrand;
  await expect(page.getByRole('button', { name: 'Retry appearance', exact: true })).toBeVisible();
  brandUnavailable = false;
  await page.getByRole('button', { name: 'Retry appearance', exact: true }).click();
  await expect(page.getByRole('banner')).toContainText('Setup branding fixture');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  release();
  await expect(page.getByText('Needs attention', { exact: true })).toBeVisible();
  await setupA11y(page);
  await page.route('**/api/installation/action', (r) =>
    r.fulfill({ status: 409, json: { message: 'Resolve failed requirements.' } }),
  );
  await page.getByRole('button', { name: 'Continue to database' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Resolve failed requirements',
  );
  step = 'token';
  await page.getByRole('button', { name: 'Reload saved step' }).click();
  await expect(page.getByRole('heading', { name: 'Unlock local upgrade' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Setup token', { exact: true })).toBeVisible();
  step = 'database';
  await page.reload();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByLabel('Database host', { exact: true })).toBeVisible();
});

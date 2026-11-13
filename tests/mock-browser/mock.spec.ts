import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';

test('mock identity selection, recovery states and identity-bound session', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const guest = await (await request.get('/api/auth/context')).json();
  const installed = await request.post('/api/auth/setup', {
    headers: { Origin: 'http://127.0.0.1:3110' },
    data: {
      csrf: guest.csrf,
      name: 'Private administrator',
      email: 'mock-admin@example.invalid',
      password: 'Private mock fixture password',
      demoPassword: 'Separate mock fixture password',
    },
  });
  expect(installed.ok()).toBeTruthy();
  let failOptions = true;
  await page.route('**/api/auth/sign-in-options', async (route) => {
    if (failOptions) {
      await route.fulfill({
        status: 503,
        json: { message: 'Test identities could not be loaded. Try again.' },
      });
    } else await route.continue();
  });
  await page.goto('/login');
  await expect(page.getByText('Test identities could not be loaded. Try again.')).toBeVisible();
  failOptions = false;
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a test identity' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in as Private administrator' })).toHaveCount(
    0,
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/mock-signin-mobile.png', fullPage: true });
  let failLogin = true;
  await page.route('**/api/auth/mock-login', async (route) => {
    if (failLogin) {
      failLogin = false;
      await route.fulfill({
        status: 503,
        json: { message: 'Sign-in could not complete. Try again.' },
      });
    } else await route.continue();
  });
  const signIn = page.getByRole('button', { name: 'Sign in as Demo Member 1.3', exact: true });
  await signIn.click();
  await expect(page.getByText('Sign-in could not complete. Try again.')).toBeVisible();
  await signIn.click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Demo Member 1.3.' })).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Active client', exact: true }).locator('option:checked'),
  ).toHaveText('Demo Client 1');
  await page.goto('/account/security');
  await expect(
    page.getByText(
      'Password and authenticator settings are unavailable for simulated sign-in. Return to the workspace to continue testing.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toHaveCount(0);
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    await db.pool.query(
      "UPDATE identities SET active=false WHERE user_id=(SELECT id FROM users WHERE email='demo.1.3@example.invalid')",
    );
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Choose a test identity' })).toBeVisible();
    await expect(signIn).toHaveCount(0);
    await db.pool.query('UPDATE identities SET active=false');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Refresh identities' })).toBeVisible();
    await expect(page.getByText(/No synthetic identities are available/)).toBeVisible();
    await page.unroute('**/api/auth/sign-in-options');
    await page.route('**/api/auth/sign-in-options', (route) =>
      route.fulfill({ json: { mode: 'unavailable', identities: [] } }),
    );
    await page.getByRole('button', { name: 'Refresh identities' }).click();
    await expect(
      page.getByText('Sign-in is unavailable. Contact your administrator to configure access.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible();
  } finally {
    await db.close();
  }
});

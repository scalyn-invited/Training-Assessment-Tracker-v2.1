import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as OTPAuth from 'otpauth';
test('fresh setup, password login and optional authenticator recovery', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const response = await request.get('/api/health/ready');
  expect(response.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before we begin' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to administrator' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Synthetic Administrator');
  await page.getByLabel('Email address', { exact: true }).fill('browser-admin@example.invalid');
  const password = 'Browser administrator test passphrase';
  await page.getByLabel('Administrator password', { exact: true }).fill(password);
  await page
    .getByLabel('Demo account password', { exact: true })
    .fill('Separate browser demo passphrase');
  await page.getByRole('button', { name: 'Review installation' }).click();
  await page.getByRole('button', { name: 'Install workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace installed' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill('browser-admin@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Synthetic Administrator' }),
  ).toBeVisible();
  const current = await (await page.request.get('/api/auth/context')).json();
  const wrongOrigin = await page.request.post('/api/auth/logout', {
    headers: { Origin: 'https://untrusted.example.invalid' },
    data: { csrf: current.csrf },
  });
  expect(wrongOrigin.status()).toBe(403);
  const wrongCsrf = await page.request.post('/api/auth/logout', {
    headers: { Origin: 'http://127.0.0.1:3110' },
    data: { csrf: '0'.repeat(64) },
  });
  expect(wrongCsrf.status()).toBe(403);
  await page.getByRole('link', { name: 'Manage account security' }).click();
  await expect(
    page.getByText('Optional. Your password is currently enough to sign in.'),
  ).toBeVisible();
  await page.getByLabel('Your current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  const key = await page.getByLabel('Authenticator setup key', { exact: true }).inputValue();
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(new OTPAuth.TOTP({ secret: key }).generate());
  await page.getByRole('button', { name: 'Confirm authenticator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  const recovery = await page.locator('.recovery-codes code').first().innerText();
  await expect(page.locator('.recovery-codes code')).toHaveCount(10);
  await page.getByRole('button', { name: 'I have saved my recovery codes' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/security-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to workspace' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('browser-admin@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByLabel('Authenticator or recovery code')).toBeVisible();
  await page.getByLabel('Authenticator or recovery code').fill(recovery);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Synthetic Administrator' }),
  ).toBeVisible();
});

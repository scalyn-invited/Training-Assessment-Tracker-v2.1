import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
test('operator CLI reissue, private password setup and loopback production sign-in', async ({
  page,
}) => {
  test.setTimeout(120000);
  const fixture = JSON.parse(
    await readFile(path.join(process.env.TRACKER_OPERATOR_BROWSER_ROOT!, 'fixture.json'), 'utf8'),
  );
  await page.goto(fixture.oldLink);
  await expect(
    page.getByText('This link is unavailable or expired. Request a new link.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Invitation acceptance requires the intended recipient to be signed in.'),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check this link again' })).toBeVisible();
  await page.goto(fixture.link);
  await expect(page.getByRole('heading', { name: 'Set your password', exact: true })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('Private bootstrap browser password');
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('Private bootstrap browser password');
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account action completed' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('');
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill('owner@bootstrap.example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('Private bootstrap browser password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create first client', exact: true })).toBeVisible();
  const db = new Database(fixture.connection, fixture.role);
  try {
    expect(
      (await db.pool.query('SELECT is_synthetic,password_enabled,environment FROM users')).rows,
    ).toEqual([{ is_synthetic: false, password_enabled: true, environment: 'production' }]);
    expect((await db.pool.query('SELECT id FROM organisations')).rowCount).toBe(0);
    expect((await db.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
  } finally {
    await db.close();
  }
  expect(
    (
      await page.request.get('http://127.0.0.1:3161/health/live', {
        headers: { Host: 'outside.example.invalid' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get('/api/health/live', { headers: { 'x-forwarded-for': '192.0.2.10' } })
    ).status(),
  ).toBe(403);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/operator-platform-mobile.png', fullPage: true });
  // Invalid forms count without mutating branding; use mixed casing and trailing slash
  // to prove the API guard uses the matched route rather than a bypassable URL string.
  for (let i = 0; i < 20; i++) {
    const response = await page.request.post(i % 2 ? '/api/BRANDING/' : '/api/branding', {
      headers: { Origin: 'http://127.0.0.1:3160' },
      data: { clientId: null },
    });
    expect(response.status()).toBe(422);
  }
  const limited = await page.request.post('/api/branding', {
    headers: { Origin: 'http://127.0.0.1:3160' },
    data: { clientId: null },
  });
  expect(limited.status()).toBe(429);
  expect(limited.headers()['retry-after']).toBe('60');
  expect((await limited.json()).code).toBe('rate_limited');
  const root = process.env.TRACKER_OPERATOR_BROWSER_ROOT!;
  await writeFile(path.join(root, 'restart-request'), '1');
  await expect
    .poll(
      async () => {
        try {
          return await readFile(path.join(root, 'restart-complete'), 'utf8');
        } catch {
          return '';
        }
      },
      { timeout: 30000 },
    )
    .toBe('1');
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get('/api/health/live')).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30000 },
    )
    .toBe(200);
  const restarted = new Database(fixture.connection, fixture.role);
  try {
    expect((await restarted.pool.query('SELECT id FROM users')).rowCount).toBe(1);
    expect((await restarted.pool.query('SELECT id FROM organisations')).rowCount).toBe(0);
    expect((await restarted.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
    expect((await restarted.pool.query('SELECT singleton FROM installation')).rowCount).toBe(1);
  } finally {
    await restarted.close();
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
});

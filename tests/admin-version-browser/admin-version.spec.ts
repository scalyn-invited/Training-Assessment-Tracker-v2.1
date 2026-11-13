import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
test('stale Global Admin confirmation cannot grant access and offers explicit reselection', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Private version-check administrator password';
  const guest = await (await request.get('/api/auth/context')).json();
  const setup = await request.post('/api/auth/setup', {
    headers: { Origin: origin },
    data: {
      csrf: guest.csrf,
      name: 'Version administrator',
      email: 'version-admin@example.invalid',
      password,
      demoPassword: 'Separate fictional demo password',
    },
  });
  expect(setup.ok()).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('version-admin@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await page.goto('/platform/admins');
  await page.locator('input[name="search"]').fill('demo.1.0@example.invalid');
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click();
  await page.getByRole('button', { name: 'Appoint Global Admin', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Reason', { exact: true })
    .fill('Verify the account before granting global access');
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    const target = (
      await db.pool.query(
        "SELECT id,permission_version FROM users WHERE email='demo.1.0@example.invalid'",
      )
    ).rows[0];
    await db.pool.query('UPDATE users SET permission_version=permission_version+1 WHERE id=$1', [
      target.id,
    ]);
    await dialog.getByRole('button', { name: 'Confirm appointment', exact: true }).click();
    await expect(
      dialog.getByText('This account changed. Reload accounts and review access again.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Confirm appointment', exact: true }),
    ).toBeDisabled();
    expect(
      (
        await db.pool.query(
          "SELECT id FROM role_assignments WHERE user_id=$1 AND scope_type='platform'",
          [target.id],
        )
      ).rowCount,
    ).toBe(0);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({ path: 'output/playwright/admin-version-mobile.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Reload accounts', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Appoint Global Admin', exact: true }).click();
    await dialog
      .getByLabel('Reason', { exact: true })
      .fill('Reviewed refreshed account permissions for appointment');
    await dialog.getByRole('button', { name: 'Confirm appointment', exact: true }).click();
    await expect(
      page.getByText('Global Admin appointed. Their existing sessions have ended.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await db.pool.query(
          "SELECT id FROM role_assignments WHERE user_id=$1 AND scope_type='platform' AND ends_at IS NULL",
          [target.id],
        )
      ).rowCount,
    ).toBe(1);
    expect(
      (await db.pool.query('SELECT permission_version FROM users WHERE id=$1', [target.id])).rows[0]
        .permission_version,
    ).toBe(target.permission_version + 2);
  } finally {
    await db.close();
  }
});

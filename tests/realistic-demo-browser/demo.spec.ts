import { test, expect } from '@playwright/test';
import { Database } from '../../packages/database/src/database.js';

test('complete CLI catalogue survives startup and supports ordinary client and explicit platform mock sign-in', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55445/postgres');
  try {
    expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(31);
    expect((await db.pool.query('SELECT id FROM enrolments')).rowCount).toBe(21);
    expect((await db.pool.query('SELECT id FROM evidence_files')).rowCount).toBe(42);
    expect(
      (
        await db.pool.query(
          "SELECT id FROM role_assignments WHERE scope_type='platform' AND ends_at IS NULL",
        )
      ).rowCount,
    ).toBe(1);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Choose a test identity' })).toBeVisible();
    const name = (await db.pool.query("SELECT name FROM users WHERE name LIKE 'Maya Santos%'"))
      .rows[0].name;
    await page.getByRole('button', { name: 'Sign in as ' + name, exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(
      page.getByRole('combobox', { name: 'Active client', exact: true }).locator('option:checked'),
    ).toHaveText('Harbor Voice Support (fictional)');
    await page.goto('/enrolments');
    await expect(
      page.getByRole('heading', { name: 'Training records', exact: true }),
    ).toBeVisible();
    const adminContext = await browser.newContext();
    try {
      const admin = await adminContext.newPage();
      await admin.goto('http://127.0.0.1:3150/login');
      await admin.getByRole('button', { name: /Sign in as Alex Rowan/ }).click();
      await expect(admin).toHaveURL(/platform/);
      await admin.goto('http://127.0.0.1:3150/platform/clients');
      await expect(admin.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
      await expect(
        admin.getByText('Harbor Voice Support (fictional)', { exact: true }).first(),
      ).toBeVisible();
    } finally {
      await adminContext.close();
    }
  } finally {
    await db.close();
  }
});

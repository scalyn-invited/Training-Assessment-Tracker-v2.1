import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'dotenv';
import { Database } from '../../packages/database/src/database.js';
test('explicit legacy upgrade preserves original storage and key while installing a separate PostgreSQL workspace', async ({
  page,
}) => {
  test.setTimeout(240000);
  const root = process.env.TRACKER_UPGRADE_BROWSER_ROOT!;
  const fixture = JSON.parse(await readFile(path.join(root, 'fixture.json'), 'utf8'));
  await page.goto('/setup');
  await expect(page.getByRole('heading', { name: 'Unlock local upgrade' })).toBeVisible();
  await page.getByLabel('Setup token', { exact: true }).fill(fixture.token);
  await page.getByRole('button', { name: 'Unlock setup', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to database' }).click();
  await expect(page.getByRole('radio', { name: 'Local PGlite workspace' })).toHaveCount(0);
  await page.getByLabel('Database host', { exact: true }).fill('127.0.0.1');
  await page.getByLabel('Database port', { exact: true }).fill(String(fixture.databasePort));
  await page.getByLabel('Database name', { exact: true }).fill('local_upgrade_test');
  await page.getByLabel('Database username', { exact: true }).fill('postgres');
  await page
    .getByLabel('Database password (optional if allowed by your server)', { exact: true })
    .fill(fixture.password);
  await page.getByRole('button', { name: 'Check database and continue' }).click();
  const password = 'Personal legacy upgrade passphrase';
  await page.getByLabel('Your name', { exact: true }).fill('Upgrade Workspace Owner');
  await page.getByLabel('Email address', { exact: true }).fill('owner@upgrade.example.test');
  await page.getByLabel('Administrator password', { exact: true }).fill(password);
  await page.getByLabel('Confirm administrator password', { exact: true }).fill(password);
  await page
    .getByLabel('Demo account password', { exact: true })
    .fill('Separate upgrade demo passphrase');
  await page
    .getByLabel('Confirm demo account password', { exact: true })
    .fill('Separate upgrade demo passphrase');
  await page.getByRole('button', { name: 'Review installation', exact: true }).click();
  await page.getByRole('button', { name: 'Install local workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace installed' })).toBeVisible({
    timeout: 120000,
  });
  await expect(page.getByRole('link', { name: 'Continue to sign in' })).toBeVisible({
    timeout: 45000,
  });
  expect(
    await readFile(
      path.join(fixture.application, '.runtime/installation/environment-before-upgrade.env'),
      'utf8',
    ),
  ).toBe(fixture.original);
  expect(
    await readFile(
      path.join(fixture.application, '.runtime/private/pglite/legacy.fixture'),
      'utf8',
    ),
  ).toBe('preserved old database bytes');
  expect(await readFile(path.join(fixture.application, '.runtime/private/encryption.key'))).toEqual(
    Buffer.alloc(32, 7),
  );
  const configured = parse(await readFile(path.join(fixture.application, '.env')));
  expect(configured.APP_ENCRYPTION_KEY).toBe(Buffer.alloc(32, 7).toString('hex'));
  expect(configured.UNCHANGED).toBe('preserved');
  const db = new Database(configured.DATABASE_URL);
  try {
    expect((await db.pool.query('SELECT count(*)::int n FROM users')).rows[0].n).toBe(31);
    expect((await db.pool.query('SELECT count(*)::int n FROM enrolments')).rows[0].n).toBe(21);
  } finally {
    await db.close();
  }
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill('owner@upgrade.example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
});

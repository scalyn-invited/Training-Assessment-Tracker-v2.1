import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Database } from '../../packages/database/src/database.js';
test('hosted token, owned database, reviewed installation, retry and production sign-in', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const root = process.env.TRACKER_INSTALLER_BROWSER_ROOT!;
  const fixture = JSON.parse(await readFile(path.join(root, 'fixture.json'), 'utf8')) as {
    postgresPort: number;
    token: string;
    password: string;
    application: string;
    url: string;
  };
  const setupResponse = await request.get('/api/installation/context', { headers: { 'X-Request-ID': 'untrusted-id' } });
  expect(setupResponse.ok()).toBeTruthy();
  const setupHeaders = setupResponse.headers();
  expect(setupHeaders['cache-control']).toContain('no-store');
  expect(setupHeaders['cache-control']).toContain('private');
  expect(setupHeaders['x-frame-options']).toBe('DENY');
  expect(setupHeaders['x-content-type-options']).toBe('nosniff');
  expect(setupHeaders['referrer-policy']).toBe('no-referrer');
  expect(setupHeaders['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  await page.goto('/setup/hosted');
  await expect(page.getByRole('heading', { name: 'Unlock hosted setup' })).toBeVisible();
  await page.getByLabel('Setup token', { exact: true }).fill('a'.repeat(64));
  await page.getByRole('button', { name: 'Unlock setup', exact: true }).click();
  await expect(
    page.getByText(
      'The setup token is invalid or expired. Generate a new token from the server console.',
    ),
  ).toBeVisible();
  await page.getByLabel('Setup token', { exact: true }).fill(fixture.token);
  await page.getByRole('button', { name: 'Unlock setup', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Check installation requirements' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue to database' }).click();
  await page.getByLabel('Database host', { exact: true }).fill('127.0.0.1');
  await page.getByLabel('Database port', { exact: true }).fill(String(fixture.postgresPort));
  await page.getByLabel('Database name', { exact: true }).fill('training_installer_test');
  await page.getByLabel('Database username', { exact: true }).fill('postgres');
  await page
    .getByLabel('Database password (optional if allowed by your server)', { exact: true })
    .fill(fixture.password);
  const db = new Database(fixture.url);
  try {
    await db.pool.query('CREATE TABLE unrelated(value text)');
    await page.getByRole('button', { name: 'Check database and continue' }).click();
    await expect(
      page.getByText('Choose a separate empty database. Existing records were preserved.'),
    ).toBeVisible();
    await expect(page.getByLabel('Database name', { exact: true })).toHaveValue(
      'training_installer_test',
    );
    await expect(
      page.getByLabel('Database password (optional if allowed by your server)', { exact: true }),
    ).toHaveValue(fixture.password);
    await db.pool.query('DROP TABLE unrelated');
    await page.getByRole('button', { name: 'Check database and continue' }).click();
    await expect(page.getByRole('heading', { name: 'Create your administrator' })).toBeVisible();
    const password = 'Personal administrator fixture passphrase';
    async function administrator() {
      await page.getByLabel('Your name', { exact: true }).fill('Hosted Test Administrator');
      await page.getByLabel('Email address', { exact: true }).fill('owner@setup.example.test');
      await page.getByLabel('Administrator password', { exact: true }).fill(password);
      await page.getByLabel('Confirm administrator password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Review installation', exact: true }).click();
    }
    await administrator();
    await expect(page.getByRole('heading', { name: 'Review installation' })).toBeVisible();
    const context = await (await page.request.get('/api/installation/context')).json();
    expect(JSON.stringify(context)).not.toContain(password);
    expect(JSON.stringify(context)).not.toContain(fixture.password);
    expect(JSON.stringify(context)).not.toContain('passwordHash');
    const forged = await page.request.post('/api/installation/action', {
      headers: { Origin: 'https://other.example.test' },
      data: { csrf: context.csrf, action: 'install' },
    });
    expect(forged.status()).toBe(403);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await administrator();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: 'output/playwright/hosted-setup-review-mobile.png',
      fullPage: true,
    });
    let calls = 0;
    await page.route('**/api/installation/action', async (route) => {
      if (route.request().postDataJSON().action === 'install' && ++calls === 2)
        await route.fulfill({
          status: 503,
          json: {
            code: 'fixture_interruption',
            message: 'The connection was interrupted. Retry the saved stage.',
          },
        });
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Install hosted workspace' }).click();
    await expect(
      page.getByText('The connection was interrupted. Retry the saved stage.'),
    ).toBeVisible();
    expect((await db.pool.query('SELECT stage FROM training_installations')).rows[0].stage).toBe(
      'migrated',
    );
    await page.reload();
    await expect(page.getByText('Completed: Database schema ready')).toBeVisible();
    await page.getByRole('button', { name: 'Continue installation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Workspace installed' })).toBeVisible();
    expect((await db.pool.query('SELECT environment,is_synthetic FROM users')).rows).toEqual([
      { environment: 'production', is_synthetic: false },
    ]);
    expect((await db.pool.query('SELECT id FROM organisations')).rowCount).toBe(0);
    expect(
      (await db.pool.query('SELECT DISTINCT tenant_role FROM schema_migrations')).rows[0]
        .tenant_role,
    ).toMatch(/^tracker_tenant_[a-f0-9]{12}$/);
    const role = (await db.pool.query('SELECT DISTINCT tenant_role FROM schema_migrations')).rows[0]
      .tenant_role;
    expect(
      (
        await db.pool.query(
          'SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',
          [role],
        )
      ).rows,
    ).toEqual([{ rolcanlogin: false, rolsuper: false, rolbypassrls: false }]);
    expect(
      (
        await db.pool.query(
          "SELECT roles FROM pg_policies WHERE schemaname='public' AND tablename='client_memberships'",
        )
      ).rows[0].roles,
    ).toContain(role);
    expect((await page.request.get('/api/installation/context')).status()).toBe(404);
    await writeFile(path.join(root, 'start-runtime'), 'start');
    await expect
      .poll(
        async () => {
          try {
            const response = await request.get('/api/auth/context');
            return response.ok() && (await response.json()).installed === true ? 200 : 0;
          } catch {
            return 0;
          }
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      )
      .toBe(200);
    await page.getByRole('link', { name: 'Continue to sign in' }).click();
    await page.getByLabel('Email', { exact: true }).fill('owner@setup.example.test');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
    expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(1);
  } finally {
    await db.close();
  }
});

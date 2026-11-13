import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
test('fresh local wizard, full fixtures, interrupted resume and automatic runtime handoff', async ({
  page,
}) => {
  test.setTimeout(480000);
  await page.goto('/setup');
  await expect(
    page.getByRole('heading', { name: 'Check installation requirements' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue to database' }).click();
  await expect(page.getByRole('radio', { name: 'Local PGlite workspace' })).toBeChecked();
  await page.getByRole('radio', { name: 'PostgreSQL database' }).check();
  await page.getByLabel('Database name', { exact: true }).fill('keep-my-input');
  await page.getByRole('radio', { name: 'Local PGlite workspace' }).check();
  await page.getByRole('radio', { name: 'PostgreSQL database' }).check();
  await expect(page.getByLabel('Database name', { exact: true })).toHaveValue('keep-my-input');
  await page.getByRole('radio', { name: 'Local PGlite workspace' }).check();
  await page.getByRole('button', { name: 'Check database and continue' }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Local Workspace Owner');
  await page.getByLabel('Email address', { exact: true }).fill('owner@local.example.test');
  const password = 'Personal local administrator passphrase';
  const demo = 'Separate fictional account passphrase';
  await page.getByLabel('Administrator password', { exact: true }).fill(password);
  await page.getByLabel('Confirm administrator password', { exact: true }).fill(password);
  await page.getByLabel('Demo account password', { exact: true }).fill(demo);
  await page.getByLabel('Confirm demo account password', { exact: true }).fill(demo);
  await page.getByRole('button', { name: 'Review installation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review installation' })).toBeVisible();
  const context = await (await page.request.get('/api/installation/context')).json();
  expect(JSON.stringify(context)).not.toContain(password);
  expect(JSON.stringify(context)).not.toContain(demo);
  expect(JSON.stringify(context)).not.toContain('Hash');
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: 'output/playwright/local-setup-review-mobile.png',
    fullPage: true,
  });
  let calls = 0;
  await page.route('**/api/installation/action', async (route) => {
    if (route.request().postDataJSON().action === 'install' && ++calls === 6)
      await route.fulfill({
        status: 503,
        json: {
          code: 'fixture_interruption',
          message: 'Interrupted fixture stage. Resume the saved step.',
        },
      });
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Install local workspace' }).click();
  await expect(page.getByText('Interrupted fixture stage. Resume the saved step.')).toBeVisible({
    timeout: 90000,
  });
  await page.reload();
  await expect(page.getByText('Demo preparation: 4 of 25 steps saved.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue installation', exact: true }).click();
  await page.getByRole('button', { name: 'Pause after current step', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue installation', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Continue installation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workspace installed' })).toBeVisible({
    timeout: 360000,
  });
  await expect(page.getByRole('link', { name: 'Continue to sign in' })).toBeVisible({
    timeout: 45000,
  });
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55442/postgres');
  try {
    expect((await db.pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(31);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM enrolments')).rows[0].n).toBe(21);
    expect((await db.pool.query('SELECT count(*)::int AS n FROM evidence_files')).rows[0].n).toBe(
      42,
    );
  } finally {
    await db.close();
  }
  await page.reload();
  await expect(page.getByRole('link', { name: 'Continue to sign in' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue to sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill('owner@local.example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
});

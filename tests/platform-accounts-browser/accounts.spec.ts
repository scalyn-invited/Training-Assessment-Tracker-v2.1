import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
const screenshots = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright';
// Resizing alone leaves Playwright's desktop fine pointer in place.
// Exercise the shared system's actual coarse-pointer target-size rules.
test.use({ hasTouch: true });
test('platform account forms preserve selections and require fresh access confirmation', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const guest = await (await request.get('/api/auth/context')).json();
  expect(
    (
      await request.post('/api/auth/setup', {
        headers: { Origin: 'http://127.0.0.1:3110' },
        data: {
          csrf: guest.csrf,
          name: 'Platform owner',
          email: 'owner@example.invalid',
          password: 'Unique administrator passphrase',
          demoPassword: 'Separate demonstration password',
        },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('owner@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('Unique administrator passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/platform/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/platform/clients');
  await page.locator('summary').filter({ hasText: 'Client account access' }).click();
  const section = page.getByRole('region', { name: 'Client account access' });
  await expect(section.getByText('31 matching accounts', { exact: true })).toBeVisible();
  const pagination = section.getByRole('navigation', { name: 'Client account pages' });
  await pagination.getByRole('button', { name: 'Next accounts' }).click();
  await expect(pagination.getByText('Page 2', { exact: true })).toBeVisible();
  await expect(pagination.getByRole('button', { name: 'Next accounts' })).toBeDisabled();
  await pagination.getByRole('button', { name: 'Previous accounts' }).click();
  await expect(pagination.getByText('Page 1', { exact: true })).toBeVisible();
  await section.getByLabel('Search accounts', { exact: true }).fill('no-such-account');
  await section.getByRole('button', { name: 'Search accounts', exact: true }).click();
  await expect(
    section.getByText('No accounts match this search. Change the search to try again.'),
  ).toBeVisible();
  await page.route('**/api/platform/client-accounts?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Account directory temporarily unavailable.' } }),
  );
  await section.getByRole('button', { name: 'Search accounts', exact: true }).click();
  await expect(section.getByRole('alert')).toHaveText('Account directory temporarily unavailable.');
  await page.unroute('**/api/platform/client-accounts?*');
  await section.getByRole('button', { name: 'Reload accounts' }).click();
  await expect(section.getByRole('alert')).toHaveCount(0);
  await section.getByLabel('Search accounts', { exact: true }).fill('demo.1.3@example.invalid');
  await section.getByRole('button', { name: 'Search accounts', exact: true }).click();
  const open = async () => {
    await expect(section.getByText('1 matching accounts', { exact: true })).toBeVisible();
    await expect(section.getByText('Loading accounts...', { exact: true })).toHaveCount(0);
    const summary = section
      .locator('summary')
      .filter({ hasText: 'Demo Member 1.3 - demo.1.3@example.invalid' });
    await summary.focus();
    await page.keyboard.press('Enter');
  };
  await open();
  const form = section.getByRole('form', {
    name: 'Manage client access for demo.1.3@example.invalid',
  });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await section.screenshot({ path: `${screenshots}/client-access-light-desktop.png` });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await section.screenshot({ path: `${screenshots}/client-access-dark-desktop.png` });
  await form.getByRole('button', { name: 'Apply access change' }).click();
  await expect(form.getByRole('combobox', { name: 'Action', exact: true })).toBeFocused();
  await expect(
    form.getByRole('combobox', { name: 'Client', exact: true }).locator('option:checked'),
  ).toHaveText('Demo Client 1');
  await expect(form.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue('');
  await expect(
    form.getByRole('combobox', { name: 'Action', exact: true }).locator('option[value="join"]'),
  ).toHaveCount(0);
  await form
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption({ label: 'Demo Client 2' });
  await form.getByRole('combobox', { name: 'Action', exact: true }).selectOption('grant');
  await form.getByLabel('Reason', { exact: true }).fill('Reviewed account administration access');
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Apply access change' }).click();
  await expect(form.getByRole('alert')).toContainText('not an active member');
  await expect(
    form.getByRole('combobox', { name: 'Client', exact: true }).locator('option:checked'),
  ).toHaveText('Demo Client 2');
  await expect(form.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue('grant');
  await form
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption({ label: 'Demo Client 1' });
  await expect(form.getByRole('checkbox')).not.toBeChecked();
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    await db.pool.query(
      "UPDATE users SET permission_version=permission_version+1 WHERE email='demo.1.3@example.invalid'",
    );
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Apply access change' }).click();
    await expect(form.getByRole('alert')).toContainText('This account changed');
    await expect(form.getByRole('button', { name: 'Apply access change' })).toBeDisabled();
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    for (const control of await form.locator('select, input:not([type=checkbox]), button').all()) {
      expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
    await form.getByRole('alert').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${screenshots}/client-access-stale-mobile.png` });
    await form.getByRole('button', { name: 'Reload accounts' }).click();
    await open();
    await expect(form.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue('');
    await form.getByRole('combobox', { name: 'Action', exact: true }).selectOption('grant');
    await form.getByLabel('Reason', { exact: true }).fill('Confirmed refreshed account version');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Apply access change' }).click();
    await expect(
      section.getByText('Access updated for Demo Member 1.3. Affected sessions have ended.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await db.pool.query(
          "SELECT r.id FROM role_assignments r JOIN users u ON u.id=r.user_id WHERE u.email='demo.1.3@example.invalid' AND r.role='admin' AND r.scope_type='client' AND r.ends_at IS NULL",
        )
      ).rowCount,
    ).toBe(1);
    await open();
    await form.getByRole('combobox', { name: 'Action', exact: true }).selectOption('revoke');
    await form
      .getByLabel('Reason', { exact: true })
      .fill('Remove the verified temporary client admin');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Apply access change' }).click();
    await expect
      .poll(
        async () =>
          (
            await db.pool.query(
              "SELECT r.id FROM role_assignments r JOIN users u ON u.id=r.user_id WHERE u.email='demo.1.3@example.invalid' AND r.role='admin' AND r.scope_type='client' AND r.ends_at IS NULL",
            )
          ).rowCount,
      )
      .toBe(0);
  } finally {
    await db.close();
  }
});

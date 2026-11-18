import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { promotionsFlow } from '../browser/promotions-flow.js';

test('administration presentation preserves teams, role reviews, allocations, enrolments and promotions', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated administration UI password',
    demo = 'Isolated administration demo password';
  const request = page.request;
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await request.get('/api/auth/context')).json();
    const r = await request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(r.ok()).toBe(true);
    return r.json();
  }
  async function a11y() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await post('/auth/setup', {
    name: 'Administration reviewer',
    email: 'admin-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await post('/auth/login', { email: 'admin-ui@example.invalid', password });
  const client = (await (await request.get('/api/clients')).json()).find(
    (c: { name: string }) => c.name === 'Demo Client 1',
  ).id;
  await post('/clients/select', { clientId: client });
  await page.route('**/api/clients/administration?*', (r) =>
    r.fulfill({
      status: 503,
      json: { message: 'Administration directory temporarily unavailable.' },
    }),
  );
  await page.goto('/administration');
  await expect(page.getByText('Administration directory temporarily unavailable.')).toBeVisible();
  await page.unroute('**/api/clients/administration?*');
  await page.getByRole('button', { name: 'Retry directory', exact: true }).click();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  const directory = page.getByRole('table', { name: 'People and assignments', exact: true });
  await expect(directory.getByRole('row')).toHaveCount(11);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const searchBounds = await page.getByLabel('Search name or email', { exact: true }).boundingBox();
  const submitBounds = await page
    .getByRole('button', { name: 'Search people', exact: true })
    .boundingBox();
  expect(submitBounds!.x).toBeGreaterThan(searchBounds!.x + searchBounds!.width);
  await a11y();
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await a11y();
  await page.screenshot({
    path: 'output/playwright/client-admin/administration-desktop.png',
    fullPage: true,
  });
  for (const width of [320, 390, 800]) {
    await page.setViewportSize({ width, height: 844 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'output/playwright/client-admin/administration-mobile.png',
    fullPage: true,
  });
  await page.getByLabel('Team name', { exact: true }).fill('UI review team');
  await page.getByLabel('Reason', { exact: true }).fill('Verify retained team creation');
  await page.getByRole('button', { name: 'Create internal team', exact: true }).click();
  await expect(page.getByText('Client administration updated.', { exact: false })).toBeVisible();
  await page
    .getByLabel('Search name or email', { exact: true })
    .fill('no-matching-person@example.invalid');
  await page.getByRole('button', { name: 'Search people', exact: true }).click();
  await expect(page.getByText('No people match this search.')).toBeVisible();
  await page.getByLabel('Search name or email', { exact: true }).fill('demo.1.3@example.invalid');
  await page.getByRole('button', { name: 'Search people', exact: true }).click();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const teamForm = dialog
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Update team membership', exact: true }) });
  await teamForm
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'UI review team' });
  await teamForm
    .getByLabel('Reason', { exact: true })
    .fill('Verify current team membership review');
  await dialog.getByRole('button', { name: 'End client membership', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await a11y();
  await page.screenshot({
    path: 'output/playwright/client-admin/assignments-dialog-mobile.png',
    fullPage: false,
  });
  await teamForm.getByRole('button', { name: 'Update team membership', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await expect(dialog).toContainText('UI review team');
  await dialog.getByText('Roles and coordinator responsibility', { exact: true }).click();
  const roleForm = dialog
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Grant role', exact: true }) });
  await roleForm.getByRole('combobox', { name: 'Role', exact: true }).selectOption('coordinator');
  await roleForm
    .getByRole('combobox', { name: 'Role scope', exact: true })
    .selectOption({ label: 'UI review team — coordinator only' });
  await roleForm.getByLabel('Reason', { exact: true }).fill('Verify retained scoped role grant');
  await roleForm.getByRole('button', { name: 'Grant role', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await dialog.getByText('Roles and coordinator responsibility', { exact: true }).click();
  await dialog.getByText('coordinator — UI review team', { exact: true }).click();
  const revoke = dialog
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Revoke role', exact: true }) })
    .filter({ visible: true });
  await revoke.getByLabel('Reason', { exact: true }).fill('Verify retained scoped role revocation');
  await revoke.getByRole('button', { name: 'Revoke role', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await dialog.getByRole('button', { name: 'End client membership', exact: true }).click();
  await dialog.getByRole('button', { name: 'Keep membership', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Confirm membership end', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  const training = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Create a training record', exact: true }) });
  await training
    .getByRole('combobox', { name: 'Training member', exact: true })
    .selectOption({ label: 'Demo Member 1.3' });
  await training
    .getByRole('combobox', { name: 'Primary coordinator', exact: true })
    .selectOption({ label: 'Demo Coordinator 1.2' });
  await training.getByRole('combobox', { name: 'Team', exact: true }).selectOption('none');
  await training.getByLabel('Training title', { exact: true }).fill('UI verified training record');
  await training
    .getByLabel('Reason for creating this record', { exact: true })
    .fill('Verify unchanged enrolment review');
  await training.getByRole('button', { name: 'Review training record', exact: true }).click();
  await expect(
    training.getByRole('heading', { name: 'Review training record', exact: true }),
  ).toBeFocused();
  await expect(training.getByLabel('Training title', { exact: true })).not.toBeVisible();
  await training.getByRole('button', { name: 'Back to edit', exact: true }).click();
  await expect(training.getByLabel('Training title', { exact: true })).toHaveValue(
    'UI verified training record',
  );
  await training.getByRole('button', { name: 'Review training record', exact: true }).click();
  await page.route('**/api/enrolments', (r) =>
    r.fulfill({
      status: 503,
      json: { message: 'Training creation unavailable. Retry the reviewed action.' },
    }),
  );
  await training.getByRole('button', { name: 'Create training record', exact: true }).click();
  await expect(training.getByRole('alert')).toBeVisible();
  await page.unroute('**/api/enrolments');
  await training.getByRole('button', { name: 'Create training record', exact: true }).click();
  await expect(training).toContainText(
    'Training record created for Demo Member 1.3. Status: onboarding.',
  );
  await a11y();
  await promotionsFlow(page);

  // Independent Client Admin retains allocation controls but cannot grant Client Admin roles.
  const isolated = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const p = await isolated.newPage();
    await p.goto(origin + '/login');
    await p.getByLabel('Email', { exact: true }).fill('demo.1.0@example.invalid');
    await p.getByLabel('Password', { exact: true }).fill(demo);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(p).toHaveURL(/\/clients$/);
    await p.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await expect(p).toHaveURL(/\/dashboard$/);
    await p.goto(origin + '/administration');
    await p.getByText('Allocate a coordinator', { exact: true }).click();
    await p
      .getByRole('combobox', { name: 'Member', exact: true })
      .selectOption({ label: 'Demo Member 1.4 — demo.1.4@example.invalid' });
    await p
      .getByRole('combobox', { name: 'Coordinator', exact: true })
      .selectOption({ label: 'Demo Coordinator 1.2 — demo.1.2@example.invalid' });
    await p
      .getByLabel('Allocation reason', { exact: true })
      .fill('Verify new coordinator allocation');
    await p.getByRole('button', { name: 'Create allocation', exact: true }).click();
    const row = p
      .getByRole('table', { name: 'Current coordinator allocations' })
      .getByRole('row')
      .filter({ hasText: 'Demo Member 1.4' });
    await expect(row).toContainText('Not granted');
    await row.getByText('Review allocation', { exact: true }).click();
    await row
      .getByLabel('Sensitive access reason', { exact: true })
      .fill('Verify separate sensitive grant');
    await row.getByRole('checkbox', { name: 'I have checked the coordinator and member.' }).check();
    await row.getByRole('button', { name: 'Grant sensitive access', exact: true }).click();
    await expect(row).toContainText('Granted');
    await row.getByText('Review allocation', { exact: true }).click();
    await row
      .getByLabel('Sensitive access reason', { exact: true })
      .fill('Verify sensitive access revocation');
    await row.getByRole('checkbox', { name: 'I have checked the coordinator and member.' }).check();
    await row.getByRole('button', { name: 'Revoke sensitive access', exact: true }).click();
    await expect(row).toContainText('Not granted');
    await row.getByText('Review allocation', { exact: true }).click();
    await row
      .getByLabel('End allocation reason', { exact: true })
      .fill('Verify responsibility end confirmation');
    await row.getByRole('checkbox', { name: 'End responsibility for this member.' }).check();
    await row.getByRole('button', { name: 'Confirm allocation end', exact: true }).click();
    await expect(row).toHaveCount(0);
    await p.getByLabel('Search name or email', { exact: true }).fill('demo.1.4@example.invalid');
    await p.getByRole('button', { name: 'Search people', exact: true }).click();
    await p.getByRole('button', { name: 'Manage assignments', exact: true }).click();
    await p
      .getByRole('dialog')
      .getByText('Roles and coordinator responsibility', { exact: true })
      .click();
    await expect(
      p.getByRole('dialog').getByRole('option', { name: 'Client Admin', exact: true }),
    ).toHaveCount(0);
    await p.keyboard.press('Escape');
    expect(
      (await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
  } finally {
    await isolated.close();
  }
  for (const email of ['demo.1.2@example.invalid', 'demo.1.3@example.invalid']) {
    const isolated = await browser.newContext();
    try {
      const p = await isolated.newPage();
      await p.goto(origin + '/login');
      await p.getByLabel('Email', { exact: true }).fill(email);
      await p.getByLabel('Password', { exact: true }).fill(demo);
      await p.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(p).toHaveURL(/\/clients$/);
      await p.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
      await expect(p).toHaveURL(/\/dashboard$/);
      await p.goto(origin + '/administration');
      await expect(
        p.getByRole('heading', { name: 'Client administration permission required' }),
      ).toBeVisible();
      expect(
        (await p.request.get(origin + '/api/clients/administration?clientId=' + client)).status(),
      ).toBe(403);
    } finally {
      await isolated.close();
    }
  }
});

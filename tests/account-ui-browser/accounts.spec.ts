import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as OTPAuth from 'otpauth';

const screenshots = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright/account-ui';
test('shared shell and account pages preserve guarded access, private links and MFA', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated account shell passphrase';
  const demoPassword = 'Isolated account demo passphrase';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: Record<string, unknown>) {
    const auth = await (await request.get('/api/auth/context')).json();
    const response = await request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: auth.csrf },
    });
    expect(response.status()).toBeLessThan(300);
    return response.json();
  }
  async function login(p: Page, email: string, secret = demoPassword) {
    await p.goto(origin + '/login');
    await p.getByLabel('Email', { exact: true }).fill(email);
    await p.getByLabel('Password', { exact: true }).fill(secret);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(p).not.toHaveURL(/\/login$/);
  }
  async function a11y(p = page) {
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(
      (await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  async function narrowLayouts() {
    const size = page.viewportSize()!;
    for (const width of [320, 800]) {
      await page.setViewportSize({ width, height: 900 });
      await a11y();
    }
    await page.setViewportSize(size);
  }
  await post('/auth/setup', {
    name: 'Account UI reviewer',
    email: 'account-ui@example.invalid',
    password,
    demoPassword,
  });
  await post('/auth/login', { email: 'account-ui@example.invalid', password });
  await login(page, 'account-ui@example.invalid', password);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/platform/admins?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Isolated directory outage' } }),
  );
  await page.goto('/platform/admins');
  await expect(page.getByText('Isolated directory outage')).toBeVisible();
  await page.unroute('**/api/platform/admins?*');
  await page.getByRole('button', { name: 'Retry administrators' }).click();
  await expect(page.locator('[data-application-shell="platform"]')).toBeVisible();
  await expect(page.getByText('Protected: last active Global Admin.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage access', exact: true })).toBeDisabled();
  await a11y();
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await a11y();
  await page.screenshot({ path: `${screenshots}/admins-desktop.png`, fullPage: true });
  await narrowLayouts();
  await page.getByLabel('Search name or email').fill('no-match@example.invalid');
  await page.getByRole('button', { name: 'Search accounts' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'matching accounts' })).toHaveText(
    '0 matching accounts',
  );
  await page.getByLabel('Search name or email').fill('demo.1.3@example.invalid');
  await page.getByRole('button', { name: 'Search accounts' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'matching accounts' })).toHaveText(
    '1 matching accounts',
  );
  const appoint = page.getByRole('button', { name: 'Appoint Global Admin', exact: true });
  await appoint.click();
  const dialog = page.getByRole('dialog', { name: 'Appoint Global Admin', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Reason', { exact: true })).toBeFocused();
  await dialog
    .getByLabel('Reason', { exact: true })
    .fill('Preserve guarded administrator appointment');
  await page.route('**/api/platform/admins/appoint', (route) =>
    route.fulfill({
      status: 409,
      json: { message: 'Account changed. Reload accounts.', code: 'account_version_conflict' },
    }),
  );
  await dialog.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(dialog.getByRole('button', { name: 'Confirm appointment' })).toBeDisabled();
  await expect(dialog.getByLabel('Reason', { exact: true })).toHaveValue(
    'Preserve guarded administrator appointment',
  );
  await page.unroute('**/api/platform/admins/appoint');
  await dialog.getByRole('button', { name: 'Reload accounts' }).click();
  await appoint.click();
  await dialog
    .getByLabel('Reason', { exact: true })
    .fill('Preserve guarded administrator appointment');
  await dialog.getByRole('button', { name: 'Confirm appointment' }).click();
  await expect(
    page.getByText('Global Admin appointed. Their existing sessions have ended.'),
  ).toBeVisible();
  const current = page.getByRole('table', { name: 'Current global administrators' });
  await current
    .getByRole('row')
    .filter({ hasText: 'demo.1.3@example.invalid' })
    .getByRole('button', { name: 'Manage access' })
    .click();
  const revoke = page.getByRole('dialog', { name: 'Revoke Global Admin', exact: true });
  await revoke
    .getByLabel('Reason', { exact: true })
    .fill('Restore synthetic member after UI verification');
  await revoke.getByRole('button', { name: 'Confirm revocation' }).click();
  await expect(
    page.getByText('Global Admin access revoked. Their existing sessions have ended.'),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await a11y();
  await page.screenshot({ path: `${screenshots}/admins-mobile.png`, fullPage: true });
  await page.route('**/api/accounts/manage?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Isolated account outage' } }),
  );
  await page.goto('/accounts');
  await expect(page.getByText('Isolated account outage')).toBeVisible();
  await page.unroute('**/api/accounts/manage?*');
  await page.getByRole('button', { name: 'Try loading accounts again' }).click();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await expect(page.getByText('No links have been issued.', { exact: false })).toBeVisible();
  await a11y();
  await page.screenshot({ path: `${screenshots}/accounts-mobile.png`, fullPage: true });
  await narrowLayouts();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${screenshots}/accounts-desktop.png`, fullPage: true });
  // Exercise the new shell's pre-mutation boundary with a synthetic dirty page.
  const mutations: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/api\/(clients\/select|auth\/logout)$/.test(req.url()))
      mutations.push(req.url());
  });
  await page.evaluate(() => {
    window.addEventListener('tat:query-work', (event) => {
      (event as CustomEvent).detail.dirty = true;
    });
  });
  await page
    .getByRole('combobox', { name: 'Active client', exact: true })
    .selectOption({ label: 'Demo Client 1' });
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect(mutations).toEqual([]);
  await expect(page).toHaveURL(/\/accounts$/);
  await page.reload();
  await page
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption({ label: 'Demo Client 1' });
  await page.getByLabel('Name', { exact: true }).fill('Synthetic account UI member');
  await page.getByLabel('Email', { exact: true }).fill('account-ui-member@example.invalid');
  await page
    .getByLabel('Your current password', { exact: true })
    .fill('Wrong password for recovery verification');
  await page
    .getByLabel('Reason', { exact: true })
    .fill('Verify private setup link remains guarded');
  await page.getByRole('button', { name: 'Review and continue' }).click();
  await expect(page.getByRole('group', { name: 'Review account action' })).toContainText(
    'account-ui-member@example.invalid',
  );
  await page.getByRole('button', { name: 'Create private link', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Back to details' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    'account-ui-member@example.invalid',
  );
  await page.getByLabel('Your current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Review and continue' }).click();
  await page.getByRole('button', { name: 'Create private link', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Private account link', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Private link', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Done with private link', exact: true }).click();
  await expect(page.getByLabel('Private link', { exact: true })).toHaveCount(0);
  const links = page.getByRole('table', { name: 'Issued account links' });
  await links.getByText('Manage link', { exact: true }).click();
  await links
    .getByLabel('Your current password to cancel Synthetic account UI member', { exact: true })
    .fill(password);
  await links
    .getByLabel('Cancellation reason', { exact: true })
    .fill('Cancel isolated unshared setup link');
  await links.getByRole('checkbox', { name: 'Cancel this private link.' }).check();
  await links.getByRole('button', { name: 'Cancel link', exact: true }).click();
  await expect(links.getByText('Cancelled', { exact: true })).toBeVisible();
  await page.goto('/account/security');
  await expect(
    page.getByText('Optional. Your password is currently enough to sign in.'),
  ).toBeVisible();
  await a11y();
  await page.screenshot({ path: `${screenshots}/security-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await a11y();
  await page.screenshot({ path: `${screenshots}/security-mobile.png`, fullPage: true });
  await narrowLayouts();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const menu = page.getByRole('dialog', { name: 'Workspace menu' });
  await expect(menu.getByRole('link', { name: 'Account security' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await a11y();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.route('**/api/auth/mfa', (route) =>
    route.fulfill({ status: 503, json: { message: 'Isolated security outage' } }),
  );
  await page.reload();
  await expect(page.getByText('Isolated security outage')).toBeVisible();
  await page.unroute('**/api/auth/mfa');
  await page.getByRole('button', { name: 'Reload security settings' }).click();
  await expect(
    page.getByRole('button', { name: 'Set up authenticator', exact: true }),
  ).toBeVisible();
  await page.route('**/api/auth/mfa', (route) =>
    route.fulfill({
      status: 403,
      json: { code: 'local_password_unavailable', message: 'Simulated sign-in fixture' },
    }),
  );
  await page.reload();
  await expect(
    page.getByText('Password and authenticator settings are unavailable', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Set up authenticator', exact: true })).toHaveCount(
    0,
  );
  await page.unroute('**/api/auth/mfa');
  await page.reload();
  await page
    .getByLabel('Your current password', { exact: true })
    .fill('Wrong current password for validation');
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Your current password', { exact: true })).toHaveValue(
    'Wrong current password for validation',
  );
  await page.getByLabel('Your current password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  const secret = await page.getByLabel('Authenticator setup key', { exact: true }).inputValue();
  await page
    .getByLabel('Authenticator code', { exact: true })
    .fill(new OTPAuth.TOTP({ secret }).generate());
  await page.getByRole('button', { name: 'Confirm authenticator', exact: true }).click();
  await expect(page.locator('.recovery-codes code')).toHaveCount(10);
  const recovery = await page.locator('.recovery-codes code').first().innerText();
  await page.getByRole('button', { name: 'I have saved my recovery codes' }).click();
  await expect(page.locator('.recovery-codes code')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Disable authenticator verification', exact: true })
    .click();
  await page.getByLabel('Your current password', { exact: true }).fill(password);
  await page.getByLabel('New authenticator or unused recovery code').fill(recovery);
  await page.getByRole('button', { name: 'Confirm disable' }).click();
  await expect(
    page.getByText('Authenticator verification disabled.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(password);
  await page
    .getByLabel('New password', { exact: true })
    .fill('Changed isolated account passphrase');
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('Changed isolated account passphrase');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Change password', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login\?passwordChanged=1/);

  for (const [email, admin, coordinator] of [
    ['demo.1.0@example.invalid', true, false],
    ['demo.1.2@example.invalid', false, true],
    ['demo.1.3@example.invalid', false, false],
  ] as const) {
    const isolated = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const p = await isolated.newPage();
      await login(p, email);
      await p.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
      await p.goto(origin + '/account/security');
      await expect(p.locator('[data-application-shell]')).toBeVisible();
      await p.getByRole('button', { name: 'Open navigation' }).click();
      const roleMenu = p.getByRole('dialog', { name: 'Workspace menu' });
      await expect(roleMenu.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(
        admin ? 1 : 0,
      );
      await expect(roleMenu.getByRole('link', { name: 'Review queue' })).toHaveCount(
        coordinator ? 1 : 0,
      );
      await expect(roleMenu.getByRole('link', { name: 'Platform administration' })).toHaveCount(0);
      await p.keyboard.press('Escape');
      await a11y(p);
      await p.goto(origin + '/platform/admins');
      await expect(p.getByRole('heading', { name: 'Global Admin access required' })).toBeVisible();
      await expect(p.getByRole('button', { name: 'Appoint Global Admin' })).toHaveCount(0);
      expect((await p.request.get(origin + '/api/platform/admins')).status()).toBe(403);
      await p.goto(origin + '/accounts');
      if (admin) await expect(p.getByRole('button', { name: 'Review and continue' })).toBeVisible();
      else await expect(p.getByRole('button', { name: 'Review and continue' })).toHaveCount(0);
    } finally {
      await isolated.close();
    }
  }
  expect(errors).toEqual([]);
});

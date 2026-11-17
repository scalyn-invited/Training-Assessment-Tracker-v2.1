import { promotionsFlow } from './promotions-flow.js';
import { onboardingFlow } from './onboarding-flow.js';
import { Database } from '../../packages/database/src/database.js';
import { randomUUID } from 'node:crypto';
import { assessmentBuilderFlow } from './assessment-flow.js';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as OTPAuth from 'otpauth';
test('fresh setup, password login and optional authenticator recovery', async ({
  page,
  request,
}) => {
  // This integrated journey includes setup, assessment authoring/review and learning delivery.
  // Keep individual action/assertion limits unchanged; allow the complete journey to finish.
  test.setTimeout(900000);
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
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Workspace' }).click();
  await page.getByRole('link', { name: 'Choose your client', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose your client' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/clients-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Active client', exact: true }).locator('option:checked'),
  ).toHaveText('Demo Client 1');

  await page.goto('/platform');
  await page.getByRole('link', { name: 'Manage clients', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Manage Demo Client 1', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create client', exact: true }).click();
  const clientDialog = page.getByRole('dialog');
  await clientDialog.getByLabel('Directory name').fill('Browser parity client');
  await clientDialog.getByLabel('Creation reason').fill('Synthetic browser verification');
  await clientDialog.getByRole('button', { name: 'Create client', exact: true }).click();
  await expect(page.getByText('Client created.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage Browser parity client', exact: true }).click();
  await clientDialog
    .getByLabel('Client change reason')
    .fill('Verify explicit suspension confirmation');
  await clientDialog.getByRole('button', { name: 'Suspend client', exact: true }).click();
  await expect(
    clientDialog.getByRole('heading', { name: 'Suspend Browser parity client?' }),
  ).toBeVisible();
  await clientDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await clientDialog.getByRole('button', { name: 'Suspend client', exact: true }).click();
  await clientDialog.getByRole('button', { name: 'Confirm suspension', exact: true }).click();
  await expect(page.getByText('Client suspended.', { exact: true })).toBeVisible();
  await page.getByLabel('Search clients', { exact: true }).fill('No matching client');
  await expect(page.getByText('No clients found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Manage Browser parity client', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.getByLabel('Search clients', { exact: true }).focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.locator('.skip').evaluate((el) => el.getBoundingClientRect().bottom <= 0)).toBe(
    true,
  );
  await page.screenshot({ path: 'output/playwright/directory-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'output/playwright/directory-desktop.png', fullPage: true });
  await page.locator('summary').filter({ hasText: 'Workspace' }).click();
  await page.getByRole('link', { name: 'Learning workspace', exact: true }).click();

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
  await page.goto('/account/security');
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
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();

  // Expose the optional control only; real SMTP remains disabled and the recipient is synthetic.
  await page.route('**/api/accounts/manage?*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, accountMailAvailable: true } });
  });
  await page.locator('summary').filter({ hasText: 'Workspace' }).click();
  await page.getByRole('link', { name: 'Manage account access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
  const createAccount = page;
  await expect(page.getByRole('combobox', { name: 'Client', exact: true })).toBeVisible();
  await createAccount
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption({ label: 'Demo Client 1' });
  await createAccount.getByLabel('Name', { exact: true }).fill('Browser invited member');
  await createAccount.getByLabel('Email', { exact: true }).fill('browser-member@example.invalid');
  await createAccount.getByLabel('Your current password', { exact: true }).fill(password);
  await createAccount
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic recipient setup verification');
  await page
    .locator('summary')
    .filter({ hasText: /^Optional email delivery$/ })
    .first()
    .click();
  await page
    .getByRole('checkbox', {
      name: 'Email this link to the approved recipient (optional)',
      exact: true,
    })
    .first()
    .check();
  await createAccount.getByRole('button', { name: 'Review and continue', exact: true }).click();
  await createAccount.getByRole('button', { name: 'Create private link', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Private account link', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Email was not sent. Delivery is disabled or this recipient is not approved. Share the private link manually.',
      { exact: true },
    ),
  ).toBeVisible();
  const privateLink = await page.getByLabel('Private link', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Done with private link', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/accounts-mobile.png', fullPage: true });
  await page.unroute('**/api/accounts/manage?*');
  const recipientContext = await page.context().browser()!.newContext();
  const recipient = await recipientContext.newPage();
  await recipient.goto(privateLink);
  await expect(
    recipient.getByRole('heading', { name: 'Set your password', exact: true }),
  ).toBeVisible();
  await recipient
    .getByLabel('New password', { exact: true })
    .fill('Browser recipient unique passphrase');
  await recipient
    .getByLabel('Confirm new password', { exact: true })
    .fill('Browser recipient unique passphrase');
  await recipient.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(recipient.getByRole('heading', { name: 'Account action completed' })).toBeVisible();
  await recipient.getByRole('link', { name: 'Continue to sign in' }).click();
  await recipient.getByLabel('Email', { exact: true }).fill('browser-member@example.invalid');
  await recipient
    .getByLabel('Password', { exact: true })
    .fill('Browser recipient unique passphrase');
  await recipient.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    recipient.getByRole('heading', { name: 'Choose your client', exact: true }),
  ).toBeVisible();
  await expect(recipient.getByRole('button', { name: 'Demo Client 1', exact: true })).toBeVisible();
  await expect(recipient.getByRole('button', { name: 'Demo Client 2', exact: true })).toHaveCount(
    0,
  );

  await page
    .getByRole('combobox', { name: 'Account operation', exact: true })
    .selectOption('existing');
  await page
    .getByRole('combobox', { name: 'Client', exact: true })
    .selectOption({ label: 'Demo Client 2' });
  await page.getByLabel('Email', { exact: true }).fill('browser-member@example.invalid');
  await page.getByLabel('Your current password', { exact: true }).fill(password);
  await page.getByLabel('Reason', { exact: true }).fill('Synthetic second-client invitation');
  await page.getByRole('button', { name: 'Review and continue', exact: true }).click();
  await page.getByRole('button', { name: 'Create private link', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Private account link', exact: true }),
  ).toBeVisible();
  const invitationLink = await page.getByLabel('Private link', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Done with private link', exact: true }).click();
  await recipient.goto(invitationLink);
  await recipient.getByRole('checkbox', { name: 'I accept this client invitation.' }).check();
  await recipient.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(recipient.getByRole('heading', { name: 'Account action completed' })).toBeVisible();

  await page.getByText('Manage setup and recovery links', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Action', exact: true }).selectOption('reset');
  await page
    .getByRole('combobox', { name: 'Account', exact: true })
    .selectOption({ label: 'Browser invited member \u2014 browser-member@example.invalid' });
  await page.getByLabel('Your current password for recovery', { exact: true }).fill(password);
  await page
    .getByLabel('Recovery reason', { exact: true })
    .fill('Synthetic account recovery verification');
  await page
    .getByRole('checkbox', { name: 'I have checked the recipient and recovery action.' })
    .check();
  await page.getByRole('button', { name: 'Issue private link', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Private account link', exact: true }),
  ).toBeVisible();
  const recoveryLink = await page.getByLabel('Private link', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Done with private link', exact: true }).click();
  await recipient.goto(recoveryLink);
  await recipient
    .getByLabel('New password', { exact: true })
    .fill('Changed recipient browser passphrase');
  await recipient
    .getByLabel('Confirm new password', { exact: true })
    .fill('Changed recipient browser passphrase');
  await recipient.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(recipient.getByRole('heading', { name: 'Account action completed' })).toBeVisible();
  await recipient.getByRole('link', { name: 'Continue to sign in' }).click();
  await recipient.getByLabel('Email', { exact: true }).fill('browser-member@example.invalid');
  await recipient
    .getByLabel('Password', { exact: true })
    .fill('Changed recipient browser passphrase');
  await recipient.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(recipient.getByRole('button', { name: 'Demo Client 1', exact: true })).toBeVisible();
  await expect(recipient.getByRole('button', { name: 'Demo Client 2', exact: true })).toBeVisible();

  await page.goto('/platform/audit');
  await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeEnabled();
  await expect(page.getByRole('table')).toContainText('platform.client.created');
  await page.getByLabel('Search reason or target').fill('no-event-matches-this-filter');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('No administrative events match');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('platform.client.created');
  await page
    .getByRole('combobox', { name: 'Action', exact: true })
    .selectOption('platform.client.created');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Action', exact: true })).toHaveValue(
    'platform.client.created',
  );
  await page
    .getByRole('button', { name: /^Details for/ })
    .first()
    .click();
  await expect(page.getByRole('dialog', { name: 'Change details' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/audit-mobile.png', fullPage: true });

  await page.goto('/platform/admins');
  await expect(page.getByRole('heading', { name: 'Global admins', exact: true })).toBeVisible();
  await expect(page.getByText('Protected: last active Global Admin.')).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search name or email' })
    .fill('demo.1.0@example.invalid');
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Appoint Global Admin', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Appoint Global Admin', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Appoint Global Admin', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic administrator continuity check');
  await page.getByRole('button', { name: 'Confirm appointment', exact: true }).click();
  await expect(page.getByText('2 active Global Admins.', { exact: false })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Account access' })).toContainText(
    'Already appointed',
  );
  const appointedRow = page
    .getByRole('table', { name: 'Current global administrators' })
    .getByRole('row')
    .filter({ hasText: 'demo.1.0@example.invalid' });
  await appointedRow.getByRole('button', { name: 'Manage access', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic administrator revocation check');
  await page.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
  await expect(page.getByText('Protected: last active Global Admin.')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/admins-mobile.png', fullPage: true });

  await page.goto('/clients');
  await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/administration');
  await expect(
    page.getByRole('heading', { name: 'People and programme administration', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Team name', { exact: true }).fill('Browser administration team');
  await page.getByLabel('Reason', { exact: true }).fill('Synthetic team administration check');
  await page.getByRole('button', { name: 'Create internal team', exact: true }).click();
  await expect(page.getByText('Client administration updated.', { exact: false })).toBeVisible();
  await page
    .getByRole('searchbox', { name: 'Search name or email' })
    .fill('demo.1.3@example.invalid');
  await page.getByRole('button', { name: 'Search people', exact: true }).click();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'Browser administration team' });
  await page
    .getByRole('dialog')
    .getByLabel('Reason', { exact: true })
    .first()
    .fill('Synthetic member team assignment');
  await page.getByRole('button', { name: 'Update team membership', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Browser administration team');

  await page
    .getByRole('dialog')
    .getByText('Roles and coordinator responsibility', { exact: true })
    .click();
  const roleForm = page
    .getByRole('dialog')
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Grant role', exact: true }) });
  await roleForm.getByRole('combobox', { name: 'Role', exact: true }).selectOption('coordinator');
  await roleForm
    .getByRole('combobox', { name: 'Role scope', exact: true })
    .selectOption({ label: 'Browser administration team — coordinator only' });
  await roleForm
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic scoped coordinator responsibility');
  await roleForm.getByRole('button', { name: 'Grant role', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByText('Roles and coordinator responsibility', { exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByText('coordinator — Browser administration team', { exact: true })
    .click();
  const revokeForm = page
    .getByRole('dialog')
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Revoke role', exact: true }) })
    .filter({ visible: true });
  await revokeForm
    .getByLabel('Reason', { exact: true })
    .fill('Synthetic responsibility revocation');
  await revokeForm.getByRole('button', { name: 'Revoke role', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
  await page.getByRole('button', { name: 'End client membership', exact: true }).click();
  await page.getByRole('button', { name: 'Keep membership', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm membership end', exact: true }),
  ).toHaveCount(0);

  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/administration-mobile.png', fullPage: true });
  await promotionsFlow(page);

  await recipient.goto('/platform/audit');
  await expect(
    recipient.getByRole('heading', { name: 'Global Admin access required' }),
  ).toBeVisible();

  const clientAdminContext = await page
    .context()
    .browser()!
    .newContext({ viewport: { width: 390, height: 844 } });
  const clientAdmin = await clientAdminContext.newPage();
  await clientAdmin.goto('/login');
  await clientAdmin.getByLabel('Email', { exact: true }).fill('demo.1.0@example.invalid');
  await clientAdmin
    .getByLabel('Password', { exact: true })
    .fill('Separate browser demo passphrase');
  await clientAdmin.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(clientAdmin).toHaveURL(/\/clients$/);

  await clientAdmin.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(clientAdmin).toHaveURL(/\/dashboard$/);
  await clientAdmin.goto('/administration');
  const allocationRow = clientAdmin
    .getByRole('table', { name: 'Current coordinator allocations' })
    .getByRole('row')
    .filter({ hasText: 'Demo Member 1.4' });
  await allocationRow.getByText('Review allocation', { exact: true }).click();
  await allocationRow
    .getByLabel('Sensitive access reason', { exact: true })
    .fill('Synthetic independent sensitive grant');
  await allocationRow
    .getByRole('checkbox', { name: 'I have checked the coordinator and member.' })
    .check();
  await allocationRow.getByRole('button', { name: 'Grant sensitive access', exact: true }).click();
  await expect(allocationRow).toContainText('Granted');
  await allocationRow.getByText('Review allocation', { exact: true }).click();
  await allocationRow
    .getByLabel('Sensitive access reason', { exact: true })
    .fill('Synthetic sensitive grant revocation');
  await allocationRow
    .getByRole('checkbox', { name: 'I have checked the coordinator and member.' })
    .check();
  await allocationRow.getByRole('button', { name: 'Revoke sensitive access', exact: true }).click();
  await expect(allocationRow).toContainText('Not granted');
  await allocationRow.getByText('Review allocation', { exact: true }).click();
  await allocationRow
    .getByLabel('End allocation reason', { exact: true })
    .fill('Synthetic allocation end verification');
  await allocationRow
    .getByRole('checkbox', { name: 'End responsibility for this member.' })
    .check();
  await allocationRow.getByRole('button', { name: 'Confirm allocation end', exact: true }).click();
  await expect(allocationRow).toHaveCount(0);
  await clientAdmin.getByText('Allocate a coordinator', { exact: true }).click();
  await clientAdmin
    .getByRole('combobox', { name: 'Member', exact: true })
    .selectOption({ label: 'Demo Member 1.4 — demo.1.4@example.invalid' });
  await clientAdmin
    .getByRole('combobox', { name: 'Coordinator', exact: true })
    .selectOption({ label: 'Demo Coordinator 1.2 — demo.1.2@example.invalid' });
  await clientAdmin
    .getByLabel('Allocation reason', { exact: true })
    .fill('Synthetic explicit replacement allocation');
  await clientAdmin.getByRole('button', { name: 'Create allocation', exact: true }).click();
  await expect(allocationRow).toContainText('Not granted');
  expect(
    (await new AxeBuilder({ page: clientAdmin }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  await page.goto('/platform/appearance');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByLabel('Platform display name', { exact: true }).fill('Browser shared platform');
  await page.getByLabel('Application name', { exact: true }).fill('Browser learning');
  await page.getByLabel('Brand colour hex value', { exact: true }).fill('#224466');
  await page
    .getByRole('combobox', { name: 'Default theme', exact: true })
    .selectOption('platform-light');
  await page
    .getByLabel('Reason for change', { exact: true })
    .fill('Synthetic platform appearance verification');
  await page.getByRole('button', { name: 'Save appearance', exact: true }).click();
  await expect(page.getByText('Platform appearance saved.', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-light');
  await page.goto('/settings/appearance');
  await page.getByLabel('Client name', { exact: true }).fill('Browser branded client');
  await page.getByLabel('Application name', { exact: true }).fill('Client learning');
  await page.getByLabel('Brand colour hex value', { exact: true }).fill('#7700bb');
  await page
    .getByRole('combobox', { name: 'Default theme', exact: true })
    .selectOption('client-light');
  await page.getByRole('button', { name: 'Save client branding', exact: true }).click();
  await expect(page.getByText('Client branding saved.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Client Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await page.getByRole('button', { name: 'Use client default', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-light');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'output/playwright/appearance-mobile.png', fullPage: true });

  await clientAdmin.goto('/administration');
  const enrolmentForm = clientAdmin.locator('section').filter({
    has: clientAdmin.getByRole('heading', { name: 'Create a training record', exact: true }),
  });
  await enrolmentForm
    .getByRole('combobox', { name: 'Training member', exact: true })
    .selectOption({ label: 'Demo Member 1.3' });
  await enrolmentForm
    .getByRole('combobox', { name: 'Primary coordinator', exact: true })
    .selectOption({ label: 'Demo Coordinator 1.2' });
  await enrolmentForm
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'Demo team' });
  await enrolmentForm.getByLabel('Training title', { exact: true }).fill('Browser training record');
  await enrolmentForm
    .getByLabel('Reason for creating this record', { exact: true })
    .fill('Synthetic browser enrolment verification');
  await enrolmentForm.getByRole('button', { name: 'Review training record', exact: true }).click();
  await expect(
    enrolmentForm.getByRole('heading', { name: 'Review training record', exact: true }),
  ).toBeFocused();
  await enrolmentForm.getByRole('button', { name: 'Back to edit', exact: true }).click();
  await expect(enrolmentForm.getByLabel('Training title', { exact: true })).toHaveValue(
    'Browser training record',
  );
  await enrolmentForm.getByRole('button', { name: 'Review training record', exact: true }).click();
  await enrolmentForm.getByRole('button', { name: 'Create training record', exact: true }).click();
  await expect(enrolmentForm).toContainText(
    'Training record created for Demo Member 1.3. Status: onboarding.',
  );
  expect(
    (await new AxeBuilder({ page: clientAdmin }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await clientAdmin.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await enrolmentForm.screenshot({ path: 'output/playwright/enrolment-form-mobile.png' });

  const assessmentAllocation = clientAdmin
    .getByRole('table', { name: 'Current coordinator allocations' })
    .getByRole('row')
    .filter({ hasText: 'Demo Member 1.3' });
  await assessmentAllocation.getByText('Review allocation', { exact: true }).click();
  await assessmentAllocation
    .getByLabel('Sensitive access reason', { exact: true })
    .fill('Synthetic assessment assignment grant');
  await assessmentAllocation
    .getByRole('checkbox', { name: 'I have checked the coordinator and member.' })
    .check();
  await assessmentAllocation
    .getByRole('button', { name: 'Grant sensitive access', exact: true })
    .click();
  await expect(assessmentAllocation).toContainText('Granted');
  await clientAdmin.goto('http://127.0.0.1:3110/settings/ai');
  await expect(
    clientAdmin.getByRole('heading', { name: 'AI provider settings', exact: true }),
  ).toBeVisible();
  await clientAdmin.getByRole('button', { name: 'Save assess initial route', exact: true }).click();
  await expect(
    clientAdmin.getByText(
      'Routing version 1 saved. Existing requests retain their configuration.',
      { exact: true },
    ),
  ).toBeVisible();
  await clientAdmin.reload();
  await expect(clientAdmin.getByText('Routing version 1', { exact: true })).toBeVisible();
  await expect(
    clientAdmin.getByText('No charges awaiting reconciliation.', { exact: true }),
  ).toBeVisible();
  await clientAdmin.setViewportSize({ width: 390, height: 844 });
  expect(
    (await new AxeBuilder({ page: clientAdmin }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await clientAdmin.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await clientAdmin.screenshot({
    path: 'output/playwright/ai-settings-mobile.png',
    fullPage: true,
  });
  await onboardingFlow(page.context().browser()!);
  await assessmentBuilderFlow(page.context().browser()!);
  // Synthetic ambiguous billing fixture: no provider request or external charge is made.
  const billingDb = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  const billingId = randomUUID();
  try {
    const inserted = await billingDb.pool.query(
      "INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,reserved,spent) SELECT $1::uuid,r.organisation_id,r.environment,r.enrolment_id,r.actor_id,$1::text,'synthetic-billing-fixture',r.task,r.subject_id,'ambiguous',r.configuration,r.task_input,1000,100 FROM ai_runs r JOIN enrolments e ON e.id=r.enrolment_id JOIN users u ON u.id=e.member_id WHERE r.environment='test' AND u.is_synthetic=true AND r.status='complete' ORDER BY r.created_at DESC LIMIT 1",
      [billingId],
    );
    expect(inserted.rowCount).toBe(1);
  } finally {
    await billingDb.close();
  }
  await clientAdmin.goto('http://127.0.0.1:3110/settings/ai');
  await clientAdmin
    .getByRole('spinbutton', { name: 'Verified total for ' + billingId, exact: true })
    .fill('150');
  await clientAdmin
    .getByRole('textbox', { name: 'Billing reason for ' + billingId, exact: true })
    .fill('Synthetic provider receipt verified for this test.');
  clientAdmin.once('dialog', (d) => d.dismiss());
  await clientAdmin.getByRole('button', { name: 'Record reconciliation', exact: true }).click();
  await expect(
    clientAdmin.getByRole('spinbutton', { name: 'Verified total for ' + billingId, exact: true }),
  ).toHaveValue('150');
  clientAdmin.once('dialog', (d) => d.accept());
  await clientAdmin.getByRole('button', { name: 'Record reconciliation', exact: true }).click();
  await expect(
    clientAdmin.getByText('Charge reconciliation recorded. The request was not retried.', {
      exact: true,
    }),
  ).toBeVisible();
  await clientAdmin.reload();
  await expect(
    clientAdmin.getByText('No charges awaiting reconciliation.', { exact: true }),
  ).toBeVisible();

  await clientAdminContext.close();

  await recipientContext.close();
});

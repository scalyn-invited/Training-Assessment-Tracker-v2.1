import { test, expect, type APIRequestContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import * as OTPAuth from 'otpauth';

test('guest sign-in and private account links preserve authentication and one-time authority', async ({
  page,
  request,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated guest administrator passphrase';
  const recipientPassword = 'Isolated guest recipient passphrase';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(
    path: string,
    data: Record<string, unknown>,
    client: APIRequestContext = request,
  ) {
    const ctx = await (await client.get('/api/auth/context')).json();
    const r = await client.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(r.ok(), `Request failed: ${path} (${r.status()})`).toBe(true);
    return r.json();
  }
  async function a11y() {
    for (const img of await page.locator('img[src^="/auth/"]').all()) {
      if (!(await img.isVisible())) continue;
      expect(
        await img.evaluate(
          (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
        ),
      ).toBe(true);
      const src = await img.getAttribute('src');
      const expected = src?.includes('key') || src?.includes('accepted') ? 26 : 18;
      const box = await img.boundingBox();
      expect(box!.width).toBe(expected);
      expect(box!.height).toBe(expected);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  async function shot(name: string) {
    // Explicit screenshots only, with no credentials, tokens or recovery secrets visible.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({ path: `output/playwright/guest-ui/${name}.png`, fullPage: true });
  }
  async function theme(name: string) {
    await page.locator('summary').filter({ hasText: 'Theme' }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', name.toLowerCase());
  }
  async function login(email: string, pass = recipientPassword) {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(pass);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await post('/auth/setup', {
    name: 'Guest UI administrator',
    email: 'guest-admin@example.invalid',
    password,
    demoPassword: 'Isolated guest demo passphrase',
  });
  await post('/auth/login', { email: 'guest-admin@example.invalid', password });
  const clients = await (await request.get('/api/clients')).json();
  const clientId = clients[0].id;
  const issued = await post('/accounts/create', {
    clientId,
    name: 'Guest UI recipient',
    email: 'guest-recipient@example.invalid',
    password,
    reason: 'Isolated guest UI verification',
    mode: 'new',
    synthetic: true,
  });

  await page.route('**/api/auth/sign-in-options', (r) =>
    r.fulfill({ status: 503, json: { message: 'Sign-in options are temporarily unavailable.' } }),
  );
  await page.goto('/login');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Sign-in options');
  await page.unroute('**/api/auth/sign-in-options');
  await page.getByRole('button', { name: 'Try loading again', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await theme('Dark');
  await a11y();
  await shot('sign-in-desktop');
  for (const width of [390, 320, 800]) {
    await page.setViewportSize({ width, height: 844 });
    await a11y();
    const inputBox = await page.getByLabel('Email', { exact: true }).boundingBox();
    expect(inputBox!.height).toBeGreaterThanOrEqual(48);
    expect(
      await page
        .getByLabel('Email', { exact: true })
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe('16px');
    if (width === 390) await shot('sign-in-mobile');
  }
  await theme('Light');
  await a11y();
  await page.locator('summary').filter({ hasText: 'Theme' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('summary').filter({ hasText: 'Theme' })).toBeFocused();
  for (const selectedTheme of ['neon-cyan', 'platform-dark']) {
    await page.evaluate(
      (t) => localStorage.setItem('training.v21.appearance.platform.guest', t),
      selectedTheme,
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', selectedTheme);
    await a11y();
  }
  await page.getByText('Forgot password?', { exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/contact your administrator for a private setup/)).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('guest-recipient@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(recipientPassword);
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.route('**/api/auth/login', (r) =>
    r.fulfill({ status: 401, json: { message: 'Check your email and password.' } }),
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Check your email');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
    'guest-recipient@example.invalid',
  );
  await page.unroute('**/api/auth/login');

  // Private tokens remain in fragments and POST bodies, never GET URLs or visible text.
  const leakedGets: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().includes(issued.token)) leakedGets.push(r.url());
  });
  await page.goto(issued.path);
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await theme('Dark');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await shot('account-link-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await a11y();
  await shot('account-link-mobile');
  await page.setViewportSize({ width: 320, height: 844 });
  await a11y();
  await expect(page.locator('body')).not.toContainText(issued.token);
  await page.getByLabel('New password', { exact: true }).fill(recipientPassword);
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('A different confirmation passphrase');
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(recipientPassword);
  await page.route('**/api/accounts/inspect', (r) =>
    r.fulfill({
      status: 503,
      json: { message: 'Private link verification is temporarily unavailable.' },
    }),
  );
  await page.getByRole('button', { name: 'Check this link again' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('temporarily unavailable');
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(recipientPassword);
  await page.unroute('**/api/accounts/inspect');
  await page.getByRole('button', { name: 'Check this link again' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(recipientPassword);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('header a[href="/login"]').click();
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue(recipientPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(recipientPassword);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/accounts/redeem', async (r) => {
    await delayed;
    await r.continue();
  });
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  page.once('dialog', (d) => d.accept());
  await page.locator('header a[href="/login"]').click();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Account action completed' })).toBeVisible();
  await page.unroute('**/api/accounts/redeem');
  await expect(page).toHaveURL(origin + '/account/link');
  expect(leakedGets).toEqual([]);
  await a11y();
  await page.goto(issued.path);
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
  await login('guest-recipient@example.invalid');
  await expect(page).not.toHaveURL(/\/login$/);
  const recipient = await (await page.request.get('/api/auth/context')).json();

  // Invitation must be accepted by the intended authenticated recipient.
  const invitation = await post('/accounts/create', {
    clientId: clients[1].id,
    name: 'Guest UI recipient',
    email: 'guest-recipient@example.invalid',
    password,
    reason: 'Isolated invitation verification',
    mode: 'existing',
    synthetic: true,
  });
  await page.goto(invitation.path);
  await expect(
    page.getByRole('checkbox', { name: 'I accept this client invitation.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(page.getByRole('checkbox')).toBeFocused();
  await page.getByRole('checkbox').check();
  await a11y();
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account action completed' })).toBeVisible();
  await login('guest-recipient@example.invalid');
  await expect(page).not.toHaveURL(/\/login$/);
  const memberships = await (await page.request.get('/api/clients')).json();
  expect(memberships.some((c: { id: string }) => c.id === clients[1].id)).toBe(true);

  const reset = await post('/accounts/recover', {
    userId: recipient.user.id,
    clientId,
    purpose: 'reset',
    password,
    reason: 'Isolated reset verification',
  });
  await page.goto(reset.path);
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill('Changed guest recipient passphrase');
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('Changed guest recipient passphrase');
  await page.getByRole('button', { name: 'Save password', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account action completed' })).toBeVisible();
  expect((await (await page.request.get('/api/auth/context')).json()).user).toBeNull();
  await login('guest-recipient@example.invalid', 'Changed guest recipient passphrase');
  await expect(page).not.toHaveURL(/\/login$/);
  const mfa = await post(
    '/auth/mfa/begin',
    { password: 'Changed guest recipient passphrase' },
    page.request,
  );
  const codes = await post(
    '/auth/mfa/confirm',
    { code: new OTPAuth.TOTP({ secret: mfa.secret }).generate() },
    page.request,
  );
  await post('/auth/logout', {}, page.request);
  await login('guest-recipient@example.invalid', 'Changed guest recipient passphrase');
  await expect(page.getByLabel('Authenticator or recovery code')).toBeVisible();
  await a11y();
  await page.getByLabel('Authenticator or recovery code').fill(codes.recoveryCodes[0]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await post('/auth/logout', {}, page.request);
  await page.goto('/account/link');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('incomplete');
  await a11y();
  // Changing the fragment clears the prior recipient and secret fields.
  await page.evaluate(() => {
    location.hash = 'token=' + '0'.repeat(64) + '&purpose=reset';
  });
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);

  // Configuration-only states use response fixtures; no fake login success is claimed.
  for (const mode of ['unavailable', 'mock']) {
    await page.route('**/api/auth/sign-in-options', (r) =>
      r.fulfill({ json: { mode, identities: [] } }),
    );
    await page.goto('/login');
    await expect(
      page.getByText(
        mode === 'mock' ? /No synthetic identities are available/ : /Sign-in is unavailable/,
      ),
    ).toBeVisible();
    await a11y();
    await page.unroute('**/api/auth/sign-in-options');
  }
  expect(errors).toEqual([]);
});

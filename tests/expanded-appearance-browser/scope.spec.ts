import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const dir = process.env.QA_EVIDENCE_DIR || 'evidence/expanded';
test('real API scoped navigation never renders target content in the previous scope theme', async ({
  page,
}) => {
  test.setTimeout(180000);
  await mkdir(dir, { recursive: true });
  const post = async (path: string, data: Record<string, unknown>) => {
    const c = await (await page.request.get('/api/auth/context')).json();
    const r = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: c.csrf },
    });
    expect(r.ok(), path + ' ' + r.status()).toBe(true);
    return r.json();
  };
  await post('/auth/setup', {
    name: 'Scope QA owner',
    email: 'scope-qa@example.invalid',
    password: 'Isolated scope QA passphrase',
    demoPassword: 'Isolated scope demo passphrase',
  });
  await post('/auth/login', {
    email: 'scope-qa@example.invalid',
    password: 'Isolated scope QA passphrase',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  const a = clients.find((c: any) => c.name === 'Demo Client 1');
  const b = clients.find((c: any) => c.name === 'Demo Client 2');
  for (const [client, theme, name, accent] of [
    [a, 'client-dark', 'QA Alpha', '#206070'],
    [b, 'client-light', 'QA Beta', '#825020'],
  ] as const) {
    await post('/clients/select', { clientId: client.id });
    const read = await page.request.get('/api/branding?clientId=' + client.id);
    expect(read.ok(), await read.text()).toBe(true);
    const brand = await read.json();
    await post('/branding', {
      clientId: client.id,
      version: brand.version,
      displayName: name,
      appName: 'Scope QA',
      accent,
      mode: 'white-label',
      theme,
      reason: 'Synthetic local scope verification',
    });
  }
  await post('/clients/select', { clientId: a.id });
  await page.addInitScript(() => {
    const w = window as any;
    w.__frames = [];
    const record = () => {
      if (document.body) {
        const main = document.querySelector('main'),
          r = main?.getBoundingClientRect();
        w.__frames.push({
          t: performance.now(),
          path: location.pathname,
          theme: document.documentElement.dataset.theme,
          bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
          heading: document.querySelector('main h1')?.textContent,
          shell: document
            .querySelector('[data-application-shell]')
            ?.getAttribute('data-application-shell'),
          rect: r ? { x: r.x, y: r.y, width: r.width } : null,
        });
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
  await page.goto('/platform');
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await page.locator('summary:visible').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('summary').filter({ hasText: 'Workspace' }).click();
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let requested!: () => void;
  const seen = new Promise<void>((r) => (requested = r));
  await page.route('**/api/branding/current?shared=0', async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await page.evaluate(() => {
    (window as any).__frames = [];
  });
  await page.getByRole('link', { name: 'Learning workspace', exact: true }).click();
  await seen;
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
  ).toBeVisible();
  const pending = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    heading: document.querySelector('main h1')?.textContent,
    frames: (window as any).__frames,
  }));
  await page.screenshot({ path: dir + '/scope-client-pending.png', fullPage: true });
  release();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await page.screenshot({ path: dir + '/scope-client-settled.png', fullPage: true });
  const frames = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/scope-transition.json', JSON.stringify({ pending, frames }, null, 2));
  expect
    .soft(
      pending.theme,
      'Target client content must not be displayed in shared Light while branding resolves',
    )
    .toBe('client-dark');
  await page.unroute('**/api/branding/current?shared=0');
  // Full document client switches: verify selected authority and pre-hydration frame themes.
  await page.getByRole('combobox', { name: 'Active client', exact: true }).selectOption(b.id);
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-light');
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
  ).toBeVisible();
  const ctx = await (await page.request.get('/api/auth/context')).json();
  expect(ctx.client.id).toBe(b.id);
  const bFrames = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/client-b-frames.json', JSON.stringify(bFrames, null, 2));
  expect(bFrames.filter((f: any) => f.theme !== 'client-light')).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
  ).toBeVisible();
  const reloadFrames = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/client-b-reload-frames.json', JSON.stringify(reloadFrames, null, 2));
  expect(reloadFrames.filter((f: any) => f.theme !== 'client-light')).toEqual([]);
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
    ).toBeVisible();
    const responsive = await page.evaluate(() => (window as any).__frames);
    await writeFile(
      dir + '/client-b-' + width + '-frames.json',
      JSON.stringify(responsive, null, 2),
    );
    expect(responsive.filter((f: any) => f.theme !== 'client-light')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: dir + '/client-b-' + width + '.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const owner = (await (await page.request.get('/api/auth/context')).json()).user;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Email', { exact: true }).fill('demo.1.3@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('Isolated scope demo passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);
  const member = (await (await page.request.get('/api/auth/context')).json()).user;
  expect(member.id).not.toBe(owner.id);
  await page.locator('summary:visible').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Choose your client', exact: true }),
  ).toBeVisible();
  const memberFrames = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/member-dark-reload-frames.json', JSON.stringify(memberFrames, null, 2));
  expect(memberFrames.filter((f: any) => f.theme !== 'dark')).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Email', { exact: true }).fill('scope-qa@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('Isolated scope QA passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const saved = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([k]) => k.startsWith('training.v21.appearance.')),
    ),
  );
  expect(saved['training.v21.appearance.platform.' + owner.environment + '.' + owner.id]).toBe(
    'light',
  );
  expect(saved['training.v21.appearance.platform.' + member.environment + '.' + member.id]).toBe(
    'dark',
  );
  await writeFile(
    dir + '/identity-summary.json',
    JSON.stringify(
      {
        distinctUsers: owner.id !== member.id,
        ownerPreference: 'light',
        memberPreference: 'dark',
        guestTheme: 'light',
        ownerReturnTheme: 'light',
      },
      null,
      2,
    ),
  );
});

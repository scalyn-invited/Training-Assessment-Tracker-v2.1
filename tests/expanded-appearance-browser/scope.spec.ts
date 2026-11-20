import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const dir = process.env.QA_EVIDENCE_DIR || 'evidence/expanded';
test('real API scoped navigation never renders target content in the previous scope theme', async ({
  page,
}) => {
  test.setTimeout(300000);
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
          viewport: { width: innerWidth, height: innerHeight },
          path: location.pathname,
          theme: document.documentElement.dataset.theme,
          bg: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
          heading: document.querySelector('main h1')?.textContent,
          pending: Boolean(document.querySelector('[data-appearance-pending]')),
          text: document.body.innerText,
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
  await page.waitForTimeout(150);
  await expect.soft(page.locator('[data-appearance-pending]')).toBeVisible();
  await expect
    .soft(page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }))
    .not.toBeVisible();
  const pending = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    heading: document.querySelector('main h1')?.textContent,
    frames: (window as any).__frames,
  }));
  // Full-page capture transiently changes Chromium's viewport to 1x1 in the
  // instrumented reproduction; viewport capture preserves the measured render.
  await page.screenshot({ path: dir + '/scope-client-pending.png', fullPage: false });
  release();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: dir + '/scope-client-settled.png', fullPage: false });
  const frames = await page.evaluate(() => (window as any).__frames);
  expect
    .soft(
      frames.filter((f: any) => f.viewport.width !== 1280 || f.viewport.height !== 720),
      'scope measurements retain configured viewport',
    )
    .toEqual([]);
  await writeFile(dir + '/scope-transition.json', JSON.stringify({ pending, frames }, null, 2));
  expect
    .soft(
      frames.filter(
        (f: any) =>
          f.heading === 'Welcome back, Scope QA owner.' &&
          (f.theme !== 'client-dark' || !f.text.includes('QA Alpha')),
      ),
    )
    .toEqual([]);
  expect
    .soft(frames.filter((f: any) => f.path === '/dashboard' && !f.shell && !f.pending))
    .toEqual([]);
  await page.unroute('**/api/branding/current?shared=0');
  const transition = async (
    label: string,
    shared: boolean,
    navigate: () => Promise<unknown>,
    fail = false,
  ) => {
    const pattern = '**/api/branding/current?shared=' + (shared ? '1' : '0');
    let open!: () => void, arrived!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const request = new Promise<void>((r) => (arrived = r));
    await page.route(pattern, async (route) => {
      arrived();
      await gate;
      if (fail) await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      else await route.continue();
    });
    await page.evaluate(() => ((window as any).__frames = []));
    await navigate();
    await request;
    await expect(page.locator('[data-appearance-pending]')).toBeVisible();
    await page.waitForTimeout(150);
    open();
    if (fail) {
      await expect(
        page.getByRole('button', { name: 'Retry appearance', exact: true }),
      ).toBeVisible();
      await expect(page.locator('[data-application-shell]')).toHaveCount(0);
      await page.unroute(pattern);
      await page.getByRole('button', { name: 'Retry appearance', exact: true }).click();
    }
    await expect(
      page.getByRole('heading', {
        name: shared ? 'Platform overview' : 'Welcome back, Scope QA owner.',
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute(
      'data-theme',
      shared ? 'light' : 'client-dark',
    );
    await page.waitForTimeout(100);
    const samples = await page.evaluate(() => (window as any).__frames);
    await writeFile(dir + '/' + label + '.json', JSON.stringify(samples, null, 2));
    const heading = shared ? 'Platform overview' : 'Welcome back, Scope QA owner.';
    expect(
      samples.filter(
        (f: any) =>
          f.heading === heading &&
          (f.theme !== (shared ? 'light' : 'client-dark') ||
            !f.text.includes(shared ? 'Scalyn' : 'QA Alpha')),
      ),
    ).toEqual([]);
    expect(
      samples.filter(
        (f: any) => f.path === (shared ? '/platform' : '/dashboard') && !f.shell && !f.pending,
      ),
    ).toEqual([]);
    await page.unroute(pattern);
  };
  await transition(
    'reverse-failure-retry',
    true,
    () => page.getByRole('link', { name: 'Platform administration', exact: true }).first().click(),
    true,
  );
  await transition('history-back-client', false, () => page.goBack());
  await transition('history-forward-platform', true, () => page.goForward());
  await transition('history-back-client-again', false, () => page.goBack());
  // Capture an old real response, then deliver it after a newer generation.
  const pattern = '**/api/branding/current?shared=0';
  let oldRelease!: () => void, oldSeen!: () => void;
  const oldGate = new Promise<void>((r) => (oldRelease = r));
  const oldRequest = new Promise<void>((r) => (oldSeen = r));
  await page.evaluate(() => ((window as any).__frames = []));
  let count = 0;
  await page.route(pattern, async (route) => {
    if (++count === 1) {
      const response = await route.fetch();
      const data = await response.json();
      oldSeen();
      await oldGate;
      await route.fulfill({
        json: { ...data, displayName: 'OBSOLETE RESPONSE', selectedTheme: 'light' },
      });
    } else await route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('brandingchanged')));
  await oldRequest;
  const newer = page.waitForResponse((r) => r.url().includes('/branding/current?shared=0'));
  await page.evaluate(() => window.dispatchEvent(new Event('brandingchanged')));
  await newer;
  oldRelease();
  await page.waitForTimeout(200);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await expect(page.getByText('OBSOLETE RESPONSE')).toHaveCount(0);
  const reordered = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/out-of-order-frames.json', JSON.stringify(reordered, null, 2));
  expect(
    reordered.filter(
      (f: any) =>
        f.heading === 'Welcome back, Scope QA owner.' &&
        (f.theme !== 'client-dark' ||
          !f.text.includes('QA Alpha') ||
          f.text.includes('OBSOLETE RESPONSE')),
    ),
  ).toEqual([]);
  await page.unroute(pattern);
  // An obsolete response from a departed scope cannot write the document either.
  let departedRelease!: () => void, departedSeen!: () => void;
  const departedGate = new Promise<void>((r) => (departedRelease = r));
  const departedRequest = new Promise<void>((r) => (departedSeen = r));
  await page.route(pattern, async (route) => {
    const response = await route.fetch();
    departedSeen();
    await departedGate;
    await route.fulfill({ response });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('brandingchanged')));
  await departedRequest;
  await transition('departed-response-platform', true, () => page.goForward());
  departedRelease();
  await page.waitForTimeout(200);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
  const departed = await page.evaluate(() => (window as any).__frames);
  expect(
    departed.filter(
      (f: any) =>
        f.heading === 'Platform overview' && (f.theme !== 'light' || !f.text.includes('Scalyn')),
    ),
  ).toEqual([]);
  await writeFile(dir + '/stale-response-frames.json', JSON.stringify(departed, null, 2));
  await page.unroute(pattern);
  await transition('return-after-stale-response', false, () => page.goBack());
  // Exercise a reused shell as well as document navigation: A -> B -> A must
  // resolve a new authority generation even though A's key appeared previously.
  let releaseB!: () => void, releaseA!: () => void;
  let seenB!: () => void, seenA!: () => void;
  const gateB = new Promise<void>((r) => (releaseB = r));
  const gateA = new Promise<void>((r) => (releaseA = r));
  const requestB = new Promise<void>((r) => (seenB = r));
  const requestA = new Promise<void>((r) => (seenA = r));
  let switched = 0;
  await page.route(pattern, async (route) => {
    const index = ++switched;
    const response = await route.fetch();
    if (index === 1) {
      seenB();
      await gateB;
    } else {
      seenA();
      await gateA;
    }
    await route.fulfill({ response });
  });
  const publishClient = async (id: string) => {
    await post('/clients/select', { clientId: id });
    const context = await (await page.request.get('/api/auth/context')).json();
    await page.evaluate(
      (context) => window.dispatchEvent(new CustomEvent('trackercontext', { detail: context })),
      context,
    );
  };
  await publishClient(b.id);
  await requestB;
  await expect(page.locator('[data-appearance-pending]')).toBeVisible();
  await page.evaluate(() => ((window as any).__frames = []));
  await publishClient(a.id);
  await requestA;
  await expect.soft(page.locator('[data-appearance-pending]')).toBeVisible({ timeout: 1000 });
  await page.waitForTimeout(100);
  const recycledPending = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/recycled-client-pending.json', JSON.stringify(recycledPending, null, 2));
  expect
    .soft(recycledPending.filter((f: any) => !f.pending || f.heading !== 'Opening workspace'))
    .toEqual([]);
  releaseA();
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
  ).toBeVisible();
  releaseB();
  await page.waitForTimeout(200);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await expect(page.locator('[data-application-shell]')).toContainText('QA Alpha');
  const recycled = await page.evaluate(() => (window as any).__frames);
  await writeFile(dir + '/recycled-client-frames.json', JSON.stringify(recycled, null, 2));
  expect(
    recycled.filter(
      (f: any) =>
        f.heading === 'Welcome back, Scope QA owner.' &&
        (f.theme !== 'client-dark' || !f.text.includes('QA Alpha')),
    ),
  ).toEqual([]);
  await page.unroute(pattern);
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
  expect(
    bFrames.filter(
      (f: any) => f.heading === 'Welcome back, Scope QA owner.' && !f.text.includes('QA Beta'),
    ),
  ).toEqual([]);
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

import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const dir = process.env.QA_EVIDENCE_DIR || 'evidence/candidate-final/scrollbar';
test('tablet directory loading preserves existing action positions', async ({ page }) => {
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

  for (const url of ['/platform', '/dashboard']) {
    await page.goto(url);
    await expect(page.locator('main h1')).toBeVisible();
    const menu = page.getByRole('button', { name: /^Theme / }).first();
    await menu.click();
    const saved =
      url === '/dashboard'
        ? page.waitForResponse(
            (r) => r.url().includes('/api/branding/preference') && r.request().method() === 'POST',
          )
        : null;
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    if (saved) expect((await saved).ok()).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  }

  await page.setViewportSize({ width: 820, height: 1000 });
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let seen!: () => void;
  const requested = new Promise<void>((r) => (seen = r));
  await page.route('**/api/platform/clients?*', async (route) => {
    seen();
    await held;
    await route.continue();
  });
  await page.goto('/platform/clients');
  await requested;
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  const capture = () =>
    page.evaluate(() => ({
      width: innerWidth,
      clientWidth: document.documentElement.clientWidth,
      theme: document.documentElement.dataset.theme,
      elements: [...document.querySelectorAll('main h1,main button,main input')]
        .filter(
          (e: any) =>
            e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) &&
            e.getBoundingClientRect().width > 0 &&
            e.getBoundingClientRect().y < innerHeight,
        )
        .map((e: any) => {
          const r = e.getBoundingClientRect();
          return {
            tag: e.tagName,
            text: e.innerText || e.getAttribute('aria-label') || e.placeholder,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          };
        }),
    }));
  const pending = await capture();
  await page.screenshot({ path: dir + '/pending.png' });
  release();
  await expect(page.getByText('Demo Client 1', { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(200);
  const settled = await capture();
  await page.screenshot({ path: dir + '/settled.png' });
  const moved = pending.elements.flatMap((p: any) => {
    const q = settled.elements.find((q: any) => q.tag === p.tag && q.text === p.text);
    return q && (Math.abs(p.rect.x - q.rect.x) > 1 || Math.abs(p.rect.y - q.rect.y) > 1)
      ? [{ before: p, after: q }]
      : [];
  });
  await writeFile(dir + '/geometry.json', JSON.stringify({ pending, settled, moved }, null, 2));
  expect(moved, 'existing visible controls must not jump when data arrives').toEqual([]);
});

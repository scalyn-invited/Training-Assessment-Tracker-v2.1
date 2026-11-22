import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const dir = process.env.QA_EVIDENCE_DIR || 'evidence/candidate-final/layouts';
test('shared and distinct static layouts retain Dark and heading geometry on throttled responsive reload', async ({
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

  for (const url of ['/platform', '/dashboard']) {
    await page.goto(url);
    await expect(page.locator('main h1')).toBeVisible();
    const menu = page.getByRole('button', { name: /^Theme(?: |$)/ }).first();
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
  await page.addInitScript(() => {
    const w = window as any;
    w.__layoutFrames = [];
    const tick = () => {
      if (document.body) {
        const h = document.querySelector('main h1'),
          box = h?.getBoundingClientRect(),
          range = document.createRange();
        if (h) range.selectNodeContents(h);
        const r = h ? range.getBoundingClientRect() : null;
        w.__layoutFrames.push({
          theme: document.documentElement.dataset.theme,
          heading: h?.textContent,
          containerWidth: box?.width,
          rect: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
          font: h ? getComputedStyle(h).font : null,
          pending: !!document.querySelector('[data-appearance-pending]'),
          width: innerWidth,
          overflow: document.documentElement.scrollWidth - innerWidth,
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.route('**/api/**', async (route) => {
    await new Promise((r) => setTimeout(r, 200));
    await route.continue();
  });
  const results: any[] = [];
  const urls = [
    '/platform',
    '/platform/clients',
    '/platform/people',
    '/platform/audit',
    '/platform/settings',
    '/platform/settings/status',
    '/accounts',
    '/account/security',
    '/clients',
    '/dashboard',
    '/people',
    '/administration',
    '/settings/ai',
    '/settings/appearance',
    '/enrolments',
    '/assessments',
    '/notifications',
    '/learning-reviews',
  ];
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const url of urls) {
      await page.goto(url);
      await expect(page.locator('main h1').first()).toBeVisible();
      await page.waitForTimeout(400);
      const frames = await page.evaluate(() => (window as any).__layoutFrames);
      const last = frames.at(-1);
      const matching = frames.filter(
        (f: any) => f.heading === last.heading && f.rect && f.rect.width > 0,
      );
      const badThemes = frames.filter((f: any) => f.theme !== 'dark');
      const geometry = matching.filter(
        (f: any) =>
          Object.keys(last.rect).some((k) => Math.abs(f.rect[k] - last.rect[k]) > 1) ||
          f.font !== last.font,
      );
      const result = {
        url,
        width,
        samples: frames.length,
        heading: last.heading,
        badThemes,
        geometry,
        overflow: frames.filter((f: any) => f.overflow > 1),
      };
      results.push(result);
      await writeFile(dir + '/summary.json', JSON.stringify(results, null, 2));
      await writeFile(
        dir + '/' + url.replaceAll('/', '_') + '-' + width + '.json',
        JSON.stringify(frames, null, 2),
      );
      expect.soft(badThemes, url + ' ' + width + ' immediate Dark').toEqual([]);
      expect.soft(geometry, url + ' ' + width + ' existing heading geometry').toEqual([]);
      expect.soft(result.overflow, url + ' ' + width + ' no horizontal overflow').toEqual([]);
      if (['/platform', '/dashboard', '/platform/clients', '/settings/ai'].includes(url))
        await page.screenshot({
          path: dir + '/' + url.replaceAll('/', '_') + '-' + width + '.png',
          fullPage: false,
        });
    }
  }
});

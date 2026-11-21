import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const dir = process.env.QA_EVIDENCE_DIR || 'evidence/round3/scope';
const capture = process.env.QA_CAPTURE !== '0';
test('instrument exact authority transition with capture control', async ({ page }) => {
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
    w.__events = [];
    new MutationObserver((ms) => {
      for (const m of ms)
        if (
          m.type === 'attributes' ||
          [...m.addedNodes, ...m.removedNodes].some(
            (n) => n instanceof HTMLStyleElement || n instanceof HTMLLinkElement,
          )
        )
          w.__events.push({
            t: performance.now(),
            type: m.type,
            target: (m.target as Element).tagName,
            attribute: m.attributeName,
            old: m.oldValue,
            html: (m.target as Element).outerHTML?.slice(0, 2000),
          });
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['style', 'media', 'disabled'],
    });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        w.__events.push({
          type: e.entryType,
          t: e.startTime,
          value: (e as any).value,
          sources: (e as any).sources?.map((s: any) => ({
            node: s.node?.outerHTML?.slice(0, 300),
            previous: s.previousRect,
            current: s.currentRect,
          })),
        });
    }).observe({ type: 'layout-shift', buffered: true });
    const record = () => {
      if (document.body) {
        const main = document.querySelector('main'),
          r = main?.getBoundingClientRect();
        w.__frames.push({
          t: performance.now(),
          viewport: {
            width: innerWidth,
            height: innerHeight,
            client: document.documentElement.clientWidth,
            scroll: scrollY,
          },
          capture: w.__capture || null,
          mainStyle: main
            ? {
                display: getComputedStyle(main).display,
                width: getComputedStyle(main).width,
                padding: getComputedStyle(main).padding,
                position: getComputedStyle(main).position,
              }
            : null,
          bodyStyle: {
            display: getComputedStyle(document.body).display,
            width: getComputedStyle(document.body).width,
          },
          styles: [...document.styleSheets].map((s) => ({
            href: s.href,
            disabled: s.disabled,
            media: s.media.mediaText,
            rules: (() => {
              try {
                return s.cssRules.length;
              } catch {
                return -1;
              }
            })(),
          })),
          brand: document.querySelector('[data-application-shell] header')?.textContent,
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
  for (let iteration = 0; iteration < 60; iteration++) {
    const dir = (process.env.QA_EVIDENCE_DIR || 'evidence/round3/scope') + '/' + iteration;
    await mkdir(dir, { recursive: true });
    await page.goto('/platform');
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /^Theme(?: |$)/ }).click();
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
    if (capture) {
      await page.evaluate(() => {
        (window as any).__capture = 'pending';
      });
      await page.screenshot({
        path: dir + '/scope-client-pending.png',
        fullPage: process.env.QA_CAPTURE !== 'viewport',
      });
      await page.evaluate(() => {
        (window as any).__capture = null;
      });
    }
    release();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
    await expect(
      page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
    ).toBeVisible();
    if (capture) {
      await page.evaluate(() => {
        (window as any).__capture = 'settled';
      });
      await page.screenshot({
        path: dir + '/scope-client-settled.png',
        fullPage: process.env.QA_CAPTURE !== 'viewport',
      });
      await page.evaluate(() => {
        (window as any).__capture = null;
      });
    }
    await page.waitForTimeout(300);
    await writeFile(
      dir + '/events.json',
      JSON.stringify(await page.evaluate(() => (window as any).__events), null, 2),
    );
    const frames = await page.evaluate(() => (window as any).__frames);
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
  }
});

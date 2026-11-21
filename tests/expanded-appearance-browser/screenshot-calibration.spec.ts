import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const dir = process.env.QA_EVIDENCE_DIR || 'evidence/candidate-final/screenshot-calibration';
test('screenshot observer calibration on settled dashboard', async ({ page }) => {
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
          viewport: { w: innerWidth, h: innerHeight },
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
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: /^Workspace / }).click();
  await page.getByRole('link', { name: 'Learning workspace', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back, Scope QA owner.', exact: true }),
  ).toBeVisible();
  const phases: any[] = [];
  for (const phase of ['idle', 'screenshots']) {
    await page.evaluate(() => {
      (window as any).__frames = [];
    });
    if (phase === 'idle') await page.waitForTimeout(3000);
    else
      for (let i = 0; i < 20; i++)
        await page.screenshot({ path: dir + '/capture-' + i + '.png', fullPage: true });
    const frames = await page.evaluate(() => (window as any).__frames);
    phases.push({ phase, frames });
  }
  await writeFile(dir + '/phases.json', JSON.stringify(phases, null, 2));
  expect(phases[0].frames.filter((f: any) => f.rect?.width < 400)).toEqual([]);
});

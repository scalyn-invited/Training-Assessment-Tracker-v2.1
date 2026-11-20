import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('login pre-hydration geometry matches the settled form', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('training.v21.appearance.platform.guest', 'dark'));
  let release!: () => void;
  const hydration = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/**/*.js*', async route => { await hydration; await route.continue(); });
  await page.goto('/login', { waitUntil: 'commit' });
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  const measure = () => page.evaluate(() => {
    const shell = document.querySelector('[data-guest-shell="sign-in"]')!;
    return ['header > div', 'footer', '.theme-picker > summary'].map(selector => shell.querySelector(selector)!.getBoundingClientRect().toJSON());
  });
  const before = await measure();
  await page.screenshot({ path: info.outputPath('before-hydration.png') });
  release();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.locator('.theme-current')).toHaveText('Dark');
  const after = await measure();
  await page.screenshot({ path: info.outputPath('settled.png') });
  await writeFile(info.outputPath('geometry.json'), JSON.stringify({ before, after }, null, 2));
  expect(after).toEqual(before);
});

test('login existing geometry stays stable across the exact reload matrix', async ({ page, context }, info) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => {
    localStorage.setItem('training.v21.appearance.platform.guest', 'dark');
    const frames: unknown[] = [];
    (window as any).geometryFrames = frames;
    const sample = () => {
      const shell = document.querySelector('[data-guest-shell="sign-in"]');
      if (shell) {
        const rect = (selector: string) => {
          const r = shell.querySelector(selector)?.getBoundingClientRect();
          return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
        };
        frames.push({ intro: rect('header > div'), footer: rect('footer'), theme: rect('.theme-picker > summary'), form: !!shell.querySelector('#email'), themeName: document.documentElement.dataset.theme });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const results = [];
  for (const [name, hard, cold, slow] of [
    ['normal-warm', false, false, false], ['hard-warm', true, false, false],
    ['normal-cold', false, true, false], ['hard-cold-800ms', true, true, true],
  ] as const) {
    if (cold) await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: slow ? 800 : 0, downloadThroughput: slow ? 200000 : -1, uploadThroughput: slow ? 100000 : -1 });
    const navigation = page.waitForEvent('domcontentloaded');
    await cdp.send('Page.reload', { ignoreCache: hard });
    await navigation;
    await page.screenshot({ path: info.outputPath(name + '-pending.png') });
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.locator('.theme-current')).toHaveText('Dark');
    await page.screenshot({ path: info.outputPath(name + '-settled.png') });
    const frames = await page.evaluate(() => (window as any).geometryFrames);
    results.push({ name, frames });
    // Warm built responses may settle before the first animation frame. The
    // separately gated test proves pre-hydration geometry; slow reload must
    // independently capture both stages without intercepting cache behavior.
    if (slow) expect.soft(frames.some((f: any) => !f.form), name + ' captured pending').toBe(true);
    expect.soft(frames.some((f: any) => f.form), name + ' captured form').toBe(true);
    for (const element of ['intro', 'footer', 'theme']) {
      const positions = [...new Set(frames.map((f: any) => JSON.stringify(f[element])))];
      expect.soft(positions, name + ': ' + element).toHaveLength(1);
    }
    expect.soft([...new Set(frames.map((f: any) => f.themeName))]).toEqual(['dark']);
  }
  await writeFile(info.outputPath('geometry.json'), JSON.stringify(results, null, 2));
});

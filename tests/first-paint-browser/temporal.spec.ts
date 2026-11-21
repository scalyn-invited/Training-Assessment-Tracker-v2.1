import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('visible frame samples remain navy across responsive reloads, throttling and recovery', async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|did not match/i.test(message.text()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    const samples: {
      at: number;
      theme: string | undefined;
      canvas: string;
      shell: string | null;
    }[] = [];
    (window as unknown as { paintSamples: typeof samples }).paintSamples = samples;
    const sample = () => {
      const main = document.querySelector('main');
      if (main && main.getBoundingClientRect().height > 0) {
        const shell = document.querySelector('[data-guest-shell]');
        samples.push({
          at: performance.now(),
          theme: document.documentElement.dataset.theme,
          canvas: getComputedStyle(document.body).backgroundColor,
          shell: shell ? getComputedStyle(shell).backgroundColor : null,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto('/login');
  await page.getByRole('button', { name: /^Theme / }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  for (const width of [1440, 801, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: width === 390 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: width === 390 ? 200 : 0,
      downloadThroughput: width === 390 ? 200000 : -1,
      uploadThroughput: width === 390 ? 100000 : -1,
    });
    await page.reload();
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
    await expect(page.locator('.theme-current')).toHaveText('Dark');
    await page.screenshot({ path: info.outputPath(`reload-${width}.png`) });
    const samples = await page.evaluate(
      () =>
        (
          window as unknown as {
            paintSamples: { at: number; theme: string; canvas: string; shell: string | null }[];
          }
        ).paintSamples,
    );
    expect(samples.length).toBeGreaterThan(0);
    expect([...new Set(samples.map((s) => s.theme))]).toEqual(['dark']);
    expect([...new Set(samples.map((s) => s.canvas))]).toEqual(['rgb(7, 11, 22)']);
    expect([...new Set(samples.map((s) => s.shell))]).toEqual(['rgb(7, 11, 22)']);
    const framePath = info.outputPath(`frames-${width}.json`);
    await writeFile(framePath, JSON.stringify(samples, null, 2));
    await info.attach(`frames-${width}`, {
      path: framePath,
      contentType: 'application/json',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.goto('/first-paint-missing-route');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(7, 11, 22)');
  expect(errors).toEqual([]);
});

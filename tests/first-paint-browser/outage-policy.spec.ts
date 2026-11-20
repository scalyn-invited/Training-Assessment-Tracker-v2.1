import { test, expect } from '@playwright/test';

// Owner-approved bounded exception, not the original strict generated-palette contract.
test('approved 503 fallback preserves scoped generated Dark intent through repeat failure and recovery', async ({
  page,
  context,
}, info) => {
  await context.addCookies([{ name: 'brand-failure', value: '1', url: 'http://127.0.0.1:3280' }]);
  await page.addInitScript(() =>
    localStorage.setItem('training.v21.appearance.platform.guest', 'platform-dark'),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_next/**/*.js*', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/login', { waitUntil: 'commit' });
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(7, 11, 22)');
  await expect(page.getByText('Appearance is unavailable. Retry appearance.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('503-before-hydration.png') });
  release();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByText('Appearance is unavailable. Retry appearance.')).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry appearance', exact: true });
  const failed = page.waitForResponse(
    (r) => r.url().includes('/api/branding/current') && r.status() === 503,
  );
  await retry.click();
  await failed;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(
    await page.evaluate(() => localStorage.getItem('training.v21.appearance.platform.guest')),
  ).toBe('platform-dark');
  await page.screenshot({ path: info.outputPath('503-repeat.png') });
  await context.clearCookies();
  await retry.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'platform-dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(17, 34, 51)');
  await expect(retry).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-appearance-fallback');
  expect(
    await page.evaluate(() => localStorage.getItem('training.v21.appearance.platform.guest')),
  ).toBe('platform-dark');
  await page.screenshot({ path: info.outputPath('503-recovered.png') });
});

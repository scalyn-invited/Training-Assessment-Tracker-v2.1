import { test, expect } from '@playwright/test';

test('saved Dark uses current navy before hydration and stays stable through loading', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem('training.v21.appearance.platform.guest', 'dark'),
  );
  let release!: () => void;
  const hydration = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_next/**/*.js*', async (route) => {
    await hydration;
    await route.continue();
  });
  await page.goto('/login', { waitUntil: 'commit' });
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(7, 11, 22)');
  await expect(page.locator('[data-guest-shell]')).toHaveCSS('background-color', 'rgb(7, 11, 22)');
  await expect(page.locator('[data-guest-shell] > header')).toContainText('Scalyn');
  await page.screenshot({ path: info.outputPath('before-hydration.png') });
  release();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: info.outputPath('settled.png') });
  expect(errors).toEqual([]);
});

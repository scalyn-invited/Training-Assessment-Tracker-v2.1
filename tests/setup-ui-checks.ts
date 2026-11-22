import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function setupA11y(page: Page) {
  await expect(page.locator('[data-guest-shell="setup"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  for (const img of await page.locator('img[src^="/setup/"]').all()) {
    if (!(await img.isVisible())) continue;
    expect(
      await img.evaluate(
        (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
      ),
    ).toBe(true);
    const box = await img.boundingBox();
    expect(box!.width).toBe(Number(await img.getAttribute('width')));
    expect(box!.height).toBe(Number(await img.getAttribute('height')));
  }
  if (page.viewportSize()!.width <= 800) {
    for (const control of await page
      .locator('main button, main input:not([type="radio"]):not([type="hidden"])')
      .all()) {
      if (!(await control.isVisible())) continue;
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      if ((await control.evaluate((el) => el.tagName)) === 'INPUT')
        expect(await control.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px');
    }
  }
}
export async function setupTheme(page: Page, name: string) {
  await page.locator('summary').filter({ hasText: 'Theme' }).click();
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', name.toLowerCase());
}
export async function setupShot(page: Page, name: string) {
  // Explicit non-secret states only; never capture populated token/password forms.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.screenshot({
    path: `output/playwright/setup-ui/${name}.png`,
    fullPage: true,
    style: 'nextjs-portal { visibility: hidden; }',
  });
}

import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

test('independent temporal authority and keyboard focus across held route verification', async ({ page }) => {
  test.setTimeout(120000);
  const post = async (path: string, data: Record<string, unknown>) => {
    const c = await (await page.request.get('/api/auth/context')).json();
    const r = await page.request.post('/api' + path, { headers: { Origin: 'http://127.0.0.1:3110' }, data: { ...data, csrf: c.csrf } });
    expect(r.ok()).toBe(true);
  };
  await post('/auth/setup', { name: 'Independent loading QA', email: 'independent-loading@example.invalid', password: 'Isolated loading QA passphrase', demoPassword: 'Isolated loading demo passphrase' });
  await post('/auth/login', { email: 'independent-loading@example.invalid', password: 'Isolated loading QA passphrase' });
  const records: unknown[] = [];
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/platform');
    await expect(page.getByRole('heading', { name: 'Platform overview', exact: true })).toBeVisible();
    let release!: () => void;
    const gate = new Promise<void>(r => release = r);
    let seen = false;
    await page.route('**/api/auth/context', async route => { seen = true; await gate; await route.continue(); });
    const nav = page.getByRole('navigation', { name: width <= 800 ? 'Mobile platform navigation' : 'Main navigation', exact: true });
    const link = nav.getByRole('link', { name: 'Clients', exact: true });
    await link.focus();
    await expect(link).toBeFocused();
    await page.evaluate(() => {
      const w = window as any; w.qaFrames = []; w.qaSampling = true;
      const sample = () => { if (!w.qaSampling) return; const main = document.querySelector('main');
        w.qaFrames.push({ time: performance.now(), pending: !!document.querySelector('[data-appearance-pending]'), neutral: document.documentElement.hasAttribute('data-shell-neutral'), heading: main?.querySelector('h1')?.textContent ?? '', focus: document.activeElement?.tagName, focusText: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.id, userVisible: document.body.innerText.includes('Independent loading QA') }); requestAnimationFrame(sample); }; requestAnimationFrame(sample);
    });
    await link.press('Enter');
    await expect.poll(() => seen).toBe(true);
    await expect(page.locator('[data-loading-spinner]')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-shell-neutral', '');
    await expect(page.locator('main h1')).toHaveCount(0);
    await expect(page.getByText('Independent loading QA', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-loading-context]')).not.toBeVisible();
    await expect(page.locator('[data-loading-context]')).toBeVisible({ timeout: 4500 });
    const pendingFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id }));
    release();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    const result = await page.evaluate(() => { const w = window as any; w.qaSampling = false; return { frames: w.qaFrames, settledFocus: { tag: document.activeElement?.tagName, id: document.activeElement?.id } }; });
    records.push({ width, pendingFocus, ...result });
    await page.unroute('**/api/auth/context');
    await mkdir('docs/loading-animation/qa', { recursive: true });
    await writeFile('docs/loading-animation/qa/temporal-focus.json', JSON.stringify(records, null, 2));
    expect(result.frames.filter((f: any) => f.neutral).length).toBeGreaterThan(0);
    expect(result.frames.filter((f: any) => f.neutral && (f.heading || f.userVisible))).toEqual([]);
    expect.soft(pendingFocus.tag, `Keyboard focus must not fall to body during held navigation at ${width}`).not.toBe('BODY');
    expect.soft(result.settledFocus.tag, `Keyboard focus must remain usable after navigation at ${width}`).not.toBe('BODY');
  }
});

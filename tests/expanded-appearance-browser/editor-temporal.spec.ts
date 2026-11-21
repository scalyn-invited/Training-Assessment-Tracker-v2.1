import { test, expect } from '@playwright/test';
import { install, start, finish } from './temporal-helper.js';
import { mkdir, writeFile } from 'node:fs/promises';
test('responsive editor controls through authority and section transitions', async ({ page }) => {
  test.setTimeout(90000);
  const out = process.env.BUILDER_GATE_EVIDENCE || 'evidence/builder-gate-fix/browser';
  await mkdir(out, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: Record<string, unknown>) {
    const c = await (await page.request.get('/api/auth/context')).json();
    const r = await page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: c.csrf },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  await post('/auth/setup', {
    name: 'QA Gate',
    email: 'gate@example.invalid',
    password: 'Isolated gate administrator',
    demoPassword: 'Isolated gate demonstration',
  });
  await post('/auth/login', {
    email: 'demo.1.2@example.invalid',
    password: 'Isolated gate demonstration',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  await post('/clients/select', {
    clientId: clients.find((c: { name: string }) => c.name === 'Demo Client 1').id,
  });

  await page.goto('/assessments');
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).click();
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/branding/preference') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await saved;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await install(page);
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let seen = false;
    await page.route('**/api/branding/current?*', async (r) => {
      seen = true;
      await gate;
      await r.continue();
    });
    await page.goto('/assessments/definitions/new');
    await expect.poll(() => seen).toBe(true);
    await expect(page.getByText('Opening workspace', { exact: true })).toBeVisible();
    await start(
      page,
      { title: '#assessment-title', save: '#save-draft', nav: '[data-section="questions"]' },
      'authority-pending-ready',
    );
    open();
    await expect(page.getByLabel('Assessment title', { exact: true })).toBeVisible();
    // Mark by accessible control rather than assume a generated ID.
    await page
      .getByRole('button', { name: 'Save draft', exact: true })
      .evaluate((e) => e.setAttribute('data-qa-save', ''));
    await finish(page, 'editor-ready-' + width, ['nav']);
    await page.unroute('**/api/branding/current?*');
    await page.getByLabel('Assessment title', { exact: true }).scrollIntoViewIfNeeded();
    await start(page, { title: '#assessment-title' }, 'title-input');
    await page.getByLabel('Assessment title', { exact: true }).fill('Temporal editor ' + width);
    await finish(page, 'editor-title-' + width, ['title']);
    // Changing section intentionally reveals Add question and active-tab styling.
    // Preserve the whole transition, but measure the stable existing Back link;
    // the source-defined toolbar insertion is not a loading/font reflow.
    await page
      .getByRole('link', { name: 'Back to assessments', exact: true })
      .evaluate((e) => e.setAttribute('data-qa-back', ''));
    await page.evaluate(() => scrollTo(0, 0));
    await start(
      page,
      { back: '[data-qa-back]', nav: '[data-section="questions"]', save: '[data-qa-save]' },
      'section-switch',
    );
    await page.locator('[data-section="questions"]').click();
    await expect(page.getByTestId('prompt-editor').first()).toBeVisible();
    await finish(page, 'editor-questions-' + width, ['back']);
    await expect(page.locator('[data-section="questions"]')).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.locator('#add-question-sticky')).toBeVisible();
    await page.getByTestId('prompt-editor').first().scrollIntoViewIfNeeded();
    await start(
      page,
      { prompt: '[data-testid="prompt-editor"]', nav: '[data-section="questions"]' },
      'question-input',
    );
    await page.getByTestId('prompt-editor').first().fill('Temporal synthetic prompt');
    await finish(page, 'editor-input-' + width, ['prompt']);
    await page.screenshot({
      path:
        (process.env.QA_EVIDENCE_DIR || 'evidence/round3/dynamic') + '/editor-' + width + '.png',
    });
    page.once('dialog', (d) => d.accept());
    await page.goto('/assessments');
  }
  expect(errors).toEqual([]);
});

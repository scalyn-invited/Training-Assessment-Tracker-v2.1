import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test('FOUC-QA-05 builder mounts after delayed appearance authority', async ({ page }) => {
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
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let requested = false;
  await page.route('**/api/branding/current?*', async (route) => {
    requested = true;
    await held;
    await route.continue();
  });
  await page.goto('/assessments/definitions/new');
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('[data-appearance-pending] [data-loading-spinner]')).toBeVisible();
  await expect(page.locator('#assessment-builder')).toHaveCount(0);
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveCount(0);
  // Ensure independent definition data has resolved while the host is gated.
  await expect
    .poll(async () =>
      (
        await page.request.get(
          '/api/assessments/definitions?clientId=' +
            clients.find((c: { name: string }) => c.name === 'Demo Client 1').id,
        )
      ).ok(),
    )
    .toBe(true);
  await page.screenshot({ path: out + '/pending.png' });
  release();
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  try {
    await expect(
      page.getByRole('heading', { name: 'Build an assessment', exact: true }),
    ).toBeVisible();
  } finally {
    await page.screenshot({ path: out + '/settled.png' });
    await writeFile(
      out + '/state.json',
      JSON.stringify(
        await page.evaluate(() => {
          const host = document.getElementById('assessment-builder')?.cloneNode(true) as
            HTMLElement | undefined;
          host
            ?.querySelectorAll('input[type="hidden"]')
            .forEach((input) => input.removeAttribute('value'));
          return {
            url: location.pathname,
            theme: document.documentElement.dataset.theme,
            host: host?.outerHTML,
            main: document.querySelector('main')?.innerText,
          };
        }),
        null,
        2,
      ),
    );
    await writeFile(out + '/errors.json', JSON.stringify(errors));
  }
  await expect(page.locator('#save-status')).toHaveText('Unsaved changes');
  const title = page.getByLabel('Assessment title', { exact: true });
  await title.fill('Saved before authority refresh');
  const input = await title.elementHandle();
  await page.unroute('**/api/branding/current?*');
  let releaseAppearance!: () => void;
  const appearance = new Promise<void>((resolve) => (releaseAppearance = resolve));
  let appearanceRequested = false;
  await page.route('**/api/branding/current?*', async (route) => {
    appearanceRequested = true;
    await appearance;
    await route.continue();
  });
  let releaseSave!: () => void;
  const save = new Promise<void>((resolve) => (releaseSave = resolve));
  let saveRequested = false;
  await page.route('**/api/assessments/builder', async (route) => {
    saveRequested = true;
    await save;
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(() => saveRequested).toBe(true);
  await title.fill('Newer unsaved edit survives save URL gate');
  releaseSave();
  await expect.poll(() => appearanceRequested).toBe(true);
  await expect(page.locator('[data-appearance-pending] [data-loading-spinner]')).toBeVisible();
  await expect(title).toHaveCount(0);
  releaseAppearance();
  await expect(title).toHaveValue('Newer unsaved edit survives save URL gate');
  expect(
    await input!.evaluate((node) => node === document.querySelector('#assessment-title')),
  ).toBe(true);
  await expect(page.locator('#save-status')).toHaveText(
    'Previous changes saved. Save again to keep your latest edits.',
  );
  let dialogs = 0;
  page.once('dialog', async (dialog) => {
    dialogs++;
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  expect(dialogs).toBe(1);
  await expect(title).toHaveValue('Newer unsaved edit survives save URL gate');
  await page.unroute('**/api/assessments/builder');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  const savedUrl = page.url();
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page).toHaveURL(/\/assessments$/);
  expect(
    await page.evaluate(() => {
      const state = { dirty: false, pending: false, uncertain: false };
      window.dispatchEvent(new CustomEvent('tat:query-work', { detail: state }));
      return state;
    }),
  ).toEqual({ dirty: false, pending: false, uncertain: false });
  await page.goto(savedUrl);
  await expect(title).toHaveValue('Newer unsaved edit survives save URL gate');
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  await page.screenshot({ path: out + '/saved-reloaded.png' });
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page).toHaveURL(/\/assessments$/);
  await page.getByRole('link', { name: 'Edit draft', exact: true }).first().click();
  await expect(title).toHaveValue('Newer unsaved edit survives save URL gate');
  await title.fill('History must retain this edit');
  let historyDialogs = 0;
  page.once('dialog', async (dialog) => {
    historyDialogs++;
    await dialog.dismiss();
  });
  await page.evaluate(() => history.back());
  await expect.poll(() => historyDialogs).toBe(1);
  await expect(page).toHaveURL(savedUrl);
  await expect(title).toHaveValue('History must retain this edit');
  expect(errors).toEqual([]);
});

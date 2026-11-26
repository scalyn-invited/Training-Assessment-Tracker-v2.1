import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
const source = readFileSync('docs/implementation/samples/assessment-proposals-v1.json', 'utf8');
test('JSON proposals require author review, append safely and keep rubric independent', async ({
  page,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110';
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    return page.request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
  }
  await post('/auth/setup', {
    name: 'Import fixture',
    email: 'import@example.invalid',
    password: 'Isolated import administrator',
    demoPassword: 'Isolated import demonstration',
  });
  await post('/auth/login', {
    email: 'import@example.invalid',
    password: 'Isolated import administrator',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  const clientId = clients.find((c: any) => c.name === 'Demo Client 1').id;
  await post('/clients/select', { clientId });
  expect((await post('/assessments/proposals/validate', { clientId, source })).status()).toBe(403);
  await page.context().clearCookies();
  await post('/auth/login', {
    email: 'demo.1.2@example.invalid',
    password: 'Isolated import demonstration',
  });
  await post('/clients/select', { clientId });
  expect((await post('/assessments/proposals/validate', { clientId, source })).ok()).toBe(true);
  const csrfContext = await (await page.request.get('/api/auth/context')).json();
  expect(
    (
      await page.request.post('/api/assessments/proposals/validate', {
        headers: { Origin: 'https://foreign.invalid' },
        data: { clientId, source, csrf: csrfContext.csrf },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/assessments/proposals/validate', {
        headers: { Origin: origin },
        data: { clientId, source, csrf: 'invalid' },
      })
    ).ok(),
  ).toBe(false);
  expect(
    (
      await post('/assessments/proposals/validate', {
        clientId: clients.find((c: any) => c.name === 'Demo Client 2').id,
        source,
      })
    ).status(),
  ).toBe(403);
  expect((await post('/assessments/proposals/validate', { clientId, source: '{' })).status()).toBe(
    422,
  );
  const before = await (
    await page.request.get('/api/assessments/definitions?clientId=' + clientId)
  ).json();
  await page.goto('/assessments/definitions/new');
  await page.getByLabel('Assessment title', { exact: true }).fill('JSON import review');
  await page.locator('[data-section=questions]').click();
  await page.getByLabel('Section title (required for publication)').fill('First section');
  await expect(page.getByLabel('JSON proposal file')).toBeHidden();
  const modal = page.getByRole('dialog', { name: 'Import questions', exact: true });
  const entry = page.getByRole('button', { name: 'Import questions', exact: true });
  const open = async () => {
    await entry.click();
    await expect(modal).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(
      modal.getByRole('heading', { name: 'Import questions', exact: true }),
    ).toBeFocused();
    await expect(
      modal.getByRole('heading', { name: 'Import questions', exact: true }),
    ).toHaveAttribute('tabindex', '-1');
  };
  const close = async () => {
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(entry).toBeFocused();
  };
  const discard = async (name: string, accept: boolean) => {
    const confirmation = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name, exact: true }).click();
    const dialog = await confirmation;
    expect(dialog.type()).toBe('confirm');
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await click;
  };
  await open();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.mouse.click(1, 1);
  await expect(modal).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(entry).toBeFocused();
  await open();
  const file = () => page.getByLabel('JSON proposal file');
  const upload = async () => {
    if (await file().evaluate((el: HTMLInputElement) => !!el.files?.length))
      page.once('dialog', (d) => d.accept());
    await file().setInputFiles({
      name: 'synthetic.json',
      mimeType: 'application/json',
      buffer: Buffer.from(source),
    });
    await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  };
  await upload();
  await expect(
    page.getByText('Preview only — not saved or shown to learners: Describe the safety check.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Select proposal 2').uncheck();
  await close();
  await open();
  expect(await file().evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe(
    'synthetic.json',
  );
  await expect(page.getByLabel('Select proposal 2')).not.toBeChecked();
  await discard('Cancel proposal preview', false);
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  await expect(page.getByLabel('Select proposal 2')).not.toBeChecked();
  await discard('Clear JSON import', false);
  expect(await file().evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe(
    'synthetic.json',
  );
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  await discard('Cancel proposal preview', true);
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(0);
  await expect(page.locator('#question-count')).toContainText('1 of 30');
  await upload();
  await page.getByLabel('Select proposal 2').uncheck();
  await page.getByRole('button', { name: 'Append selected questions' }).click();
  await expect(page.locator('#question-count')).toContainText('2 of 30');
  await expect(page.locator('#question-list')).toContainText('Untitled question');
  await expect(page.getByRole('button', { name: 'Append selected questions' })).toBeDisabled();
  await close();
  await page.locator('[data-section=rubric]').click();
  await expect(page.locator('#criterion-cards')).toContainText('No criteria yet');
  await page.locator('[data-section=questions]').click();
  await open();
  await expect(page.getByRole('button', { name: 'Append selected questions' })).toBeDisabled();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Replace assessment rubric' }).click();
  await close();
  await page.locator('[data-section=details]').click();
  await expect(page.locator('#assessment-threshold')).toHaveValue('');
  await page.locator('[data-section=questions]').click();
  await open();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Replace assessment rubric' }).click();
  await page.getByLabel('Select proposal 2').check();
  await page.getByRole('button', { name: 'Append selected questions' }).click();
  await expect(page.locator('#question-count')).toContainText('3 of 30');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await modal.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(
      await modal.evaluate((dialog) =>
        [dialog, ...dialog.querySelectorAll('*')].some((el) => {
          if (
            !/(auto|scroll)/.test(getComputedStyle(el).overflowY) ||
            el.scrollHeight <= el.clientHeight
          )
            return false;
          el.scrollTop = 1;
          const scrolled = el.scrollTop > 0;
          el.scrollTop = 0;
          return scrolled;
        }),
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/assessment-import-dialog-${width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/playwright/assessment-import-mobile.png', fullPage: true });
  expect(
    await (await page.request.get('/api/assessments/definitions?clientId=' + clientId)).json(),
  ).toEqual(before);
  await close();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(/definitions\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  const saved = await (
    await page.request.get(`/api/assessments/definitions?id=${id}&clientId=${clientId}`)
  ).json();
  expect(saved.questions).toHaveLength(3);
  expect(saved.questions[0].prompt).toBe('');
  const mcq = saved.questions.find((q: any) => q.type === 'multiple_choice');
  expect(mcq.id).not.toBe('q1');
  expect(saved.answer_key[mcq.id]).toBe(mcq.choices[0].id);
  expect(saved.rubric.threshold).toBe(70);
  expect(saved.rubric.criteria[0].id).not.toBe('r1');
  expect(JSON.stringify(saved)).not.toContain('Describe the safety check.');
  await page.reload();
  await page.locator('[data-section=questions]').click();
  await expect(page.locator('#question-count')).toContainText('3 of 30');
  await open();
  // Pending validation may be cancelled; its late result must not reopen the preview.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const arrived = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route('**/api/assessments/proposals/validate', async (route) => {
    const response = await route.fetch();
    reached();
    await held;
    await route.fulfill({ response });
  });
  await file().setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await arrived;
  await discard('Clear JSON import', false);
  expect(await file().evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe(
    'synthetic.json',
  );
  await discard('Clear JSON import', true);
  await close();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(modal).toBeHidden();
  await expect(entry).toBeFocused();
  await open();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(0);
  await file().setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  });
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to preview JSON' })).toBeVisible();
  // A successful response received while closed stays retained, without taking focus.
  let releaseClosed!: () => void;
  const closedHeld = new Promise<void>((resolve) => {
    releaseClosed = resolve;
  });
  let closedReached!: () => void;
  const closedArrived = new Promise<void>((resolve) => {
    closedReached = resolve;
  });
  await page.route('**/api/assessments/proposals/validate', async (route) => {
    const response = await route.fetch();
    closedReached();
    await closedHeld;
    await route.fulfill({ response });
  });
  page.once('dialog', (d) => d.accept());
  await file().setInputFiles({
    name: 'synthetic.json',
    mimeType: 'application/json',
    buffer: Buffer.from(source),
  });
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await closedArrived;
  await close();
  releaseClosed();
  await expect(
    page.getByRole('heading', { name: 'Review proposed questions', includeHidden: true }),
  ).toHaveCount(1);
  await expect(modal).toBeHidden();
  await expect(entry).toBeFocused();
  await page.unrouteAll({ behavior: 'wait' });
  await open();
  expect(await file().evaluate((el: HTMLInputElement) => el.files?.[0]?.name)).toBe(
    'synthetic.json',
  );
  await close();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await open();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  // Apply to the section selected at action time, not the section at import time.
  await close();
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByLabel('Section title (required for publication)').fill('Second section');
  let releaseSave!: () => void;
  const heldSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saveReached!: () => void;
  const saveArrived = new Promise<void>((resolve) => {
    saveReached = resolve;
  });
  await page.route('**/api/assessments/builder', async (route) => {
    const response = await route.fetch();
    saveReached();
    await heldSave;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await saveArrived;
  await open();
  await page.getByRole('button', { name: 'Append selected questions' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Finish or resolve' })).toBeVisible();
  await expect(page.locator('#question-count')).toContainText('3 of 30');
  releaseSave();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.locator('#save-status')).toContainText('Draft saved');
  await page.getByRole('button', { name: 'Append selected questions' }).click();
  await discard('Clear JSON import', true);
  await close();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Draft saved');
  const twice = await (
    await page.request.get(`/api/assessments/definitions?id=${id}&clientId=${clientId}`)
  ).json();
  expect(twice.sections[0].question_ids).toHaveLength(3);
  expect(twice.sections[1].question_ids).toHaveLength(2);
  expect(new Set(twice.questions.map((q: any) => q.id)).size).toBe(5);
  const secondMcq = twice.questions[3];
  expect(secondMcq.choices[0].id).not.toBe(mcq.choices[0].id);
  expect(twice.answer_key[secondMcq.id]).toBe(secondMcq.choices[0].id);
  await open();
  await upload();
  await close();
  for (let i = 5; i < 30; i++) await page.locator('#add-question').click();
  await open();
  await page.getByRole('button', { name: 'Append selected questions' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '30 questions' })).toBeVisible();
  await expect(page.locator('#question-count')).toContainText('30 of 30');
});

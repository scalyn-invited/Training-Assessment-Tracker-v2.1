import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('synthetic topic proposals are queued and explicitly reviewed, never auto-saved', async ({
  page,
}) => {
  test.setTimeout(180000);
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    return page.request.post('/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { ...data, csrf: ctx.csrf },
    });
  }
  await post('/auth/setup', {
    name: 'Topic fixture',
    email: 'topic@example.invalid',
    password: 'Isolated topic administrator',
    demoPassword: 'Isolated topic demonstration',
  });
  await post('/auth/login', {
    email: 'topic@example.invalid',
    password: 'Isolated topic administrator',
  });
  const clients = await (await page.request.get('/api/clients')).json();
  const clientId = clients.find((c: any) => c.name === 'Demo Client 1').id;
  await post('/clients/select', { clientId });
  expect(
    (
      await post('/assessments/proposals/topic', {
        clientId,
        idempotency: crypto.randomUUID(),
        options: { topic: 'Cedar workshop safety' },
      })
    ).status(),
  ).toBe(403);
  await page.context().clearCookies();
  await post('/auth/login', {
    email: 'demo.1.2@example.invalid',
    password: 'Isolated topic demonstration',
  });
  await post('/clients/select', { clientId });
  await page.goto('/assessments/definitions/new');
  const csrf = (await (await page.request.get('/api/auth/context')).json()).csrf;
  for (const [origin, suppliedCsrf] of [
    ['https://foreign.invalid', csrf],
    ['http://127.0.0.1:3110', 'invalid'],
  ]) {
    expect(
      (
        await page.request.post('/api/assessments/proposals/topic', {
          headers: { Origin: origin },
          data: {
            clientId,
            csrf: suppliedCsrf,
            idempotency: crypto.randomUUID(),
            options: { topic: 'Cedar workshop safety' },
          },
        })
      ).ok(),
    ).toBe(false);
  }
  await page.getByLabel('Assessment title', { exact: true }).fill('Topic review fixture');
  await page.locator('[data-section=questions]').click();
  const modal = page.getByRole('dialog', { name: 'Generate questions', exact: true });
  const entry = page.getByRole('button', { name: 'Generate questions', exact: true });
  const open = async () => {
    await entry.click();
    await expect(modal).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const title = modal.getByRole('heading', { name: 'Generate questions', exact: true });
    await expect(title).toHaveAttribute('tabindex', '-1');
    await expect(title).toBeFocused();
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
    expect(dialog.message()).toMatch(/discard any unapplied proposals/i);
    expect(dialog.message()).toMatch(/Applied questions and rubric stay in the builder/);
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await click;
  };
  await expect(page.getByLabel('Generation topic', { exact: true })).toBeHidden();
  await open();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await modal.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.mouse.click(1, 1);
  await expect(modal).toBeVisible();
  await expect(page.getByLabel('Generation topic', { exact: true })).toHaveValue(
    'Cedar workshop safety',
  );
  // A stale API's real-shaped missing route response is a definite first rejection.
  let unavailableRequests = 0;
  await page.route('**/api/assessments/proposals/topic', async (route) => {
    unavailableRequests++;
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'request_failed',
        message: 'Cannot POST /assessments/proposals/topic',
      }),
    });
  });
  await page.getByRole('button', { name: 'Generate synthetic proposals', exact: true }).click();
  await expect(modal.getByRole('alert')).toContainText(/API.*unavailable/i);
  await expect(modal.getByRole('alert')).toContainText(/restart/i);
  await expect(modal.getByRole('status')).not.toContainText(/outcome not confirmed/i);
  await expect(page.getByLabel('Generation topic', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Generation difficulty', { exact: true })).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Retry same generation request', exact: true }),
  ).toHaveCount(0);
  await close();
  await open();
  await page.getByLabel('Generation difficulty', { exact: true }).selectOption('easy');
  await discard('Cancel generation / clear preview', true);
  await expect(page.getByLabel('Generation difficulty', { exact: true })).toHaveValue('medium');
  expect(unavailableRequests).toBe(1);
  await page.unroute('**/api/assessments/proposals/topic');
  await page.getByLabel('Generation topic', { exact: true }).fill('Arbitrary real topic');
  await page.getByRole('button', { name: 'Generate synthetic proposals', exact: true }).click();
  await expect(
    page.getByText(/Only the fixed Cedar workshop safety synthetic topic is enabled/),
  ).toBeVisible();
  await expect(page.getByLabel('Generation topic', { exact: true })).toBeEnabled();
  await page.getByLabel('Generation topic', { exact: true }).fill('Cedar workshop safety');
  await page.getByLabel('Generation difficulty', { exact: true }).selectOption('hard');
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(entry).toBeFocused();
  await open();
  await expect(page.getByLabel('Generation topic', { exact: true })).toHaveValue(
    'Cedar workshop safety',
  );
  await expect(page.getByLabel('Generation difficulty', { exact: true })).toHaveValue('hard');
  // Lose the real admission receipt only after the real worker completes. Replay
  // returns {id,status:'complete'}, not a proposal: explicit status retrieval must remain usable.
  const admissions: unknown[] = [];
  let admittedId = '';
  let browserStatusRequests = 0;
  let releaseReplay!: () => void;
  const replayHeld = new Promise<void>((resolve) => {
    releaseReplay = resolve;
  });
  let replayReached!: () => void;
  const replayArrived = new Promise<void>((resolve) => {
    replayReached = resolve;
  });
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/assessments/proposals/topic/status')
      browserStatusRequests++;
  });
  await page.route('**/api/assessments/proposals/topic', async (route) => {
    admissions.push(route.request().postDataJSON());
    // A later missing route or server failure cannot disprove the lost admission.
    if (admissions.length === 2 || admissions.length === 3) {
      await route.fulfill({
        status: admissions.length === 2 ? 404 : 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'request_failed',
          message:
            admissions.length === 2
              ? 'Cannot POST /assessments/proposals/topic'
              : 'Service unavailable',
        }),
      });
      return;
    }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const receipt = await response.json();
    if (admissions.length === 1) {
      admittedId = receipt.id;
      await expect(async () => {
        const status = await post('/assessments/proposals/topic/status', {
          clientId,
          id: admittedId,
        });
        expect(status.ok()).toBe(true);
        expect((await status.json()).status).toBe('complete');
      }).toPass({ timeout: 45000 });
      await route.abort('failed');
    } else {
      expect(receipt).toEqual({ id: admittedId, status: 'complete' });
      replayReached();
      await replayHeld;
      await route.fulfill({ response });
    }
  });
  await page.getByRole('button', { name: 'Generate synthetic proposals', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Retry same generation request', exact: true });
  await expect(retry).toBeEnabled();
  expect(admissions).toHaveLength(1);
  for (const message of [/API.*unavailable/i, /Service unavailable/]) {
    await retry.click();
    await expect(modal.getByRole('alert')).toContainText(message);
    await expect(modal.getByRole('alert')).not.toContainText('no generation was started');
    await expect(modal.getByRole('status')).toContainText('Request outcome not confirmed');
    await expect(page.getByLabel('Generation topic', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('Generation difficulty', { exact: true })).toBeDisabled();
    await expect(retry).toBeEnabled();
    expect(admissions[admissions.length - 1]).toEqual(admissions[0]);
    await close();
    await open();
    expect(browserStatusRequests).toBe(0);
  }
  expect(admissions).toHaveLength(3);
  await retry.click();
  await replayArrived;
  await close();
  releaseReplay();
  await expect(page.getByText(/^Generation complete\./)).toHaveText(/Generation complete\./);
  await expect(modal).toBeHidden();
  await expect(entry).toBeFocused();
  await open();
  await expect(page.getByText(/^Generation complete\./)).toBeVisible();
  expect(admissions).toHaveLength(4);
  for (const replay of admissions.slice(1)) expect(replay).toEqual(admissions[0]);
  expect(browserStatusRequests).toBe(0);
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Refresh generation status', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Refresh generation status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  expect(browserStatusRequests).toBe(1);
  expect(admissions).toHaveLength(4);
  await expect(
    page.getByRole('button', { name: 'Refresh generation status', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/assessments/proposals/topic');
  await expect(async () => {
    if (
      await page.getByRole('button', { name: 'Refresh generation status', exact: true }).isEnabled()
    )
      await page.getByRole('button', { name: 'Refresh generation status', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  }).toPass({ timeout: 45000 });
  expect(await page.getByRole('checkbox', { name: /Select proposal/ }).count()).toBe(5);
  expect(
    (await (await page.request.get('/api/assessments/definitions?clientId=' + clientId)).json())
      .total,
  ).toBe(0);
  await expect(
    page.getByText('Preview only — not saved or shown to learners:', { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel('Select proposal 2', { exact: true }).uncheck();
  await close();
  await open();
  await expect(page.getByLabel('Select proposal 2', { exact: true })).not.toBeChecked();
  await discard('Clear generation preview', false);
  await discard('Cancel proposal preview', false);
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  await expect(page.getByLabel('Select proposal 2', { exact: true })).not.toBeChecked();
  await page.getByLabel('Select proposal 2', { exact: true }).check();
  await page.getByRole('button', { name: 'Append selected questions', exact: true }).click();
  await expect(
    page.getByText('5 question(s) appended. Unsaved changes. Rubric unchanged.', { exact: true }),
  ).toBeVisible();
  await close();
  await open();
  await expect(
    page.getByRole('button', { name: 'Append selected questions', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Replace assessment rubric', exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await modal.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
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
      path: `output/playwright/assessment-topic-dialog-${width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await page.screenshot({ path: 'output/playwright/assessment-topic-mobile.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Replace assessment rubric', exact: true }).click();
  await close();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page).toHaveURL(/definitions\/[0-9a-f-]{36}$/);
  const id = page.url().split('/').pop();
  const saved = await (
    await page.request.get(`/api/assessments/definitions?id=${id}&clientId=${clientId}`)
  ).json();
  expect(saved.questions).toHaveLength(6);
  expect(saved.questions[0].prompt).toBe('');
  for (const q of saved.questions.filter((q: any) => q.type === 'multiple_choice'))
    expect(saved.answer_key[q.id]).toBe(q.choices[0].id);
  expect(saved.rubric.criteria).toHaveLength(1);
  expect(JSON.stringify(saved)).not.toContain('Stop work, protect others');
  expect(JSON.stringify(saved)).not.toContain('suggested_answer');
  await open();
  await discard('Clear generation preview', true);
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(0);
  await expect(page.locator('#question-count')).toContainText('6 of 30');
  await close();
  await page.reload();
  await page.locator('[data-section=questions]').click();
  await expect(page.locator('#question-count')).toContainText('6 of 30');
  // Both previews remain mounted, but only one modal may be visible at a time.
  await open();
  await page.getByRole('button', { name: 'Generate synthetic proposals', exact: true }).click();
  await expect(async () => {
    if (
      await page.getByRole('button', { name: 'Refresh generation status', exact: true }).isEnabled()
    )
      await page.getByRole('button', { name: 'Refresh generation status', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  }).toPass({ timeout: 45000 });
  await close();
  await page.getByRole('button', { name: 'Import questions', exact: true }).click();
  const importModal = page.getByRole('dialog', { name: 'Import questions', exact: true });
  await expect(importModal).toBeVisible();
  await expect(modal).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page
    .getByLabel('JSON proposal file')
    .setInputFiles('docs/implementation/samples/assessment-proposals-v1.json');
  await page.getByRole('button', { name: 'Preview JSON', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Review proposed questions', includeHidden: true }),
  ).toHaveCount(2);
  expect(
    await page.evaluate(() => {
      const ids = [...document.querySelectorAll('h3[id]')].map((el) => el.id);
      return ids.filter((id, i) => ids.indexOf(id) !== i);
    }),
  ).toEqual([]);
  await importModal.getByRole('button', { name: 'Close', exact: true }).click();
  await open();
  await expect(page.getByRole('checkbox', { name: /Select proposal/ })).toHaveCount(5);
  await discard('Cancel proposal preview', true);
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toHaveCount(0);
  await close();
  await page.getByRole('button', { name: 'Import questions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review proposed questions' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Select proposal/ })).toHaveCount(2);
});

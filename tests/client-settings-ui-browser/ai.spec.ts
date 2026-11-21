import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Database } from '../../packages/database/src/database.js';

test('client AI settings preserve routing versions, billing holds, permissions and recovery', async ({
  page,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated client settings passphrase';
  const demo = 'Isolated client settings demo passphrase';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    const response = await page.request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  async function a11y() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  }
  await post('/auth/setup', {
    name: 'Client settings reviewer',
    email: 'client-settings@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/settings/ai');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'client-settings@example.invalid', password });
  await page.goto('/settings/ai');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  await post('/clients/select', { clientId: client });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/ai/settings?*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/settings/ai');
  await expect(page.getByText('Loading provider settings...', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Provider registry', exact: true })).toBeVisible();
  await page.unroute('**/api/ai/settings?*');
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'AI settings', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await page.screenshot({
    path: 'output/playwright/client-settings/ai-desktop.png',
    fullPage: true,
  });
  for (const width of [320, 390, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: 'output/playwright/client-settings/ai-mobile.png',
    fullPage: true,
  });
  const primary = page.getByLabel('Primary provider for Assess initial', { exact: true });
  const fallback = page.getByLabel('Fallback provider for Assess initial', { exact: true });
  const save = page.getByRole('button', { name: 'Save assess initial route', exact: true });
  await primary.focus();
  await page.keyboard.press('Tab');
  await expect(fallback).toBeFocused();
  await save.click();
  await expect(
    page.getByText('Routing version 1 saved. Existing requests retain their configuration.', {
      exact: true,
    }),
  ).toBeVisible();
  // A concurrent editor wins; the original form cannot overwrite that version.
  await post('/ai/policy', {
    clientId: client,
    task: 'assess_initial',
    expectedVersion: 1,
    primary: 'mock',
    fallback: null,
  });
  await fallback.selectOption('mock');
  await save.click();
  await expect(
    page.getByText('Routing changed; reload before saving.', { exact: true }),
  ).toBeVisible();
  await expect(fallback).toHaveValue('mock');
  const reload = page.getByRole('button', { name: 'Reload provider settings', exact: true });
  page.once('dialog', (d) => d.dismiss());
  await reload.click();
  await expect(fallback).toHaveValue('mock');
  page.once('dialog', (d) => d.accept());
  await reload.click();
  await expect(page.getByText('Routing version 2', { exact: true })).toBeVisible();
  await expect(fallback).toHaveValue('');
  await page.route('**/api/ai/policy', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Synthetic routing outage. Try saving again.' },
    }),
  );
  await save.click();
  await expect(page.getByText('Synthetic routing outage. Try saving again.')).toBeVisible();
  await page.unroute('**/api/ai/policy');
  await save.click();
  await expect(
    page.getByText('Routing version 3 saved. Existing requests retain their configuration.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.route('**/api/ai/settings?*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic settings outage.' } }),
  );
  await page.reload();
  await expect(page.getByText('Synthetic settings outage.')).toBeVisible();
  await page.unroute('**/api/ai/settings?*');
  await page.getByRole('button', { name: 'Try loading again', exact: true }).click();
  await expect(primary).toHaveValue('mock');
  const actual = await (await page.request.get('/api/ai/settings?clientId=' + client)).json();
  await page.route('**/api/ai/settings?*', (route) =>
    route.fulfill({ json: { ...actual, providers: [] } }),
  );
  await page.reload();
  await expect(
    page.getByText('No qualified provider is configured.', { exact: false }),
  ).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(
    page.getByText('No charges awaiting reconciliation.', { exact: true }),
  ).toBeVisible();
  await a11y();
  await page.unroute('**/api/ai/settings?*');
  // Explicit synthetic ambiguous billing fixture, no generation/provider call.
  const choices = await (
    await page.request.get('/api/enrolments/choices?clientId=' + client)
  ).json();
  await post('/enrolments', {
    clientId: client,
    memberId: choices.members.find((m: { name: string }) => m.name === 'Demo Member 1.3').id,
    coordinatorId: choices.coordinators.find(
      (m: { name: string }) => m.name === 'Demo Coordinator 1.2',
    ).id,
    groupId: null,
    title: 'Synthetic billing UI record',
    reason: 'Isolated billing reconciliation fixture',
  });
  const id = randomUUID();
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    const inserted = await db.pool.query(
      `INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,reserved,spent)
      SELECT $1::uuid,e.organisation_id,e.environment,e.id,e.member_id,$1::text,'synthetic-ui-billing','assess_initial',e.id,'ambiguous','{"fixture":"unchanged-configuration"}','synthetic-ui-fixture',1000,100
      FROM enrolments e JOIN users u ON u.id=e.member_id WHERE e.organisation_id=$2 AND e.environment='test' AND u.is_synthetic=true LIMIT 1`,
      [id, client],
    );
    expect(inserted.rowCount).toBe(1);
    await page.reload();
    const total = page.getByRole('spinbutton', { name: 'Verified total for ' + id, exact: true });
    const reason = page.getByRole('textbox', { name: 'Billing reason for ' + id, exact: true });
    const reconcile = page.getByRole('button', { name: 'Record reconciliation', exact: true });
    await total.fill('99');
    await reason.fill('Synthetic provider receipt verified for this test.');
    await reconcile.click();
    expect(await total.evaluate((el: HTMLInputElement) => el.validity.rangeUnderflow)).toBe(true);
    await total.fill('150');
    page.once('dialog', (d) => d.dismiss());
    await reconcile.click();
    await expect(total).toHaveValue('150');
    await page.route('**/api/ai/runs/*/reconcile', (route) =>
      route.fulfill({ status: 503, json: { message: 'Synthetic billing outage.' } }),
    );
    page.once('dialog', (d) => d.accept());
    await reconcile.click();
    await expect(page.getByText('Synthetic billing outage.')).toBeVisible();
    await expect(reason).toHaveValue('Synthetic provider receipt verified for this test.');
    await page.unroute('**/api/ai/runs/*/reconcile');
    await a11y();
    await page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Uncertain charges', exact: true }) })
      .screenshot({ path: 'output/playwright/client-settings/ai-reconciliation-mobile.png' });
    page.once('dialog', (d) => d.accept());
    await reconcile.click();
    await expect(
      page.getByText('Charge reconciliation recorded. The request was not retried.', {
        exact: true,
      }),
    ).toBeVisible();
    const row = (
      await db.pool.query('SELECT status,spent,reserved,configuration FROM ai_runs WHERE id=$1', [
        id,
      ])
    ).rows[0];
    expect(row).toMatchObject({
      status: 'failed',
      spent: '150',
      reserved: '0',
      configuration: { fixture: 'unchanged-configuration' },
    });
    expect(
      (
        await db.pool.query(
          'SELECT id FROM ai_attempts WHERE ai_block_id IN (SELECT id FROM ai_blocks WHERE ai_run_id=$1)',
          [id],
        )
      ).rowCount,
    ).toBe(0);
  } finally {
    await db.close();
  }
  // Independent real roles: client admin saves; coordinator/member cannot read or mutate routing.
  for (const [email, allowed] of [
    ['demo.1.0@example.invalid', true],
    ['demo.1.1@example.invalid', false],
    ['demo.1.3@example.invalid', false],
  ] as const) {
    const ctx = await browser.newContext({ baseURL: origin });
    const p = await ctx.newPage();
    try {
      const guest = await (await p.request.get('/api/auth/context')).json();
      expect(
        (
          await p.request.post('/api/auth/login', {
            headers: { Origin: origin },
            data: { csrf: guest.csrf, email, password: demo },
          })
        ).ok(),
      ).toBe(true);
      const user = await (await p.request.get('/api/auth/context')).json();
      expect(
        (
          await p.request.post('/api/clients/select', {
            headers: { Origin: origin },
            data: { csrf: user.csrf, clientId: client },
          })
        ).ok(),
      ).toBe(true);
      await p.goto('/settings/ai');
      if (allowed) {
        await p.getByRole('button', { name: 'Save assess initial route', exact: true }).click();
        await expect(
          p.getByText('Routing version 4 saved. Existing requests retain their configuration.', {
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await expect(
          p.getByText('Client administration authority is required.', { exact: true }),
        ).toBeVisible();
        const current = await (await p.request.get('/api/auth/context')).json();
        expect((await p.request.get('/api/ai/settings?clientId=' + client)).status()).toBe(403);
        expect(
          (
            await p.request.post('/api/ai/policy', {
              headers: { Origin: origin },
              data: {
                csrf: current.csrf,
                clientId: client,
                task: 'assess_initial',
                expectedVersion: 4,
                primary: 'mock',
                fallback: null,
              },
            })
          ).status(),
        ).toBe(403);
      }
    } finally {
      await ctx.close();
    }
  }
  expect(errors).toEqual([]);
});

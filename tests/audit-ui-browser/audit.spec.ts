import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Database } from '../../packages/database/src/database.js';
const screenshots = process.env.UI_QA_SCREENSHOTS ?? 'output/playwright';

test('Audit Log preserves read-only evidence and filters across desktop, mobile and history', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated audit administrator passphrase';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function post(route: string, data: Record<string, unknown>) {
    const context = await (await request.get('/api/auth/context')).json();
    const response = await request.post('/api' + route, {
      headers: { Origin: origin },
      data: { ...data, csrf: context.csrf },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await post('/auth/setup', {
    name: 'Audit reviewer',
    email: 'audit@example.invalid',
    password,
    demoPassword: 'Isolated fictional member passphrase',
  });
  await post('/auth/login', { email: 'audit@example.invalid', password });
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  try {
    const actor = (await db.pool.query("SELECT id FROM users WHERE email='audit@example.invalid'"))
      .rows[0].id;
    await db.pool.query(
      `INSERT INTO platform_audit_events(id,environment,actor_id,operator_reference,action,target_id,reason,changes,created_at) VALUES
      ($1,'test',$4,NULL,'local.login','client-a','Local password sign-in','{}','2026-11-13T02:14:15Z'),
      ($2,'test',$4,NULL,'platform.client.updated','client-a','Reviewed client name change',$5,'2026-11-13T02:12:49Z'),
      ($3,'test',NULL,'audit-operator','platform.admin.granted','client-b','First-install administrator setup','{}','2026-11-13T01:03:29Z')`,
      [
        ...ids,
        actor,
        {
          before: { name: 'Original client', suspended: false },
          after: { name: 'Updated client', suspended: true },
          private_token: 'DO-NOT-EXPOSE-AUDIT-SECRET',
        },
      ],
    );
    const original = (
      await db.pool.query(
        'SELECT * FROM platform_audit_events WHERE id=ANY($1::uuid[]) ORDER BY id',
        [ids],
      )
    ).rows;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill('audit@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Audit log' })
      .click();
    const main = page.getByRole('main'),
      table = page.getByRole('table', { name: 'Administrative audit' });
    const apply = page.getByRole('button', { name: 'Apply filters', exact: true });
    const clear = page.getByRole('button', { name: 'Clear filters', exact: true });
    const search = page.getByRole('searchbox', { name: 'Search reason or target' });
    async function a11y() {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
          .violations,
      ).toEqual([]);
    }
    await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Main navigation' })
        .getByRole('link', { name: 'Audit log' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(table).toContainText('First-install administrator setup');
    await a11y();
    await page.screenshot({ path: `${screenshots}/audit-light-desktop.png`, fullPage: true });
    await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await a11y();
    await page.screenshot({ path: `${screenshots}/audit-dark-desktop.png`, fullPage: true });
    const group = page.getByRole('button', { name: '2026-11-13, 3 events on this page' });
    await group.click();
    await expect(table.getByText('Local password sign-in', { exact: true })).not.toBeVisible();
    await group.click();
    await expect(table.getByText('Local password sign-in', { exact: true })).toBeVisible();
    const details = table.getByRole('button', {
      name: 'Details for platform.client.updated at 2026-11-13T02:12:49.000Z',
      exact: true,
    });
    await details.click();
    const dialog = page.getByRole('dialog', { name: 'Change details', exact: true });
    await expect(dialog).toContainText('Original client');
    await expect(dialog).toContainText('Updated client');
    await expect(dialog).toContainText('false');
    await expect(dialog).toContainText('true');
    await expect(dialog).toContainText(ids[1]);
    await expect(dialog).not.toContainText('DO-NOT-EXPOSE');
    await a11y();
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
    await details.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await table.getByRole('button', { name: /Details for local.login/ }).click();
    await expect(dialog).toContainText('No detailed change payload was recorded');
    await page.keyboard.press('Escape');
    await table.getByRole('button', { name: /Details for platform.admin.granted/ }).click();
    await expect(dialog).toContainText('Operator: audit-operator');
    await page.keyboard.press('Escape');
    await search.fill('does-not-exist');
    await apply.click();
    await expect(table).toContainText('No administrative events match these filters.');
    await clear.click();
    await expect(table).toContainText('Reviewed client name change');
    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByLabel('Exact target ID').fill('client-a');
    await page.getByLabel('Actor name').fill('Audit reviewer');
    await page.getByLabel('From (UTC)').fill('2026-11-13');
    await page.getByLabel('To (UTC)').fill('2026-11-13');
    await page
      .getByRole('combobox', { name: 'Action', exact: true })
      .selectOption('platform.client.updated');
    await apply.click();
    await expect(main.getByRole('status')).toHaveText('1 matching events');
    await page.reload();
    await expect(main.getByRole('status')).toHaveText('1 matching events');
    await expect(page.getByLabel('Exact target ID')).toHaveValue('client-a');
    await expect(page.getByRole('button', { name: /More filters/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await clear.click();
    await expect(table).toContainText('First-install administrator setup');
    await page.goBack();
    await expect(main.getByRole('status')).toHaveText('1 matching events');
    await page.goForward();
    await expect(table).toContainText('First-install administrator setup');
    await page.getByLabel('From (UTC)').fill('2026-11-14');
    await page.getByLabel('To (UTC)').fill('2026-11-13');
    await apply.click();
    await expect(main.getByRole('alert')).toContainText('ordered UTC date range');
    await expect(page.getByLabel('From (UTC)')).toHaveValue('2026-11-14');
    await clear.click();
    await expect(table).toContainText('Reviewed client name change');
    await page.route('**/api/platform/audit?*', (route) =>
      route.fulfill({ status: 503, json: { message: 'Audit temporarily unavailable.' } }),
    );
    await apply.click();
    await expect(main.getByRole('alert')).toContainText('Audit temporarily unavailable.');
    await page.unroute('**/api/platform/audit?*');
    await page.getByRole('button', { name: 'Retry audit' }).click();
    await expect(table).toContainText('Reviewed client name change');

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.setViewportSize({ width: 390, height: 1458 });
    await a11y();
    await page.screenshot({ path: `${screenshots}/audit-dark-mobile.png`, fullPage: true });
    await details.click();
    await a11y();
    await page.screenshot({ path: `${screenshots}/audit-details-mobile.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
    await page
      .getByRole('navigation', { name: 'Mobile platform navigation' })
      .getByRole('button', { name: 'Settings' })
      .click();
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    await settings.locator('summary').filter({ hasText: 'Theme' }).click();
    await settings.getByRole('button', { name: 'Light', exact: true }).click();
    await settings.getByRole('button', { name: 'Close', exact: true }).click();
    await a11y();
    await page.screenshot({ path: `${screenshots}/audit-light-mobile.png`, fullPage: true });
    expect(
      await page
        .locator(
          'img[src^="/images/audit/"], img[src^="/images/people/"], img[src^="/images/overview/"], img[src^="/images/clients/"]',
        )
        .evaluateAll((images) =>
          images.flatMap((node) => {
            const img = node as HTMLImageElement,
              box = img.getBoundingClientRect();
            return !img.getClientRects().length ||
              (img.complete &&
                img.naturalWidth > 0 &&
                Math.abs(box.width - img.naturalWidth) < 0.01 &&
                Math.abs(box.height - img.naturalHeight) < 0.01)
              ? []
              : [img.src];
          }),
        ),
    ).toEqual([]);

    // More than one page, plus UTC boundaries: grouping must reflect this page, not invent daily totals.
    for (let i = 0; i < 27; i++)
      await db.pool.query(
        "INSERT INTO platform_audit_events(id,environment,actor_id,action,target_id,reason,changes,created_at) VALUES($1,'test',$2,'fixture.pagination','page-target',$3,'{}',$4)",
        [
          randomUUID(),
          actor,
          'Pagination event ' + i,
          i === 0 ? '2026-11-13T23:59:59Z' : `2026-11-14T00:00:${String(i).padStart(2, '0')}Z`,
        ],
      );
    await page.goto('/platform/audit?action=fixture.pagination&keep=retained#events');
    await expect(main.getByRole('status')).toHaveText('27 matching events');
    await expect(
      page.getByRole('button', { name: '2026-11-14, 25 events on this page' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(table.getByRole('button', { name: /Details for/ })).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: '2026-11-13, 1 event on this page' }),
    ).toBeVisible();
    await page.reload();
    await expect(table.getByRole('button', { name: /Details for/ })).toHaveCount(2);
    await page.goBack();
    await expect(table.getByRole('button', { name: /Details for/ })).toHaveCount(25);
    await page.getByLabel('From (UTC)').fill('2026-11-13');
    await page.getByLabel('To (UTC)').fill('2026-11-13');
    await apply.click();
    await expect(main.getByRole('status')).toHaveText('1 matching events');
    expect(new URL(page.url()).searchParams.get('page')).toBeNull();
    expect(new URL(page.url()).searchParams.get('keep')).toBe('retained');
    expect(new URL(page.url()).hash).toBe('#events');
    await expect(table).toContainText('23:59:59');
    await expect(table).not.toContainText('00:00:01');
    expect(
      (
        await db.pool.query(
          'SELECT * FROM platform_audit_events WHERE id=ANY($1::uuid[]) ORDER BY id',
          [ids],
        )
      ).rows,
    ).toEqual(original);

    const touch = await browser.newContext({
      baseURL: origin,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      storageState: await page.context().storageState(),
    });
    const mobile = await touch.newPage();
    await mobile.goto('/platform/audit');
    await expect(mobile.getByRole('button', { name: 'Apply filters', exact: true })).toBeEnabled();
    for (const control of [
      mobile.getByRole('button', { name: 'Apply filters', exact: true }),
      mobile.getByRole('button', { name: 'More filters' }),
      mobile.getByRole('searchbox', { name: 'Search reason or target' }),
      mobile.getByRole('button', { name: /Details for/ }).first(),
      mobile.getByRole('button', { name: 'Next page' }),
    ])
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await mobile.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const footer = await mobile.locator('footer').last().boundingBox();
    const bottomNav = await mobile.getByRole('navigation', { name: 'Mobile platform navigation' }).boundingBox();
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(bottomNav!.y);
    await mobile.screenshot({ path: `${screenshots}/audit-touch-bottom.png` });
    await touch.close();
    const member = await browser.newContext({ baseURL: origin }),
      memberPage = await member.newPage();
    await memberPage.goto('/login');
    await memberPage.getByLabel('Email', { exact: true }).fill('demo.3.9@example.invalid');
    await memberPage
      .getByLabel('Password', { exact: true })
      .fill('Isolated fictional member passphrase');
    await memberPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(memberPage).not.toHaveURL(/\/login$/);
    await memberPage.goto('/platform/audit');
    await expect(
      memberPage.getByRole('heading', { name: 'Global Admin access required' }),
    ).toBeVisible();
    expect((await member.request.get('/api/platform/audit')).status()).toBe(403);
    await member.close();
    expect(errors).toEqual([]);
  } finally {
    await db.close();
  }
});

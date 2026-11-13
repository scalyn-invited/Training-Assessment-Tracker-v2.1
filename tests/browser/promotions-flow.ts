import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { Database } from '../../packages/database/src/database.js';
export async function promotionsFlow(page: Page) {
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres'),
    user = randomUUID();
  let client: string;
  try {
    client = (await db.pool.query("SELECT id FROM organisations WHERE name='Demo Client 1'"))
      .rows[0].id;
    // Real-classified isolated contract fixture; adapter remains unconfigured, no network request.
    await db.pool.query(
      "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic,password_enabled) VALUES($1,'Browser promotion fixture','promotion-browser@example.invalid','disabled','test',false,false)",
      [user],
    );
    await db.pool.query(
      "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'https://idp.example.invalid',$2::text)",
      [randomUUID(), user],
    );
    await db.pool.query(
      "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
      [randomUUID(), client, user],
    );
    await page.goto('/administration');
    await page.getByLabel('Search name or email', { exact: true }).fill('promotion-browser');
    await page.getByRole('button', { name: 'Search people', exact: true }).click();
    await expect(page.getByText('Browser promotion fixture', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
    await page.getByText('Prepare promotion to Cerebru', { exact: true }).click();
    const reason = 'Reviewed isolated promotion fixture identity';
    await page.getByLabel('Promotion reason', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Review promotion action', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel promotion review', exact: true }).click();
    await expect(page.getByLabel('Promotion reason', { exact: true })).toHaveValue(reason);
    let failedKey = '';
    await page.route('**/api/promotions/prepare', async (route) => {
      failedKey = route.request().postDataJSON().key;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Promotion preparation could not be saved. Try again.' }),
      });
    });
    await page.getByRole('button', { name: 'Review promotion action', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm preparation', exact: true }).click();
    await expect(
      page.getByText('Promotion preparation could not be saved. Try again.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Promotion reason', { exact: true })).toHaveValue(reason);
    await page.unroute('**/api/promotions/prepare');
    await page.getByRole('button', { name: 'Confirm preparation', exact: true }).click();
    await expect(
      page.getByText('Promotion prepared. Review its status in the promotion ledger.', {
        exact: true,
      }),
    ).toBeVisible();
    const promotion = (
      await db.pool.query('SELECT id,idempotency_key FROM promotions WHERE user_id=$1', [user])
    ).rows[0];
    expect(promotion.idempotency_key).toBe(failedKey);
    const ledger = page.getByRole('region', { name: 'Promotion ledger', exact: true });
    await ledger.getByRole('button', { name: 'Review request', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel request review', exact: true }).click();
    await expect(ledger.getByText('Prepared locally', { exact: true })).toBeVisible();
    await ledger.getByRole('button', { name: 'Review request', exact: true }).click();
    await page
      .getByLabel('Review reason', { exact: true })
      .fill('Dispatch isolated unconfigured adapter request');
    await page.getByRole('button', { name: 'Send prepared request', exact: true }).click();
    await expect(ledger.getByText('Prepared locally', { exact: true })).toBeVisible({
      timeout: 20000,
    });
    await expect
      .poll(
        async () =>
          (
            await db.pool.query(
              "SELECT status,last_error FROM outbox_events WHERE kind='person.promote' AND payload->>'promotionId'=$1 ORDER BY created_at DESC LIMIT 1",
              [promotion.id],
            )
          ).rows.map((row) =>
            row.status === 'failed' ? row.status + ':' + row.last_error : row.status,
          )[0],
      )
      .toBe('done');
    await db.pool.query("UPDATE promotions SET status='ambiguous' WHERE id=$1", [promotion.id]);
    await ledger.getByRole('button', { name: 'Refresh promotions', exact: true }).click();
    await expect(ledger.getByText('Outcome uncertain', { exact: false })).toBeVisible();
    await ledger.getByRole('button', { name: 'Review request', exact: true }).click();
    await page
      .getByLabel('Review reason', { exact: true })
      .fill('Reconcile original isolated request key');
    await page.getByRole('button', { name: 'Reconcile original key', exact: true }).click();
    await expect(ledger.getByText('Outcome uncertain', { exact: false })).toBeVisible({
      timeout: 20000,
    });
    await expect
      .poll(
        async () =>
          (
            await db.pool.query(
              "SELECT status,last_error FROM outbox_events WHERE kind='person.promote' AND payload->>'promotionId'=$1 ORDER BY created_at DESC LIMIT 1",
              [promotion.id],
            )
          ).rows.map((row) =>
            row.status === 'failed' ? row.status + ':' + row.last_error : row.status,
          )[0],
      )
      .toBe('done');
    // Explicit acknowledged-link fixture tests only the separate historical-export UI.
    await db.pool.query(
      "UPDATE users SET sync_policy='linked',external_person_id='browser-linked-fixture',linked_at=now() WHERE id=$1",
      [user],
    );
    await db.pool.query(
      "UPDATE promotions SET status='linked',external_person_id='browser-linked-fixture' WHERE id=$1",
      [promotion.id],
    );
    await page.reload();
    await page.getByLabel('Search name or email', { exact: true }).fill('promotion-browser');
    await page.getByRole('button', { name: 'Search people', exact: true }).click();
    await page.getByRole('button', { name: 'Manage assignments', exact: true }).click();
    await page.getByText('Authorize historical export', { exact: true }).click();
    await page
      .getByLabel('Promotion reason', { exact: true })
      .fill('Explicit approval for historical contract fixture');
    await page.getByRole('button', { name: 'Review promotion action', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel promotion review', exact: true }).click();
    expect(
      (await db.pool.query('SELECT export_training_history FROM users WHERE id=$1', [user])).rows[0]
        .export_training_history,
    ).toBe(false);
    await page.getByRole('button', { name: 'Review promotion action', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm historical export', exact: true }).click();
    await expect(
      page.getByText('Historical training export authorized.', { exact: true }),
    ).toBeVisible();
    await expect(ledger.getByText('History export authorized', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    await ledger.screenshot({ path: 'output/playwright/promotions-mobile.png' });
  } finally {
    await db.close();
  }
}

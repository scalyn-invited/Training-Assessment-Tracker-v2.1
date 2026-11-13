import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';
test('scoped record, atomic background receipt, recovery states and private quarantine', async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Separate browser demo passphrase';
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
    name: 'Workspace administrator',
    email: 'workspace-admin@example.invalid',
    password: 'Private workspace administrator password',
    demoPassword: password,
  });
  await post('/auth/login', {
    email: 'workspace-admin@example.invalid',
    password: 'Private workspace administrator password',
  });
  const client = (await (await request.get('/api/clients')).json()).find(
    (c: { name: string }) => c.name === 'Demo Client 1',
  ).id;
  await post('/clients/select', { clientId: client });
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    const members = (
      await db.pool.query(
        'SELECT cm.id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
        [client],
      )
    ).rows;
    const team = (await db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
      .rows[0].id;
    const record = await post('/enrolments', {
      clientId: client,
      memberId: members.find((r) => r.email === 'demo.1.3@example.invalid')!.id,
      coordinatorId: members.find((r) => r.email === 'demo.1.2@example.invalid')!.id,
      groupId: team,
      title: 'Scoped browser training record',
      reason: 'Verify the original workspace record workflow',
    });
    async function login(target: typeof page, email: string) {
      await target.goto(origin + '/login');
      await target.getByLabel('Email', { exact: true }).fill(email);
      await target.getByLabel('Password', { exact: true }).fill(password);
      await target.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(target).toHaveURL(/clients/);
      await target.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
      await expect(target).toHaveURL(/dashboard/);
    }
    await login(page, 'demo.1.3@example.invalid');
    let failDetail = true;
    await page.route(`**/api/enrolments/${record.id}?*`, async (route) => {
      if (failDetail) {
        failDetail = false;
        await route.fulfill({
          status: 503,
          json: { message: 'Training record could not be loaded. Try again.' },
        });
      } else await route.continue();
    });
    await page.goto(origin + '/enrolments/' + record.id);
    await expect(
      page.getByText('Training record could not be loaded. Try again.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry training record', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Scoped browser training record', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Plan foundation', exact: true })).toBeVisible();
    let lostResponse = true;
    await page.route(`**/api/enrolments/${record.id}/check`, async (route) => {
      if (lostResponse) {
        lostResponse = false;
        const actual = await route.fetch();
        expect(actual.ok()).toBeTruthy();
        await route.fulfill({
          status: 503,
          json: { message: 'Check response interrupted. Retry this request.' },
        });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Queue foundation check', exact: true }).click();
    await expect(
      page.getByText('Check response interrupted. Retry this request.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Queue foundation check', exact: true }).click();
    await expect(
      page.getByText('Check queued. Its receipt will appear below when the worker completes it.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Background check receipts').getByText('Delivered', { exact: true }),
    ).toBeVisible();
    expect((await db.pool.query('SELECT id FROM foundation_checks')).rowCount).toBe(1);
    let failReceipt = true;
    await page.route('**/api/jobs?*', async (route) => {
      if (failReceipt) {
        failReceipt = false;
        await route.fulfill({
          status: 503,
          json: { message: 'Receipts could not be loaded. Try again.' },
        });
      } else await route.continue();
    });
    await expect(
      page.getByText('Receipts could not be loaded. Try again.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry background receipts', exact: true }).click();
    await expect(
      page.getByLabel('Background check receipts').getByText('Delivered', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('File purpose', { exact: true }).selectOption('evidence');
    await page.getByLabel('Evidence file', { exact: true }).setInputFiles({
      name: 'original-fictional-evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Original fictional evidence for workspace browser qualification.'),
    });
    await page.getByRole('button', { name: 'Store privately', exact: true }).click();
    await expect(
      page.getByText(
        'Upload stored privately in quarantine. Downloads and extraction remain blocked until scanning succeeds.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Download original-fictional-evidence.txt', exact: true }),
    ).toHaveCount(0);
    const file = (
      await db.pool.query('SELECT id FROM evidence_files WHERE enrolment_id=$1', [record.id])
    ).rows[0].id;
    expect((await page.request.get('/api/files/' + file)).status()).toBe(409);
    // Explicit isolated scan fixture; this does not qualify a production scanner.
    await expect
      .poll(
        async () =>
          (await db.pool.query('SELECT scan_status FROM evidence_files WHERE id=$1', [file]))
            .rows[0].scan_status,
      )
      .toBe('quarantined');
    await db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [file]);
    await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page
      .getByRole('link', { name: 'Download original-fictional-evidence.txt', exact: true })
      .click();
    expect((await downloadPromise).suggestedFilename()).toBe('original-fictional-evidence.txt');
    await page.getByLabel('File purpose', { exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator('.skip').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
    await page.screenshot({
      path: 'output/playwright/workspace-record-desktop.png',
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    expect(await page.locator('.file-list small').evaluateAll((nodes) => nodes.every((node) => parseFloat(getComputedStyle(node).fontSize) >= 14))).toBe(true);
    await page.getByLabel('File purpose', { exact: true }).focus();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.locator('.skip').evaluate((node) => node.getBoundingClientRect().bottom <= 0)).toBe(true);
    await page.screenshot({
      path: 'output/playwright/workspace-record-mobile.png',
      fullPage: true,
    });
    const secondary = await browser.newContext();
    try {
      const reviewer = await secondary.newPage();
      await login(reviewer, 'demo.1.2@example.invalid');
      await reviewer.goto(origin + '/enrolments/' + record.id);
      await expect(
        reviewer.getByText(
          'Your team access permits this training summary. Detailed records and review actions require separate authority.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        reviewer.getByRole('heading', { name: 'Private evidence', exact: true }),
      ).toHaveCount(0);
      await expect(
        reviewer.getByRole('button', { name: 'Queue foundation check', exact: true }),
      ).toHaveCount(0);
      const body = await (
        await reviewer.request.get(`${origin}/api/enrolments/${record.id}?clientId=${client}`)
      ).json();
      expect(Object.keys(body).sort()).toEqual(['canDetails', 'id', 'status', 'title']);
    } finally {
      await secondary.close();
    }
  } finally {
    await db.close();
  }
});

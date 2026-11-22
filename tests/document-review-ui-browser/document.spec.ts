import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { Database } from '../../packages/database/src/database.js';

test('shared document review preserves quarantine, findings, confirmation, recovery and access', async ({
  page,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated curriculum administrator',
    demo = 'Isolated curriculum demonstration';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  async function post(path: string, data: Record<string, unknown>) {
    const ctx = await (await page.request.get('/api/auth/context')).json();
    const r = await page.request.post('/api' + path, {
      headers: { Origin: origin },
      data: { ...data, csrf: ctx.csrf },
    });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
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
  async function screenshot(name: string) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      scrollTo(0, 0);
    });
    await page.screenshot({
      path: `output/playwright/document-review-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/documents/00000000-0000-4000-8000-000000000002',
  );
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/documents/00000000-0000-4000-8000-000000000002',
  );
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json(),
    client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id,
    other = clients.find((c: { name: string }) => c.name === 'Demo Client 2').id;
  await post('/clients/select', { clientId: client });
  const choices = await (
    await page.request.get('/api/enrolments/choices?clientId=' + client)
  ).json();
  const created = await post('/enrolments', {
    clientId: client,
    memberId: choices.members.find((m: { name: string }) => m.name === 'Demo Member 1.3').id,
    coordinatorId: choices.coordinators.find(
      (m: { name: string }) => m.name === 'Demo Coordinator 1.2',
    ).id,
    groupId: null,
    title: 'Document review verification',
    reason: 'Isolated curriculum UI fixture',
  });
  const id = created.id,
    url = `/enrolments/${id}/plan`;
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Retry curriculum', exact: true })).toBeVisible();
  const brand = await (await page.request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: brand.version,
    displayName: 'Curriculum fixture',
    appName: brand.appName,
    accent: '#7255a4',
    mode: 'white-label',
    theme: 'client-dark',
    reason: 'Curriculum theme verification',
  });
  async function login(email: string) {
    await post('/auth/login', { email, password: demo });
    await post('/clients/select', { clientId: client });
  }
  await login('demo.1.0@example.invalid');
  const admin = await (
    await page.request.get('/api/clients/administration?clientId=' + client)
  ).json();
  const allocation = admin.allocations.find(
    (a: { coordinator_name: string; member_name: string }) =>
      a.coordinator_name === 'Demo Coordinator 1.2' && a.member_name === 'Demo Member 1.3',
  );
  await post('/clients/sensitive', {
    clientId: client,
    allocationId: allocation.id,
    grant: true,
    reason: 'Isolated curriculum sensitive access',
  });
  await login('demo.1.2@example.invalid');
  const csrf = (await (await page.request.get('/api/auth/context')).json()).csrf;
  const upload = await page.request.post(`/api/enrolments/${id}/files`, {
    headers: { Origin: origin },
    multipart: {
      csrf,
      clientId: client,
      purpose: 'assessment',
      evidence: {
        name: 'review-findings.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'Synthetic observation\nSafe method demonstrated.\n<script>alert("not executable")</script>',
        ),
      },
    },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  const fileId = (await upload.json()).id;
  const reviewUrl = `/enrolments/${id}/documents/${fileId}`;
  const documentPath = `/enrolments/${id}/documents/${fileId}`;
  const detailApi = `**/api${documentPath}?*`;
  const requestApi = `**/api${documentPath}`;
  const read = async () =>
    (await page.request.get(`/api${documentPath}?clientId=${client}`)).json();
  let release!: () => void;
  const hold = new Promise<void>((r) => {
    release = r;
  });
  await page.route(detailApi, async (r) => {
    await hold;
    await r.continue();
  });
  await page.goto(reviewUrl);
  await expect(page.getByText('Loading document review…', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Request extraction', exact: true })).toBeVisible();
  await page.unroute(detailApi);
  await expect(
    page.getByRole('link', { name: 'Download original for comparison', exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get('/api/files/' + fileId)).ok()).toBe(false);
  await page.route(requestApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic extraction outage.' } }),
  );
  await page.getByRole('button', { name: 'Request extraction', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic extraction outage.');
  await page.unroute(requestApi);
  await page.getByRole('button', { name: 'Request extraction', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Extraction status: waiting scan', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/A missing scanner keeps this file quarantined/)).toBeVisible();
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveCount(0);
  const quarantined = await read();
  expect(quarantined.run.status).toBe('waiting_scan');
  // Explicit scanner-outcome fixture in the isolated test DB only. No real malware scan is claimed.
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    const changed = await db.pool.query(
      "UPDATE evidence_files SET scan_status='clean',scan_token=NULL WHERE id=$1 AND organisation_id=$2 AND environment='test' RETURNING id",
      [fileId, client],
    );
    expect(changed.rowCount).toBe(1);
  } finally {
    await db.close();
  }
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(page.locator('pre')).toContainText('<script>alert("not executable")</script>');
  const ready = await read();
  expect(ready.run.status).toBe('ready');
  const runId = ready.run.id;
  const saveApi = `**/api/enrolments/${id}/document-reviews/${runId}`;
  const savePath = `/enrolments/${id}/document-reviews/${runId}`;
  const download = page.getByRole('link', {
    name: 'Download original for comparison',
    exact: true,
  });
  await expect(download).toHaveAttribute('href', '/api/files/' + fileId);
  await expect(download).toHaveAttribute('target', '_blank');
  expect((await page.request.get('/api/files/' + fileId)).ok()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm reviewed findings', exact: true });
  const save = page.getByRole('button', { name: 'Save review draft', exact: true });
  page.once('dialog', (d) => d.accept());
  await confirm.click();
  await expect(page.locator('p[role=alert]')).toContainText('Your review input is retained.');
  async function fill(findings: string) {
    await page.getByLabel('Provider or observer', { exact: true }).fill('Synthetic observer');
    await page.getByLabel('Assessment date', { exact: true }).fill('2026-01-01');
    await page.getByLabel('Scoring scale (or not scored)', { exact: true }).fill('Not scored');
    await page.getByLabel('Findings to confirm', { exact: true }).fill(findings);
    await page.getByLabel('Evidence type', { exact: true }).selectOption('observed evidence');
  }
  await fill('Reviewed observed safe practice');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveValue(
      'Reviewed observed safe practice',
    );
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to assessment findings', exact: true }).click();
  await expect(page).toHaveURL(reviewUrl);
  page.once('dialog', (d) => d.dismiss());
  await confirm.click();
  let finish!: () => void;
  const waiting = new Promise<void>((r) => {
    finish = r;
  });
  await page.route(saveApi, async (r) => {
    await waiting;
    await r.continue();
  });
  await save.click();
  await expect(page.getByRole('button', { name: 'Saving review…', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finish();
  await expect(
    page.getByText('Review draft saved. Findings have not been confirmed or sent to AI.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(saveApi);
  const saved = await read();
  expect(saved.onboardingVersion).toBe(0);
  expect(saved.run.review.findings).toBe('Reviewed observed safe practice');
  await a11y();
  await screenshot('review-desktop');
  await page.getByLabel('Findings to confirm', { exact: true }).fill('Retain my local findings');
  await post(savePath, {
    clientId: client,
    data: { ...saved.run.review, findings: 'Saved in another tab' },
    version: saved.run.version,
    onboardingVersion: 0,
    confirm: false,
  });
  await save.click();
  await expect(page.locator('p[role=alert]')).toContainText('Your review input is retained.');
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveValue(
    'Retain my local findings',
  );
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Reload review', exact: true }).click();
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveValue(
    'Retain my local findings',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reload review', exact: true }).click();
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveValue(
    'Saved in another tab',
  );
  await fill('Final reviewed safe practice');
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('review-mobile');
  page.once('dialog', (d) => d.accept());
  await confirm.click();
  await expect(
    page.getByRole('heading', { name: 'Extraction status: confirmed', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveCount(0);
  const confirmed = await read();
  expect(confirmed.onboardingVersion).toBe(1);
  expect(confirmed.run.confirmedOnboardingId).toBeTruthy();
  const onboarding = await (
    await page.request.get(`/api/enrolments/${id}/onboarding?clientId=${client}`)
  ).json();
  expect(onboarding.data.assessment).toMatchObject({
    findings: 'Final reviewed safe practice',
    extraction_id: runId,
  });
  expect(onboarding.data.assessment.source_sha256).toMatch(/^[a-f0-9]{64}$/);
  await screenshot('confirmed-mobile');
  await page.route(detailApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic review outage.' } }),
  );
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic review outage.');
  await page.unroute(detailApi);
  await page.getByRole('button', { name: 'Reload review', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Extraction status: confirmed', exact: true }),
  ).toBeVisible();
  let fixture = structuredClone(ready),
    reads = 0;
  await page.route(detailApi, (r) => {
    reads++;
    return r.fulfill({ json: fixture });
  });
  for (const status of ['queued', 'running', 'waiting_scan', 'failed', 'ready']) {
    fixture = structuredClone(ready);
    fixture.run.status = status;
    fixture.run.text = status === 'ready' ? ready.run.text : null;
    fixture.run.error = status === 'failed' ? 'Synthetic parser failure.' : null;
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: `Extraction status: ${status.replaceAll('_', ' ')}`,
        exact: true,
      }),
    ).toBeVisible();
    if (['queued', 'running', 'waiting_scan'].includes(status)) {
      const before = reads;
      await expect.poll(() => reads, { timeout: 6000 }).toBeGreaterThan(before);
    }
    if (status === 'failed') {
      await expect(
        page.getByRole('button', { name: 'Retry extraction', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Use manual assessment entry', exact: true }),
      ).toHaveAttribute('href', `/enrolments/${id}/onboarding?step=assessment`);
    }
    await a11y();
  }
  for (const status of ['quarantined', 'scanning', 'rejected', 'deleted']) {
    fixture = structuredClone(ready);
    fixture.file.status = status;
    fixture.run.text = null;
    fixture.run.error = 'Source is no longer clean.';
    await page.reload();
    await expect(page.getByText('Source is no longer clean.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Findings to confirm', { exact: true })).toHaveCount(0);
    await expect(download).toHaveCount(0);
  }
  fixture = structuredClone(ready);
  fixture.editable = false;
  fixture.run.warnings = ['Check extracted line breaks against the original.'];
  fixture.run.text = 'Long extracted identifier: ' + 'x'.repeat(400);
  fixture.file.name = 'Long filename ' + 'f'.repeat(180);
  await page.reload();
  await expect(page.getByText(/Its onboarding findings cannot be replaced/)).toBeVisible();
  await expect(save).toHaveCount(0);
  await a11y();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await a11y();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await a11y();
  await page.unroute(detailApi);
  expect((await page.request.get(`/api${documentPath}?clientId=${other}`)).status()).toBe(403);
  for (const email of ['demo.1.3@example.invalid', 'demo.1.0@example.invalid']) {
    await login(email);
    await page.goto(reviewUrl);
    await expect(page.locator('p[role=alert]')).toBeVisible();
    await expect(save).toHaveCount(0);
    expect((await page.request.get(`/api${documentPath}?clientId=${client}`)).status()).toBe(404);
  }
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await post('/clients/select', { clientId: client });
  await page.goto(reviewUrl);
  await expect(page.locator('p[role=alert]')).toBeVisible();
  expect((await page.request.get(`/api${documentPath}?clientId=${client}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});

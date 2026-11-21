import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('training record preserves permissions, quarantine, recovery, receipts and responsive themes', async ({
  page,
}) => {
  test.setTimeout(180000);
  const origin = 'http://127.0.0.1:3110';
  const password = 'Isolated record administrator';
  const demo = 'Isolated record demonstration';
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
  async function screenshot(name: string) {
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      scrollTo(0, 0);
    });
    await page.screenshot({
      path: `output/playwright/training-record/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Record reviewer',
    email: 'record-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'record-ui@example.invalid', password });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  const other = clients.find((c: { name: string }) => c.name === 'Demo Client 2').id;
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
    title: 'Record detail verification',
    reason: 'Isolated training record fixture',
  });
  const id = created.id,
    url = '/enrolments/' + id;
  const recordApi = `**/api/enrolments/${id}?*`,
    filesApi = `**/api/enrolments/${id}/files?*`;
  await page.goto(url);
  await expect(
    page.getByRole('button', { name: 'Retry training record', exact: true }),
  ).toBeVisible();
  // The API conceals records outside the actor's scope with 404.
  expect((await page.request.get(`/api/enrolments/${id}?clientId=${client}`)).status()).toBe(404);
  const brand = await (await page.request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: brand.version,
    displayName: 'Record fixture client',
    appName: brand.appName,
    accent: '#7255a4',
    mode: 'white-label',
    theme: 'client-dark',
    reason: 'Record theme verification',
  });
  async function login(email: string) {
    await post('/auth/login', { email, password: demo });
    await post('/clients/select', { clientId: client });
    await page.goto(url);
  }
  let releaseRecord!: () => void;
  const heldRecord = new Promise<void>((resolve) => {
    releaseRecord = resolve;
  });
  let releaseFiles!: () => void;
  const heldFiles = new Promise<void>((resolve) => {
    releaseFiles = resolve;
  });
  await page.route(recordApi, async (route) => {
    await heldRecord;
    await route.continue();
  });
  await page.route(filesApi, async (route) => {
    await heldFiles;
    await route.continue();
  });
  await login('demo.1.3@example.invalid');
  await expect(page.getByText('Loading training record...', { exact: true })).toBeVisible();
  releaseRecord();
  await expect(page.getByText('Loading private evidence...', { exact: true })).toBeVisible();
  releaseFiles();
  const evidence = page.getByRole('region', { name: 'Private evidence', exact: true });
  const foundation = page.getByRole('region', { name: 'Plan foundation', exact: true });
  const receipts = page.getByRole('region', { name: 'Background check receipts', exact: true });
  await expect(evidence.getByText('No evidence visible in your scope.')).toBeVisible();
  await page.unroute(recordApi);
  await page.unroute(filesApi);
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Record detail verification', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Today and learning plan', exact: true }),
  ).toHaveAttribute('href', url + '/delivery');
  await expect(
    page.getByRole('link', { name: 'Onboarding and plan setup', exact: true }),
  ).toHaveAttribute('href', url + '/onboarding');
  await expect(
    page.getByRole('link', { name: 'View curriculum and versions', exact: true }),
  ).toHaveCount(0);
  const actual = await (await page.request.get(`/api/enrolments/${id}?clientId=${client}`)).json();
  expect(actual.canUpload).toBe(true);
  expect(actual.canManage).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await a11y();
  await screenshot('desktop');
  // Real queue action and worker receipt; no external delivery is enabled.
  const queue = foundation.getByRole('button', { name: 'Queue foundation check', exact: true });
  await queue.focus();
  await page.keyboard.press('Enter');
  await expect(foundation.getByText('Check queued.', { exact: false })).toBeVisible();
  await expect(receipts.getByText('Delivered', { exact: true })).toBeVisible({ timeout: 20000 });
  // A stale request retains actionable recovery; a new load restores the real record.
  await page.route(`**/api/enrolments/${id}/check`, (route) =>
    route.fulfill({
      status: 409,
      json: { message: 'Synthetic stale record. Reload before retrying.' },
    }),
  );
  await queue.click();
  await expect(foundation.getByRole('alert')).toContainText('Synthetic stale record');
  await page.unroute(`**/api/enrolments/${id}/check`);
  await foundation.getByRole('button', { name: 'Reload training record', exact: true }).click();
  await expect(foundation).toBeVisible();
  await queue.click();
  await expect(foundation.getByText('Check queued.', { exact: false })).toBeVisible();
  await expect(foundation.getByRole('alert')).toHaveCount(0);
  // Required-file validation prevents an empty upload.
  await evidence.getByRole('button', { name: 'Store privately', exact: true }).click();
  expect(
    await evidence
      .getByLabel('Evidence file', { exact: true })
      .evaluate((e: HTMLInputElement) => e.validity.valueMissing),
  ).toBe(true);
  await evidence.getByLabel('File purpose', { exact: true }).selectOption('evidence');
  await evidence.getByLabel('Evidence file', { exact: true }).setInputFiles({
    name: 'private-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic training evidence only.'),
  });
  await page.route(`**/api/enrolments/${id}/files`, async (route) => {
    if (route.request().method() === 'POST')
      await route.fulfill({ status: 503, json: { message: 'Synthetic upload outage.' } });
    else await route.continue();
  });
  await evidence.getByRole('button', { name: 'Store privately', exact: true }).click();
  await expect(evidence.getByRole('alert')).toContainText(
    'Refresh the evidence list before uploading again',
  );
  await expect(evidence.getByLabel('File purpose', { exact: true })).toHaveValue('evidence');
  expect(
    await evidence
      .getByLabel('Evidence file', { exact: true })
      .evaluate((e: HTMLInputElement) => e.files?.[0].name),
  ).toBe('private-notes.txt');
  await page.unroute(`**/api/enrolments/${id}/files`);
  await evidence.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  await expect(
    evidence.getByRole('button', { name: 'Refresh evidence', exact: true }),
  ).toBeEnabled();
  await evidence.getByRole('button', { name: 'Store privately', exact: true }).click();
  await expect(evidence.getByRole('status')).toContainText('Upload stored privately in quarantine');
  await expect(evidence.getByText('private-notes.txt', { exact: true })).toBeVisible();
  await expect(
    evidence.getByRole('link', { name: 'Download private-notes.txt', exact: true }),
  ).toHaveCount(0);
  const uploaded = await (
    await page.request.get(`/api/enrolments/${id}/files?clientId=${client}`)
  ).json();
  expect((await page.request.get('/api/files/' + uploaded.files[0].id)).ok()).toBe(false);
  expect(
    await evidence
      .getByLabel('Evidence file', { exact: true })
      .evaluate((e: HTMLInputElement) => e.files?.length),
  ).toBe(0);
  // Independent evidence error does not hide foundation or receipts.
  await page.route(filesApi, (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic evidence outage.' } }),
  );
  await evidence.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  await expect(evidence.getByRole('alert')).toContainText('Synthetic evidence outage');
  await expect(foundation).toBeVisible();
  await expect(receipts).toBeVisible();
  await page.unroute(filesApi);
  await evidence.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  await expect(evidence.getByText('private-notes.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await a11y();
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  for (const width of [800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('mobile');
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await a11y();
  // Display-only fixtures cover long labels, clean/rejected scan states and read-only detail.
  await page.route(recordApi, (route) =>
    route.fulfill({
      json: {
        ...actual,
        title: 'LongTrainingTitle'.repeat(12),
        memberName: 'Long member name '.repeat(10),
        canUpload: false,
        canManage: false,
        hasCurriculum: true,
      },
    }),
  );
  await page.route(filesApi, (route) =>
    route.fulfill({
      json: {
        files: [
          {
            id: 'clean-fixture',
            name: 'LongEvidenceName'.repeat(12) + '.txt',
            bytes: 1024,
            status: 'clean',
            purpose: 'assessment',
          },
          {
            id: 'rejected-fixture',
            name: 'rejected.txt',
            bytes: 2048,
            status: 'rejected',
            purpose: 'evidence',
          },
        ],
      },
    }),
  );
  await page.reload();
  await expect(evidence.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(evidence.getByRole('link', { name: /^Download/ })).toHaveAttribute(
    'href',
    '/api/files/clean-fixture',
  );
  await expect(evidence.getByRole('link', { name: /^Extract/ })).toHaveCount(0);
  await expect(evidence.getByRole('button', { name: 'Store privately', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('link', { name: 'View curriculum and versions', exact: true }),
  ).toHaveAttribute('href', url + '/plan');
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.unroute(recordApi);
  await page.unroute(filesApi);
  await page.route(recordApi, (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic record outage.' } }),
  );
  await page.reload();
  await expect(page.getByText('Synthetic record outage.', { exact: true })).toBeVisible();
  await page.unroute(recordApi);
  await page.getByRole('button', { name: 'Retry training record', exact: true }).click();
  await expect(foundation).toBeVisible();
  expect((await page.request.get(`/api/enrolments/${id}?clientId=${other}`)).status()).toBe(403);
  // Real coordinator gets a summary until sensitive authority is separately granted.
  await login('demo.1.2@example.invalid');
  await expect(
    page.getByText('Your team access permits this training summary.', { exact: false }),
  ).toBeVisible();
  await expect(evidence).toHaveCount(0);
  await expect(foundation).toHaveCount(0);
  await a11y();
  await screenshot('summary-mobile');
  await login('demo.1.0@example.invalid');
  // Client administration alone does not grant access to this unallocated record.
  await expect(
    page.getByRole('button', { name: 'Retry training record', exact: true }),
  ).toBeVisible();
  expect((await page.request.get(`/api/enrolments/${id}?clientId=${client}`)).status()).toBe(404);
  const admin = await (
    await page.request.get('/api/clients/administration?clientId=' + client)
  ).json();
  const allocation = admin.allocations.find(
    (a: { coordinator_name: string; member_name: string }) =>
      a.coordinator_name === 'Demo Coordinator 1.2' && a.member_name === 'Demo Member 1.3',
  );
  expect(allocation).toBeTruthy();
  await post('/clients/sensitive', {
    clientId: client,
    allocationId: allocation.id,
    grant: true,
    reason: 'Isolated coordinator detail authority',
  });
  await login('demo.1.2@example.invalid');
  await expect(foundation).toBeVisible();
  const managed = await (await page.request.get(`/api/enrolments/${id}?clientId=${client}`)).json();
  expect(managed.canManage).toBe(true);
  await expect(
    evidence.getByRole('button', { name: 'Store privately', exact: true }),
  ).toBeVisible();
  await evidence.getByLabel('Evidence file', { exact: true }).setInputFiles({
    name: 'assessment.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic assessment for UI verification.'),
  });
  await evidence.getByRole('button', { name: 'Store privately', exact: true }).click();
  await expect(evidence.getByRole('status')).toContainText('Upload stored privately in quarantine');
  const link = evidence.getByRole('link', {
    name: 'Extract and review assessment.txt',
    exact: true,
  });
  await expect(link).toHaveAttribute('href', new RegExp(`^${url}/documents/`));
  await a11y();
  expect(errors).toEqual([]);
});

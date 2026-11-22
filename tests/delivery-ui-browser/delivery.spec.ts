import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared learning delivery preserves activation, locked history, lifecycle and access', async ({
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
    await page.screenshot({ path: `output/playwright/delivery-ui/${name}.png`, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/delivery');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/delivery');
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
    title: 'Learning delivery verification',
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
  const inputs = {
    profile: {
      current_role: 'Operator',
      responsibilities: 'Safe practice',
      experience: 'One year',
      tools: 'Laptop',
      preferences: 'English',
    },
    capability: {
      target_role: 'Supervisor',
      purpose: 'Safe practice',
      proficiency: 'Independent',
      success: 'Complete tasks',
      prerequisites: 'Induction',
      competencies: 'Safety',
    },
    assessment: {
      source: 'Observed evidence',
      provider: 'Synthetic coordinator',
      date: '2026-01-01',
      scale: 'Not scored',
      findings: 'Safe practice',
      kind: 'observed evidence',
    },
    schedule: {
      duration: 4,
      daily_minutes: 30,
      capacity_minutes: 60,
      start_date: '2090-01-02',
      timezone: 'Asia/Manila',
      weekdays: [1],
      holidays: [],
      absences: [],
    },
    measures: {
      kpis: Array.from({ length: 3 }, (_, i) => ({
        name: 'Measure ' + i,
        baseline: 'unknown',
        target: '90',
        unit: 'percent',
        rationale: 'Safety',
        evidence: 'Observation',
        cadence: 'Weekly',
      })),
    },
    resources: {
      title: 'Reviewed handbook',
      reference: 'Internal handbook',
      licence: 'Internal use',
      cost: 'No cost',
      access: 'Access checked',
      tasks: 'Safe practice',
    },
  };
  let onboardingVersion = 0;
  for (const [step, data] of Object.entries(inputs))
    onboardingVersion = (
      await post(`/enrolments/${id}/onboarding`, {
        clientId: client,
        step,
        data,
        version: onboardingVersion,
        confirm: step === 'assessment',
      })
    ).version;
  await post(`/enrolments/${id}/calendar`, {
    clientId: client,
    version: 0,
    onboardingVersion,
    reason: 'Confirm isolated shared capacity',
  });
  await post(`/enrolments/${id}/plan/create`, {
    clientId: client,
    version: 0,
    onboardingVersion,
    reason: 'Create isolated curriculum draft',
  });
  const deliveryUrl = `/enrolments/${id}/delivery`;
  const deliveryPath = `/api/enrolments/${id}/delivery?clientId=${client}`;
  const deliveryApi = `**/api/enrolments/${id}/delivery?*`;
  const lifecycleApi = `**/api/enrolments/${id}/lifecycle?*`;
  const lifecyclePost = `**/api/enrolments/${id}/lifecycle`;
  const read = async () => (await page.request.get(deliveryPath)).json();
  await page.goto(deliveryUrl);
  await expect(page.getByText(/Lessons become available after your coordinator/)).toBeVisible();
  await expect(
    page.getByText('No submissions yet. Submitted lesson work appears here.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Activate programme', exact: true })).toHaveCount(
    0,
  );
  const queued = await post(`/enrolments/${id}/plan/generation`, {
    clientId: client,
    version: 1,
    feedback: 'Reviewed safe practice',
    key: crypto.randomUUID(),
  });
  const generation = async () =>
    (
      await (
        await page.request.get(
          `/api/enrolments/${id}/plan/generation/${queued.id}?clientId=${client}`,
        )
      ).json()
    ).runs[0];
  await expect.poll(async () => (await generation()).status, { timeout: 60000 }).toBe('complete');
  const planVersion = (await generation()).resultVersion;
  await post(`/enrolments/${id}/plan/review`, {
    clientId: client,
    version: planVersion,
    approve: false,
    reason: '',
  });
  await post(`/enrolments/${id}/plan/review`, {
    clientId: client,
    version: planVersion,
    approve: true,
    reason: 'All generated blocks reviewed for isolated delivery',
  });
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  await page.route(deliveryApi, async (r) => {
    await waiting;
    await r.continue();
  });
  await page.reload();
  await expect(page.getByText('Loading learning plan...', { exact: true })).toBeVisible();
  release();
  await expect(page.getByLabel('Activate programme reason', { exact: true })).toBeVisible();
  await page.unroute(deliveryApi);
  await page.route(deliveryApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic learning plan outage.' } }),
  );
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic learning plan outage.');
  await page.unroute(deliveryApi);
  await page.getByRole('button', { name: 'Try loading again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Activate programme reason', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page
    .getByLabel('Activate programme reason', { exact: true })
    .fill('Activate approved learning after review');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Activate programme reason', { exact: true })).toHaveValue(
      'Activate approved learning after review',
    );
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Activate programme', exact: true }).click();
  const activateApi = `**/api/enrolments/${id}/delivery/activate`;
  await page.route(activateApi, (r) =>
    r.fulfill({ status: 409, json: { message: 'Synthetic activation conflict.' } }),
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Activate programme', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic activation conflict.');
  await page.unroute(activateApi);
  let finish!: () => void;
  const held = new Promise<void>((r) => {
    finish = r;
  });
  await page.route(activateApi, async (r) => {
    await held;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Activate programme', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Saving decision...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finish();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  await page.unroute(activateApi);
  const active = await read();
  expect(active.blocks).toHaveLength(4);
  await expect(
    page.getByRole('link', { name: 'Curriculum and approval history', exact: true }),
  ).toHaveAttribute('href', `/enrolments/${id}/plan`);
  await expect(
    page.getByRole('link', { name: 'Progress and evidence', exact: true }),
  ).toHaveAttribute('href', `/enrolments/${id}/progress`);
  await a11y();
  await screenshot('active-desktop');
  await page.getByText('Authorise early start', { exact: true }).first().click();
  await page
    .getByLabel('Authorise and lock block reason', { exact: true })
    .first()
    .fill('Authorise the first block for early practice');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Authorise and lock block', exact: true }).first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Authorise and lock block', exact: true }).first().click();
  await expect(
    page.getByText('Version 1 / Started; version locked', { exact: true }),
  ).toBeVisible();
  const pinned = (await read()).blocks[0];
  await page.route(lifecycleApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic lifecycle outage.' } }),
  );
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic lifecycle outage.');
  await page.unroute(lifecycleApi);
  await page.getByRole('button', { name: 'Try loading again', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Pause programme$/ })
    .click();
  await page
    .getByLabel('Pause programme reason', { exact: true })
    .fill('Pause training for approved leave');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Pause programme', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Pause programme', exact: true }).click();
  await expect(page.getByText('paused', { exact: true })).toBeVisible();
  await page.getByLabel('Move unstarted blocks by weeks', { exact: true }).fill('2');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(page.getByLabel('Move unstarted blocks by weeks', { exact: true })).toHaveValue('2');
  await page
    .getByLabel('Resumption reason', { exact: true })
    .fill('Resume after the approved two week leave');
  await page.route(lifecyclePost, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic preview outage.' } }),
  );
  await page.getByRole('button', { name: 'Preview resumption', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic preview outage.');
  await page.unroute(lifecyclePost);
  await expect(page.getByLabel('Resumption reason', { exact: true })).toHaveValue(
    'Resume after the approved two week leave',
  );
  await page.getByRole('button', { name: 'Preview resumption', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Move unstarted blocks by 2 weeks', exact: true }),
  ).toBeVisible();
  const paused = await read();
  expect(paused.blocks[1].content.start).toBe(active.blocks[1].content.start);
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('resume-mobile');
  const previewView = await (
    await page.request.get(`/api/enrolments/${id}/lifecycle?clientId=${client}`)
  ).json();
  const stalePreview = structuredClone(previewView);
  stalePreview.previews[0].version--;
  await page.route(lifecycleApi, (r) => r.fulfill({ json: stalePreview }));
  await page.reload();
  await expect(
    page.getByText('This preview is out of date. Create a new preview.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm preview and resume', exact: true }),
  ).toBeDisabled();
  await page.unroute(lifecycleApi);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Confirm preview and resume', exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Resumption reason', { exact: true })
    .fill('A new preview is being prepared');
  await expect(
    page.getByRole('button', { name: 'Confirm preview and resume', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Resumption reason', { exact: true }).fill('');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Confirm preview and resume', exact: true }).click();
  await expect(page.getByText('paused', { exact: true })).toBeVisible();
  let end!: () => void;
  const resumeWait = new Promise<void>((r) => {
    end = r;
  });
  await page.route(lifecyclePost, async (r) => {
    await resumeWait;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm preview and resume', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Resuming programme...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  end();
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  await page.unroute(lifecyclePost);
  const resumed = await read();
  expect(resumed.blocks[0].id).toBe(pinned.id);
  expect(resumed.blocks[0].content).toEqual(pinned.content);
  expect(resumed.blocks[1].version).toBe(2);
  expect(resumed.blocks[1].content.start).not.toBe(active.blocks[1].content.start);
  await page.getByText('Confirm programme completion', { exact: true }).click();
  await page
    .getByLabel('Complete programme reason', { exact: true })
    .fill('Check completion still requires approved evidence');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Complete programme', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText(
    'Every required lesson needs approved evidence.',
  );
  await page.getByLabel('Complete programme reason', { exact: true }).fill('');
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
  const finished = structuredClone(resumed);
  finished.enrolment.status = 'completed';
  finished.enrolment.title = 'Long record title ' + 'x'.repeat(250);
  finished.blocks[0].content.lessons[0].title = 'Long lesson title ' + 'y'.repeat(250);
  finished.today = finished.blocks[0].content.lessons[0].date;
  finished.submissions = [
    {
      id: 'fixture-submission',
      attempt: 1,
      status: 'pending_review',
      created_at: '2026-01-01T00:00:00Z',
    },
  ];
  await page.route(deliveryApi, (r) => r.fulfill({ json: finished }));
  await page.route(lifecycleApi, (r) =>
    r.fulfill({ json: { ...previewView, status: 'completed' } }),
  );
  await page.reload();
  await expect(
    page.getByText('Programme completed. Submitted evidence and decisions remain in history.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Attempt 1 \/ pending review/ })).toHaveAttribute(
    'href',
    `/enrolments/${id}/submissions/fixture-submission`,
  );
  await expect(page.getByText(/minutes \/ Today/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  finished.enrolment.status = 'withdrawn';
  await page.reload();
  await expect(page.getByText('withdrawn', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Programme status', exact: true })).toHaveCount(0);
  await page.unroute(deliveryApi);
  await page.unroute(lifecycleApi);
  await login('demo.1.3@example.invalid');
  await page.goto(deliveryUrl);
  await expect(page.getByText('active', { exact: true })).toBeVisible();
  await expect(page.getByText('Pause programme', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Authorise early start', { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('member-mobile');
  const firstLink = page.locator(`a[href^="/enrolments/${id}/delivery/"]`).first();
  await expect(firstLink).toHaveAttribute('href', `/enrolments/${id}/delivery/${pinned.id}/0`);
  await firstLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/delivery/${pinned.id}/0$`));
  const memberCtx = await (await page.request.get('/api/auth/context')).json();
  const denied = await page.request.post(`/api/enrolments/${id}/lifecycle`, {
    headers: { Origin: origin },
    data: {
      clientId: client,
      csrf: memberCtx.csrf,
      version: resumed.enrolment.version,
      action: 'pause',
      reason: 'Members cannot pause the programme',
    },
  });
  expect(denied.status()).toBe(403);
  expect((await page.request.get(deliveryPath.replace(client, other))).status()).toBe(403);
  await login('demo.1.0@example.invalid');
  await page.goto(deliveryUrl);
  await expect(page.locator('p[role=alert]')).toBeVisible();
  expect((await page.request.get(deliveryPath)).status()).toBe(404);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await post('/clients/select', { clientId: client });
  await page.goto(deliveryUrl);
  await expect(page.locator('p[role=alert]')).toBeVisible();
  expect((await page.request.get(deliveryPath)).status()).toBe(404);
  expect(errors).toEqual([]);
});

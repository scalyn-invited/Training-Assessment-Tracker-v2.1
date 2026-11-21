import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared review queue preserves scoped work and independent appeal routing', async ({
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
      path: `output/playwright/review-queue-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/learning-reviews');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/learning-reviews');
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
    groupId: choices.teams[0].id,
    title: 'Submission receipt verification',
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
  // Reuse real role sessions; repeated switches should not exercise the login rate limiter.
  const sessions = new Map([['curriculum-ui@example.invalid', await page.context().cookies()]]);
  async function login(email: string) {
    await page.context().clearCookies();
    const cookies = sessions.get(email);
    if (cookies) await page.context().addCookies(cookies);
    else
      await post('/auth/login', {
        email,
        password: email === 'curriculum-ui@example.invalid' ? password : demo,
      });
    await post('/clients/select', { clientId: client });
    sessions.set(email, await page.context().cookies());
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
  const approved = await (
    await page.request.get(`/api/enrolments/${id}/delivery?clientId=${client}`)
  ).json();
  await post(`/enrolments/${id}/delivery/activate`, {
    clientId: client,
    version: approved.enrolment.version,
    reason: 'Activate reviewed lesson fixture',
  });
  const active = await (
    await page.request.get(`/api/enrolments/${id}/delivery?clientId=${client}`)
  ).json();
  const block = active.blocks[0].id,
    lessonBase = `/enrolments/${id}/delivery/${block}/lessons/0`;
  await post(lessonBase + '/quiz', {
    clientId: client,
    reason: 'Reviewed objective questions before work starts',
    questions: [1, 2].map((n) => ({
      prompt: 'Which practice supports criterion ' + n + '?',
      options: ['Observed safe practice', 'Unsupported assumption'],
      correct: 0,
    })),
  });
  await post(`/enrolments/${id}/delivery/${block}/early-start`, {
    clientId: client,
    reason: 'Allow isolated learning receipt verification',
  });
  await login('demo.1.3@example.invalid');
  await post(lessonBase + '/draft', {
    clientId: client,
    version: 0,
    data: { body: '', files: [], answers: [0, null] },
  });
  const first = await post(lessonBase + '/submit', {
    clientId: client,
    version: 1,
    key: crypto.randomUUID(),
  });
  let receiptId = first.id;
  const receiptUrl = () => `/enrolments/${id}/submissions/${receiptId}`,
    read = async () =>
      (await page.request.get('/api' + receiptUrl() + '?clientId=' + client)).json();
  const firstApi = `**/api${receiptUrl()}?*`;
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  await page.route(firstApi, async (r) => {
    await waiting;
    await r.continue();
  });
  await page.goto(receiptUrl());
  await expect(page.getByText('Loading submission receipt...', { exact: true })).toBeVisible();
  release();
  await expect(page.getByText('Status: submitted', { exact: true })).toBeVisible();
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await page.unroute(firstApi);
  await page.route(firstApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic receipt outage.' } }),
  );
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic receipt outage.');
  await page.unroute(firstApi);
  await page.getByRole('button', { name: 'Try loading again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Status: submitted', { exact: true })).toBeVisible();
  await expect(
    page.getByText('No written response; see attached evidence or quiz answers.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/criterion 2\?: Not answered/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grading attempts', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Awaiting review. Provisional scores are not official results.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByText('Receipt integrity and rubric', { exact: true }).click();
  const original = await read();
  await expect(
    page.getByText('Content hash: ' + original.submission.contentHash, { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByText('Withdraw this attempt', { exact: true }).click();
  const withdrawReason = page.getByLabel('Withdraw attempt reason', { exact: true });
  await withdrawReason.fill('Replace the incomplete quiz with reviewed answers');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(withdrawReason).toHaveValue('Replace the incomplete quiz with reviewed answers');
  }
  const withdraw = page.getByRole('button', { name: 'Withdraw attempt', exact: true });
  page.once('dialog', (d) => d.dismiss());
  await withdraw.click();
  const withdrawApi = `**/api${receiptUrl()}/withdraw`;
  await page.route(withdrawApi, (r) =>
    r.fulfill({ status: 409, json: { message: 'Synthetic stale withdrawal.' } }),
  );
  page.once('dialog', (d) => d.accept());
  await withdraw.click();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic stale withdrawal.');
  await page.unroute(withdrawApi);
  let finishWithdraw!: () => void;
  const pendingWithdraw = new Promise<void>((r) => {
    finishWithdraw = r;
  });
  await page.route(withdrawApi, async (r) => {
    await pendingWithdraw;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await withdraw.click();
  await expect(
    page.getByRole('button', { name: 'Saving decision...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finishWithdraw();
  await expect(page.getByText('Status: withdrawn', { exact: true })).toBeVisible();
  await page.unroute(withdrawApi);
  expect((await read()).submission.contentHash).toBe(original.submission.contentHash);
  await a11y();
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('withdrawn-mobile');
  // Create another real immutable attempt without changing the withdrawn receipt.
  await post(lessonBase + '/draft', {
    clientId: client,
    version: 1,
    data: {
      body: 'Observed safe practice.\nIndependent evidence supports both criteria.',
      files: [],
      answers: [0, 0],
    },
  });
  receiptId = (
    await post(lessonBase + '/submit', { clientId: client, version: 2, key: crypto.randomUUID() })
  ).id;
  await page.goto(receiptUrl());
  await expect(page.getByRole('heading', { name: 'Attempt 2', exact: true })).toBeVisible();
  const pinned = (await read()).submission;
  const receiptApi = `**/api${receiptUrl()}?*`;
  await expect(page.getByRole('link', { name: 'Return to lesson', exact: true })).toHaveAttribute(
    'href',
    `/enrolments/${id}/delivery/${block}/0`,
  );
  const memberCtx = await (await page.request.get('/api/auth/context')).json();
  expect(
    (
      await page.request.post('/api' + receiptUrl() + '/grade', {
        headers: { Origin: origin },
        data: {
          csrf: memberCtx.csrf,
          clientId: client,
          version: pinned.version,
          reason: 'Member cannot request grading',
        },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get('/api' + receiptUrl() + '?clientId=' + other)).status()).toBe(403);
  await login('demo.1.2@example.invalid');
  await page.goto(receiptUrl());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page.getByText(
      'No grading attempt yet. Assess the evidence directly or request provisional analysis.',
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .locator('summary')
    .filter({ hasText: /^Request provisional grading$/ })
    .click();
  const requestReason = page.getByLabel('Request provisional grading reason', { exact: true });
  await requestReason.fill('Compare the pinned independently reviewed answer key');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Request provisional grading', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Request provisional grading', exact: true }).click();
  await expect(page.getByText('Provisional total: 100', { exact: true })).toBeVisible();
  const provisional = await read();
  // Queue/failure presentation and automatic refresh use explicit response fixtures.
  let polls = 0;
  const queuedGrade = structuredClone(provisional);
  queuedGrade.grades[0].status = 'queued';
  queuedGrade.grades[0].result = null;
  await page.route(receiptApi, (r) => {
    polls++;
    return r.fulfill({ json: queuedGrade });
  });
  await page.reload();
  await expect(
    page.getByText('Waiting for provisional grading. This page refreshes while it is queued.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toBeDisabled();
  await expect.poll(() => polls, { timeout: 10000 }).toBeGreaterThan(1);
  await page.unroute(receiptApi);
  await page.route(receiptApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic grading status outage.' } }),
  );
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic grading status outage.');
  await expect(page.getByRole('heading', { name: 'Attempt 2', exact: true })).toBeVisible();
  await page.unroute(receiptApi);
  const failed = structuredClone(provisional);
  failed.grades[0].status = 'technical_failure';
  failed.grades[0].result = null;
  await page.route(receiptApi, (r) => r.fulfill({ json: failed }));
  await page.getByRole('button', { name: 'Refresh grading status', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Grading did not produce a usable result/)).toBeAttached();
  await page.getByText('Grade attempt 1 / technical failure', { exact: true }).click();
  await expect(page.getByText(/Grading did not produce a usable result/)).toBeVisible();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toBeEnabled();
  await page.unroute(receiptApi);
  await page.reload();
  await expect(page.getByText('Provisional total: 100', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await a11y();
  await screenshot('review-desktop');
  const approveReason = page.getByLabel('Approve grade reason', { exact: true });
  await approveReason.fill('Independently verified both answers against submitted evidence');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Approve grade', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve grade', exact: true }).click();
  await expect(page.getByText('Score: 100 / 100', { exact: true })).toBeVisible();
  expect((await read()).submission.contentHash).toBe(pinned.contentHash);
  await login('demo.1.3@example.invalid');
  await page.goto(receiptUrl());
  await expect(page.getByText('Score: 100 / 100', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grading attempts', exact: true })).toHaveCount(0);
  await expect(page.getByText('Withdraw this attempt', { exact: true })).toHaveCount(0);
  await page
    .getByLabel('Request an appeal reason', { exact: true })
    .fill('Request an independent review of the recorded evidence');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Request an appeal', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Request an appeal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Appeal / open', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('member-appeal-mobile');
  await login('demo.1.2@example.invalid');
  await page.goto(receiptUrl());
  await expect(
    page.getByRole('heading', { name: 'Human assessment or override', exact: true }),
  ).toHaveCount(0);
  await login('demo.1.0@example.invalid');
  expect((await page.request.get('/api' + receiptUrl() + '?clientId=' + client)).status()).toBe(
    404,
  );
  const routing = await (
    await page.request.get('/api/enrolments/learning-appeals?clientId=' + client)
  ).json();
  const appeal =
    routing.appeals.find((x: { id: string }) => x.id === provisional.appeals[0]?.id) ??
    routing.appeals[0];
  const alternate = appeal.reviewers.find(
    (r: { name: string }) => r.name === 'Demo Coordinator 1.1',
  );
  expect(alternate).toBeTruthy();

  await page.goto('/learning-reviews');
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(
    page.getByText(
      'No work is awaiting your review under your current permissions. Assigned appeals also appear here.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Score: 100 / 100', { exact: true })).toHaveCount(0);
  await page.getByText('Learning case ' + appeal.id, { exact: true }).click();
  const reviewer = page.getByRole('combobox', { name: 'Alternate reviewer for ' + appeal.id });
  const reason = page.getByLabel('Assign learning reviewer reason', { exact: true });
  await expect(
    page.getByRole('button', { name: 'Assign learning reviewer', exact: true }),
  ).toBeDisabled();
  await reviewer.selectOption(alternate.id);
  await expect(reviewer.locator('option')).toHaveCount(appeal.reviewers.length + 1);
  await reason.fill('Assign an independent coordinator to this learning appeal');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(reason).toHaveValue('Assign an independent coordinator to this learning appeal');
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/learning-reviews$/);
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Assign learning reviewer', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await screenshot('appeal-routing-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('appeal-routing-mobile');

  const routingTouchContext = await page
    .context()
    .browser()!
    .newContext({
      baseURL: origin,
      viewport: { width: 390, height: 900 },
      hasTouch: true,
      storageState: await page.context().storageState(),
    });
  try {
    const touch = await routingTouchContext.newPage();
    await touch.goto('/learning-reviews');
    const disclosure = touch.getByText('Learning case ' + appeal.id, { exact: true });
    await disclosure.click();
    expect((await disclosure.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const select = touch.getByRole('combobox', { name: 'Alternate reviewer for ' + appeal.id });
    await select.selectOption(alternate.id);
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      await touch
        .getByLabel('Assign learning reviewer reason', { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await touch
        .getByRole('button', { name: 'Assign learning reviewer', exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await routingTouchContext.close();
  }
  const routeApi = '**/api/enrolments/learning-appeals/' + appeal.id + '/route';
  await page.route(routeApi, (r) =>
    r.fulfill({
      status: 409,
      json: { message: 'Reviewer eligibility changed. Review the assignment.' },
    }),
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Assign learning reviewer', exact: true }).click();
  await expect(
    page.getByText('Reviewer eligibility changed. Review the assignment.', { exact: true }),
  ).toBeVisible();
  await expect(reviewer).toHaveValue(alternate.id);
  await expect(reason).toHaveValue('Assign an independent coordinator to this learning appeal');
  await page.unroute(routeApi);
  let releaseRoute!: () => void;
  const heldRoute = new Promise<void>((resolve) => {
    releaseRoute = resolve;
  });
  await page.route(routeApi, async (r) => {
    await heldRoute;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Assign learning reviewer', exact: true }).click();
  await expect(reviewer).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  releaseRoute();
  await expect(
    page.getByText('Independent learning reviewer assigned.', { exact: true }),
  ).toBeVisible();
  await expect(reason).toHaveValue('');
  await page.unroute(routeApi);
  // A completed assignment no longer prompts on navigation.
  await page.getByRole('link', { name: 'Back to workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await login('demo.1.1@example.invalid');
  await page.goto('/learning-reviews');
  const caseLink = page.getByRole('link', {
    name: 'Demo Member 1.3 / Submission receipt verification',
    exact: true,
  });
  await expect(caseLink).toHaveAttribute('href', receiptUrl());
  await expect(
    page.getByRole('heading', { name: 'Assign learning appeal reviewers', exact: true }),
  ).toHaveCount(0);
  await a11y();
  await screenshot('review-queue-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await screenshot('review-queue-desktop');
  await caseLink.click();

  await page.goto(receiptUrl());
  await expect(
    page.getByRole('link', { name: 'Back to review queue', exact: true }),
  ).toHaveAttribute('href', '/learning-reviews');
  await expect(page.getByRole('link', { name: 'Return to lesson', exact: true })).toHaveCount(0);
  await expect(page.getByText('Provisional total: 100', { exact: true })).toHaveCount(0);
  await page
    .getByLabel('Uphold existing decision reason', { exact: true })
    .fill('Independent evidence confirms the recorded outcome');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Uphold existing decision', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Uphold existing decision', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Independent review recorded', exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'Return to review queue', exact: true }),
  ).toHaveAttribute('href', '/learning-reviews');
  await a11y();
  await screenshot('closed-case-mobile');
  await page.reload();
  await expect(page.locator('p[role=alert]')).toHaveText('This submission is unavailable.');
  expect((await page.request.get('/api' + receiptUrl() + '?clientId=' + client)).status()).toBe(
    404,
  );
  await login('demo.1.2@example.invalid');
  await page.goto(receiptUrl());
  await page.setViewportSize({ width: 1440, height: 1000 });
  const human = page.getByRole('button', { name: 'Record human decision', exact: true });
  await human.click();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toBeFocused();
  for (let i = 1; i <= 2; i++) {
    await page.getByLabel('Score for criterion ' + i, { exact: true }).fill('90');
    await page
      .getByLabel('Evidence and feedback for criterion ' + i, { exact: true })
      .fill('Observed demonstration supports criterion ' + i + '.');
  }
  await page.getByRole('radio', { name: 'Approve', exact: true }).check();
  await page
    .getByLabel('Decision rationale', { exact: true })
    .fill('Record an evidence-supported human assessment');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Score for criterion 1', { exact: true })).toHaveValue('90');
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Return to lesson', exact: true }).click();
  await expect(page).toHaveURL(receiptUrl());
  await expect(
    page.getByRole('button', { name: 'Refresh grading status', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'Insufficient evidence for criterion 2', exact: true })
    .check();
  page.once('dialog', (d) => d.accept());
  await human.click();
  await expect(page.getByText(/Insufficient evidence cannot become/)).toBeVisible();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toHaveValue('90');
  await page
    .getByRole('checkbox', { name: 'Insufficient evidence for criterion 2', exact: true })
    .uncheck();
  await page.getByRole('radio', { name: 'Request more evidence or changes', exact: true }).check();
  page.once('dialog', (d) => d.dismiss());
  await human.click();
  // A competing decision makes this exact UI version stale; local values must survive.
  const current = await read();
  const manualData = {
    clientId: client,
    version: current.submission.version,
    outcome: 'changes_requested',
    reason: 'Other reviewer tab requested more detailed evidence',
    result: {
      rubric_id: pinned.rubric.id,
      rubric_version: pinned.rubric.version,
      criteria: pinned.rubric.criteria.map((c: { id: string }) => ({
        id: c.id,
        score: 80,
        evidence_ids: [receiptId + ':text'],
        feedback: 'Clarify the evidence for this criterion.',
        insufficient_evidence: false,
      })),
    },
  };
  await post(receiptUrl() + '/manual', manualData);
  page.once('dialog', (d) => d.accept());
  await human.click();
  await expect(page.locator('p[role=alert]')).toBeVisible();
  await expect(page.getByLabel('Decision rationale', { exact: true })).toHaveValue(
    'Record an evidence-supported human assessment',
  );
  await page.getByText('Discard unrecorded assessment inputs', { exact: true }).click();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Discard unrecorded inputs', exact: true }).click();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toHaveValue('90');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Discard unrecorded inputs', exact: true }).click();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toHaveValue('');
  await expect(page.locator('p[role=alert]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh grading status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Requested changes', exact: true })).toBeVisible();
  await expect(page.getByText('Score: 100 / 100', { exact: true })).toBeVisible();
  for (let i = 1; i <= 2; i++) {
    await page.getByLabel('Score for criterion ' + i, { exact: true }).fill('90');
    await page
      .getByLabel('Evidence and feedback for criterion ' + i, { exact: true })
      .fill('Independently verified evidence supports criterion ' + i + '.');
  }
  await page.getByRole('radio', { name: 'Approve', exact: true }).check();
  await page
    .getByLabel('Decision rationale', { exact: true })
    .fill('Updated official assessment with preserved earlier feedback');
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('human-review-mobile');
  let finishManual!: () => void;
  const pendingManual = new Promise<void>((r) => {
    finishManual = r;
  });
  const manualApi = `**/api${receiptUrl()}/manual`;
  await page.route(manualApi, async (r) => {
    await pendingManual;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await human.click();
  await expect(
    page.getByRole('button', { name: 'Recording decision...', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Score for criterion 1', { exact: true })).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finishManual();
  await expect(page.getByText('Score: 90 / 100', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Decision rationale', { exact: true })).toHaveValue('');
  await page.unroute(manualApi);
  expect((await read()).submission.contentHash).toBe(pinned.contentHash);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme / }).first().click();
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
  const touchContext = await page
    .context()
    .browser()!
    .newContext({
      baseURL: origin,
      viewport: { width: 390, height: 900 },
      hasTouch: true,
      storageState: await page.context().storageState(),
    });
  try {
    const touch = await touchContext.newPage();
    await touch.goto(receiptUrl());
    await expect(touch.getByLabel('Score for criterion 1', { exact: true })).toBeVisible();
    expect(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(
      (await touch
        .getByRole('radio', { name: 'Approve', exact: true })
        .locator('..')
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await touch
        .getByRole('button', { name: 'Record human decision', exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await touch
        .getByLabel('Score for criterion 1', { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  await login('demo.1.3@example.invalid');
  await page.goto(receiptUrl());
  await expect(page.getByText('Score: 90 / 100', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Human assessment or override', exact: true }),
  ).toHaveCount(0);
  const long = await read();
  long.enrolment.title = 'Long record title ' + 'x'.repeat(250);
  long.submission.body = 'Long unbroken submitted response ' + 'y'.repeat(300);
  long.submission.files = ['11111111-1111-4111-8111-111111111111'];
  await page.route(receiptApi, (r) => r.fulfill({ json: long }));
  await page.reload();
  await expect(page.getByRole('link', { name: /^Download evidence / })).toHaveAttribute(
    'href',
    '/api/files/11111111-1111-4111-8111-111111111111',
  );
  await page.getByText('Receipt integrity and rubric', { exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.unroute(receiptApi);
  await login('curriculum-ui@example.invalid');
  await page.goto(receiptUrl());
  await expect(page.locator('p[role=alert]')).toBeVisible();
  expect((await page.request.get('/api' + receiptUrl() + '?clientId=' + client)).status()).toBe(
    404,
  );

  const queueApi = '**/api/enrolments/learning-reviews?*';
  const routingApi = '**/api/enrolments/learning-appeals?*';
  for (const email of [
    'curriculum-ui@example.invalid',
    'demo.1.3@example.invalid',
    'demo.1.1@example.invalid',
  ]) {
    await login(email);
    await page.goto('/learning-reviews');
    await expect(
      page.getByText(
        'No work is awaiting your review under your current permissions. Assigned appeals also appear here.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Assign learning appeal reviewers', exact: true }),
    ).toHaveCount(0);
  }
  await login('demo.1.0@example.invalid');
  await page.goto('/learning-reviews');
  await expect(
    page.getByText('No open learning appeals need routing.', { exact: true }),
  ).toBeVisible();
  await login('demo.1.2@example.invalid');
  // Explicit queue fixtures qualify paging/recovery and long data, not real extra submissions.
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    enrolmentId: id,
    title: 'Long queue record ' + 'x'.repeat(220),
    memberName: 'Synthetic member',
    attempt: 2,
    status: 'technical_failure',
    createdAt: new Date().toISOString(),
  };
  let failSecond = true;
  await page.route(queueApi, (r) => {
    const n = Number(new URL(r.request().url()).searchParams.get('page'));
    if (n === 2 && failSecond)
      return r.fulfill({ status: 503, json: { message: 'Review queue temporarily unavailable.' } });
    return r.fulfill({
      json: {
        page: n,
        total: 21,
        records: [{ ...row, memberName: n === 2 ? 'Last member' : 'Synthetic member' }],
      },
    });
  });
  await page.goto('/learning-reviews');
  await expect(page.getByText('Page 1 / 21 review items', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next reviews', exact: true }).click();
  await expect(
    page.getByText('Review queue temporarily unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Page 1 / 21 review items', { exact: true })).toBeVisible();
  failSecond = false;
  await page.getByRole('button', { name: 'Next reviews', exact: true }).click();
  await expect(page.getByText('Page 2 / 21 review items', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next reviews', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous reviews', exact: true }).click();
  await expect(page.getByText('Page 1 / 21 review items', { exact: true })).toBeVisible();
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await a11y();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const queueSettings = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await queueSettings.locator('summary').click();
  await queueSettings.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await a11y();
  await page.unroute(queueApi);
  let releaseQueue!: () => void;
  const holdQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await page.route(queueApi, async (r) => {
    await holdQueue;
    await r.fulfill({ status: 503, json: { message: 'Queue recovery check.' } });
  });
  await page.reload();
  await expect(page.getByText('Loading learning reviews...', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh review queue', exact: true }),
  ).toBeDisabled();
  releaseQueue();
  await expect(page.getByText('Queue recovery check.', { exact: true })).toBeVisible();
  await page.unroute(queueApi);
  await page.getByRole('button', { name: 'Refresh review queue', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Queue recovery check.', { exact: true })).toHaveCount(0);
  await login('demo.1.0@example.invalid');
  await page.route(routingApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Routing recovery check.' } }),
  );
  await page.goto('/learning-reviews');
  await expect(page.getByText('Routing recovery check.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Work awaiting your review', exact: true }),
  ).toBeVisible();
  await page.unroute(routingApi);
  await page.route(routingApi, (r) =>
    r.fulfill({
      json: {
        canRoute: true,
        appeals: [{ id: 'case-' + 'x'.repeat(180), reviewerId: null, reviewers: [] }],
      },
    }),
  );
  await page.getByRole('button', { name: 'Retry learning appeal routing', exact: true }).click();
  await page
    .locator('summary')
    .filter({ hasText: /^Learning case / })
    .click();
  await expect(
    page.getByText(
      'No eligible independent coordinator is available for this team. A Client Admin must arrange an appropriate team role first.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Assign learning reviewer', exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.unroute(routingApi);
  await page.reload();
  await expect(
    page.getByText('No open learning appeals need routing.', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

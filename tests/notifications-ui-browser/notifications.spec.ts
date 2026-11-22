import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared updates preserve scoped notices, preference saves and navigation guards', async ({
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
      path: `output/playwright/notifications-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/notifications');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/notifications');
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
    title: 'Progress and evidence verification',
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
        unit: i === 0 ? 'percent' : 'cases',
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
  await page.goto('/enrolments/' + id + '/progress');
  await expect(
    page.getByText('KPI definitions become available after programme activation.', { exact: true }),
  ).toBeVisible();
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
  await post(`/enrolments/${id}/delivery/${block}/early-start`, {
    clientId: client,
    reason: 'Allow evidence for isolated support verification',
  });
  await login('demo.1.3@example.invalid');
  await post(lessonBase + '/draft', {
    clientId: client,
    version: 0,
    data: {
      body: 'Observed practice with evidence for independently reviewed criteria.',
      files: [],
      answers: [],
    },
  });
  const submitted = await post(lessonBase + '/submit', {
    clientId: client,
    version: 1,
    key: crypto.randomUUID(),
  });
  await login('demo.1.2@example.invalid');
  const receipt = await (
    await page.request.get(`/api/enrolments/${id}/submissions/${submitted.id}?clientId=${client}`)
  ).json();
  await post(`/enrolments/${id}/submissions/${submitted.id}/manual`, {
    clientId: client,
    version: receipt.submission.version,
    outcome: 'approved',
    reason: 'Approve independently checked evidence for support',
    result: {
      rubric_id: receipt.submission.rubric.id,
      rubric_version: receipt.submission.rubric.version,
      criteria: receipt.submission.rubric.criteria.map((c: { id: string }) => ({
        id: c.id,
        score: 80,
        feedback: 'Observed evidence supports this criterion with room for practice.',
        evidence_ids: [submitted.id + ':text'],
        insufficient_evidence: false,
      })),
    },
  });
  await login('demo.1.3@example.invalid');
  const noticesApi = '**/api/notifications?*',
    preferenceApi = '**/api/notifications';
  const readNotices = async () =>
    (await page.request.get('/api/notifications?clientId=' + client)).json();
  await expect
    .poll(async () =>
      (await readNotices()).notices.some((n: { kind: string }) => n.kind === 'feedback_ready'),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      (await readNotices()).notices.every((n: { status: string }) => n.status === 'sink_delivered'),
    )
    .toBe(true);
  await page.goto('/notifications');
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  const enabled = page.getByRole('radio', {
    name: 'Enabled when a live sender is configured',
    exact: true,
  });
  const quiet = page.getByRole('radio', { name: 'In-app updates only', exact: true });
  const save = page.getByRole('button', { name: 'Save preference', exact: true });
  await expect(enabled).toBeChecked();
  const feedback = page.getByRole('link', { name: 'feedback ready', exact: true }).first();
  await expect(feedback).toHaveAttribute('href', `/enrolments/${id}/delivery`);
  await expect(
    page.getByText(
      'Synthetic accounts use a non-delivering sink. Relay acceptance does not prove email delivery.',
    ),
  ).toBeVisible();
  await quiet.check();
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(quiet).toBeChecked();
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  page.once('dialog', (d) => d.dismiss());
  await feedback.click();
  await expect(page).toHaveURL(/\/notifications$/);
  // Refresh must not overwrite the in-memory preference draft.
  await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh updates', exact: true })).toBeEnabled();
  await expect(quiet).toBeChecked();
  await page.route(preferenceApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Preference could not be saved. Try again.' } }),
  );
  await save.click();
  await expect(
    page.getByText('Preference could not be saved. Try again.', { exact: true }),
  ).toBeVisible();
  await expect(quiet).toBeChecked();
  expect((await readNotices()).trainingEmail).toBe(true);
  await page.unroute(preferenceApi);
  let releaseSave!: () => void;
  const holdSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(preferenceApi, async (r) => {
    await holdSave;
    await r.continue();
  });
  await save.click();
  await expect(
    page.getByRole('button', { name: 'Saving preference...', exact: true }),
  ).toBeDisabled();
  await expect(enabled).toBeDisabled();
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => {
      expect(d.type()).toBe('alert');
      return d.accept();
    });
    await page.getByRole('button', { name, exact: true }).click();
  }
  releaseSave();
  await expect(
    page.getByText('Email preference saved. In-app updates remain available.', { exact: true }),
  ).toBeVisible();
  await page.unroute(preferenceApi);
  expect((await readNotices()).trainingEmail).toBe(false);
  await page.reload();
  await expect(quiet).toBeChecked();
  await feedback.click();
  await expect(page).toHaveURL(new RegExp('/enrolments/' + id + '/delivery$'));
  await page.goto('/notifications');
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await screenshot('updates-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('updates-mobile');
  // Keyboard radio navigation and save retain the existing native form semantics.
  await quiet.focus();
  await page.keyboard.press('ArrowUp');
  await expect(enabled).toBeChecked();
  await save.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('Email preference saved. In-app updates remain available.', { exact: true }),
  ).toBeVisible();
  expect((await readNotices()).trainingEmail).toBe(true);
  await quiet.check();
  await expect(
    page.getByText('Email preference saved. In-app updates remain available.', { exact: true }),
  ).toHaveCount(0);
  await enabled.check();
  // Explicit fixtures exercise pagination and all published status labels without sending email.
  const real = await readNotices();
  const rows = [
    'pending',
    'sink_delivered',
    'in_app_only',
    'relay_accepted',
    'ambiguous',
    'failed',
    'cancelled',
  ].map((status, i) => ({
    id: 'notice-' + i,
    kind: i === 0 ? 'assessment_assigned' : 'feedback_ready',
    status,
    createdAt: '2026-11-19T01:00:00.000Z',
    href: i === 0 ? '/assessments' : `/enrolments/${id}/delivery`,
  }));
  let failSecond = true;
  await page.route(noticesApi, (r) => {
    const n = Number(new URL(r.request().url()).searchParams.get('page'));
    if (n === 2 && failSecond)
      return r.fulfill({ status: 503, json: { message: 'Updates temporarily unavailable.' } });
    return r.fulfill({
      json: {
        trainingEmail: true,
        page: n,
        total: 21,
        notices: n === 1 ? rows : [{ ...rows[0], kind: 'Long_notice_' + 'x'.repeat(240) }],
      },
    });
  });
  await page.reload();
  await expect(page.getByText('Page 1 / 21 updates', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'assessment assigned', exact: true }),
  ).toHaveAttribute('href', '/assessments');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Updates temporarily unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 / 21 updates', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  failSecond = false;
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Page 2 / 21 updates', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.getByText('Page 1 / 21 updates', { exact: true })).toBeVisible();
  await page.unroute(noticesApi);
  await page.route(noticesApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Retained updates recovery.' } }),
  );
  await quiet.check();
  await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
  await expect(page.getByText('Retained updates recovery.', { exact: true })).toBeVisible();
  await expect(page.getByText('Page 1 / 21 updates', { exact: true })).toBeVisible();
  await expect(quiet).toBeChecked();
  await page.unroute(noticesApi);
  await page.getByRole('button', { name: 'Refresh updates', exact: true }).click();
  await expect(page.getByText('Retained updates recovery.', { exact: true })).toHaveCount(0);
  await expect(quiet).toBeChecked();
  await enabled.check();
  let releaseLoad!: () => void;
  const holdLoad = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  await page.route(noticesApi, async (r) => {
    await holdLoad;
    await r.fulfill({ status: 503, json: { message: 'Initial updates recovery.' } });
  });
  await page.reload();
  await expect(page.getByText('Loading your updates...', { exact: true })).toBeVisible();
  releaseLoad();
  await expect(page.getByText('Initial updates recovery.', { exact: true })).toBeVisible();
  await page.unroute(noticesApi);
  await page.getByRole('button', { name: 'Try loading updates again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your updates', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await a11y();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  let personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await a11y();
  await screenshot('updates-dark-desktop');
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
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
    await touch.goto('/notifications');
    const radio = touch.getByRole('radio', { name: 'In-app updates only', exact: true });
    await expect(radio).toBeVisible();
    expect((await radio.locator('..').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await touch.getByRole('button', { name: 'Save preference', exact: true }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await touch
        .getByRole('link', { name: 'feedback ready', exact: true })
        .first()
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  // Role/client scopes are real; the shared page does not expand the recipient set.
  expect((await page.request.get('/api/notifications?clientId=' + other)).status()).toBe(403);
  for (const email of [
    'demo.1.2@example.invalid',
    'demo.1.0@example.invalid',
    'curriculum-ui@example.invalid',
  ]) {
    await login(email);
    await page.goto('/notifications');
    const projected = await readNotices();
    await expect(
      page.getByText('Page 1 / ' + projected.total + ' updates', { exact: true }),
    ).toBeVisible();
    if (email === 'demo.1.2@example.invalid')
      expect(projected.notices.some((n: { kind: string }) => n.kind === 'review_needed')).toBe(
        true,
      );
    else {
      expect(projected.notices).toEqual([]);
      await expect(
        page.getByText(
          'No updates are available for your current permissions. Your training events will appear here when recorded.',
        ),
      ).toBeVisible();
    }
  }
  // Email preference is account-wide, independent of the client selected for the list.
  await quiet.check();
  await save.click();
  await expect(
    page.getByText('Email preference saved. In-app updates remain available.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Active client', exact: true }).selectOption(other);
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/notifications');
  await expect(quiet).toBeChecked();
  expect(
    (await (await page.request.get('/api/notifications?clientId=' + other)).json()).trainingEmail,
  ).toBe(false);
  await a11y();
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('updates-empty-mobile');
  expect(errors).toEqual([]);
});

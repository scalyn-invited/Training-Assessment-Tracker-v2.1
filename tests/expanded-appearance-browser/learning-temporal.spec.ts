import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { install, start, finish } from './temporal-helper.js';

test('responsive lesson and receipt painted controls across data and intra-view transitions', async ({
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
    await page.screenshot({ path: `output/playwright/receipt-ui/${name}.png`, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/submissions/00000000-0000-4000-8000-000000000002',
  );
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/submissions/00000000-0000-4000-8000-000000000002',
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

  await page.goto('/dashboard');
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).click();
  const saved = page.waitForResponse(
    (r) => r.url().includes('/api/branding/preference') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await saved;
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await install(page);
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let seen = false;
    const pattern = '**/api' + lessonBase + '?*';
    await page.route(pattern, async (r) => {
      seen = true;
      await gate;
      await r.continue();
    });
    await page.goto('/enrolments/' + id + '/delivery/' + block + '/0');
    await expect.poll(() => seen).toBe(true);
    await expect(page.getByText('Loading lesson...', { exact: true })).toBeVisible();
    await page
      .getByRole('link', { name: 'Back to learning plan', exact: true })
      .evaluate((e) => e.setAttribute('data-qa-back', ''));
    await start(page, { back: '[data-qa-back]', response: '#work-body' }, 'lesson-pending-ready');
    open();
    await expect(page.getByLabel('Your response', { exact: true })).toBeVisible();
    await finish(page, 'lesson-ready-' + width, ['back']);
    await page.unroute(pattern);
    await page.getByLabel('Your response', { exact: true }).scrollIntoViewIfNeeded();
    await start(page, { response: '#work-body' }, 'lesson-draft');
    await page.getByLabel('Your response', { exact: true }).fill('Temporal response ' + width);
    await expect(
      page.getByText('Draft saved. This has not been submitted.', { exact: true }),
    ).toBeVisible();
    await finish(page, 'lesson-autosave-' + width, ['response']);
    await page.screenshot({
      path:
        (process.env.QA_EVIDENCE_DIR || 'evidence/round3/dynamic') + '/lesson-' + width + '.png',
    });
  }
  const current = await (
    await page.request.get('/api' + lessonBase + '?clientId=' + client)
  ).json();
  const first = await post(lessonBase + '/submit', {
    clientId: client,
    version: current.draft.version,
    key: crypto.randomUUID(),
  });
  const receiptUrl = '/enrolments/' + id + '/submissions/' + first.id;
  for (const width of [1440, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let seen = false;
    const pattern = '**/api' + receiptUrl + '?*';
    await page.route(pattern, async (r) => {
      seen = true;
      await gate;
      await r.continue();
    });
    await page.goto(receiptUrl);
    await expect.poll(() => seen).toBe(true);
    await expect(page.getByText('Loading submission receipt...', { exact: true })).toBeVisible();
    await page
      .getByRole('link', { name: 'Back to learning plan', exact: true })
      .evaluate((e) => e.setAttribute('data-qa-back', ''));
    await start(page, { back: '[data-qa-back]' }, 'receipt-pending-ready');
    open();
    await expect(page.getByText('Status: submitted', { exact: true })).toBeVisible();
    await finish(page, 'receipt-ready-' + width, ['back']);
    await page.unroute(pattern);
    await page
      .getByRole('heading', { name: 'Attempt 1', exact: true })
      .evaluate((e) => e.setAttribute('data-qa-attempt', ''));
    await page.getByText('Receipt integrity and rubric', { exact: true }).scrollIntoViewIfNeeded();
    await page
      .getByText('Receipt integrity and rubric', { exact: true })
      .evaluate((e) => e.setAttribute('data-qa-integrity', ''));
    await start(page, { integrity: '[data-qa-integrity]' }, 'receipt-integrity-expand');
    await page.getByText('Receipt integrity and rubric', { exact: true }).click();
    await finish(page, 'receipt-details-' + width, ['integrity']);
    await page.screenshot({
      path:
        (process.env.QA_EVIDENCE_DIR || 'evidence/round3/dynamic') + '/receipt-' + width + '.png',
    });
  }
  expect(errors).toEqual([]);
});

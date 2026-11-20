import { test, expect } from '@playwright/test';
import { Database } from '../../packages/database/src/database.js';
import AxeBuilder from '@axe-core/playwright';

test('shared lesson preserves quiz publication, drafts, scans, immutable submission and access', async ({
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
    await page.screenshot({ path: `output/playwright/lesson-ui/${name}.png`, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/delivery/00000000-0000-4000-8000-000000000002/0',
  );
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/delivery/00000000-0000-4000-8000-000000000002/0',
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
    title: 'Learning lesson verification',
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
    lessonUrl = `/enrolments/${id}/delivery/${block}/0`,
    base = `/enrolments/${id}/delivery/${block}/lessons/0`,
    lessonApi = `**/api${base}?*`,
    read = async () => (await page.request.get(`/api${base}?clientId=${client}`)).json();
  // The coordinator can preview and publish, but cannot write member work.
  await page.goto(`/enrolments/${id}/delivery/${block}/not-an-index`);
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(page.locator('p[role=alert]')).toBeVisible();
  await page.goto(lessonUrl);
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(page.getByText(/Preview only. Work opens/)).toBeVisible();
  await expect(page.getByLabel('Your response', { exact: true })).toHaveCount(0);
  await page.getByText('Publish an objective quiz for this lesson', { exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  const themeSaved = page.waitForResponse(
    (r) => r.url().includes('/api/branding/preference') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  expect((await themeSaved).ok()).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.locator('summary').filter({ hasText: 'Theme' }).first().locator('..'),
  ).not.toHaveAttribute('open', '');
  const submitQuiz = page.getByRole('button', { name: 'Publish reviewed quiz', exact: true });
  await submitQuiz.click();
  await expect(page.getByLabel('Question 1', { exact: true })).toBeFocused();
  for (let i = 1; i <= 2; i++) {
    await page
      .getByLabel('Question ' + i, { exact: true })
      .fill('Which practice is supported by evidence ' + i + '?');
    await page
      .getByLabel('Answer options ' + i, { exact: true })
      .fill('Observed safe practice\nUnsupported assumption');
  }
  await page
    .getByLabel('Review and publication reason', { exact: true })
    .fill('Reviewed objective questions for isolated practice');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Question 1', { exact: true })).toHaveValue(
      'Which practice is supported by evidence 1?',
    );
  }
  await a11y();
  await screenshot('quiz-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('quiz-mobile');
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.once('dialog', (d) => d.dismiss());
  await submitQuiz.click();
  await expect(submitQuiz).toBeEnabled();
  const quizApi = `**/api${base}/quiz`;
  await page.route(quizApi, (r) =>
    r.fulfill({ status: 409, json: { message: 'Synthetic quiz publication conflict.' } }),
  );
  page.once('dialog', (d) => d.accept());
  await submitQuiz.click();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic quiz publication conflict.');
  await page.unroute(quizApi);
  let publish!: () => void;
  const publishing = new Promise<void>((r) => {
    publish = r;
  });
  await page.route(quizApi, async (r) => {
    await publishing;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await submitQuiz.click();
  await expect(
    page.getByRole('button', { name: 'Publishing quiz...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  publish();
  await expect(
    page.getByText('Publish an objective quiz for this lesson', { exact: true }),
  ).toHaveCount(0);
  await page.unroute(quizApi);
  const quiz = (await read()).quiz;
  expect(quiz.questions).toHaveLength(2);
  expect(JSON.stringify(quiz)).not.toContain('answer_key');
  const coordCtx = await (await page.request.get('/api/auth/context')).json();
  expect(
    (
      await page.request.post('/api' + base + '/draft', {
        headers: { Origin: origin },
        data: {
          csrf: coordCtx.csrf,
          clientId: client,
          version: 0,
          data: { body: 'Denied coordinator draft', files: [], answers: [] },
        },
      })
    ).status(),
  ).toBe(403);
  await login('demo.1.3@example.invalid');
  await page.goto(lessonUrl);
  await expect(page.getByText(/Preview only. Work opens/)).toBeVisible();
  await login('demo.1.2@example.invalid');
  await post(`/enrolments/${id}/delivery/${block}/early-start`, {
    clientId: client,
    reason: 'Authorise early practice for lesson verification',
  });
  await login('demo.1.3@example.invalid');
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  await page.route(lessonApi, async (r) => {
    await waiting;
    await r.continue();
  });
  await page.goto(lessonUrl);
  await expect(page.getByText('Loading lesson...', { exact: true })).toBeVisible();
  release();
  const response = page.getByLabel('Your response', { exact: true });
  await expect(response).toBeVisible();
  await page.unroute(lessonApi);
  await page.route(lessonApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic lesson outage.' } }),
  );
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic lesson outage.');
  await page.unroute(lessonApi);
  await page.getByRole('button', { name: 'Try loading again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(response).toBeVisible();
  await expect(
    page.getByText('No submitted attempts. Your draft is private work in progress.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText('No supporting files uploaded yet.', { exact: true })).toBeVisible();
  const saveApi = `**/api${base}/draft`,
    saved = page.getByText('Draft saved. This has not been submitted.', { exact: true });
  await page.route(saveApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic draft outage.' } }),
  );
  await response.fill('Retained draft when connection fails.');
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic draft outage.');
  await expect(
    page.getByRole('button', { name: 'Submit saved work for review', exact: true }),
  ).toBeDisabled();
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(response).toHaveValue('Retained draft when connection fails.');
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to learning plan', exact: true }).click();
  await expect(page).toHaveURL(lessonUrl);
  await page.unroute(saveApi);
  let finish!: () => void;
  const pendingSave = new Promise<void>((r) => {
    finish = r;
  });
  let first = true;
  await page.route(saveApi, async (r) => {
    if (first) {
      first = false;
      await pendingSave;
    }
    await r.continue();
  });
  await page.getByRole('button', { name: 'Save work', exact: true }).click();
  await expect(page.getByText('Saving draft...', { exact: true })).toBeVisible();
  await response.fill('Latest response entered while earlier work saves.');
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finish();
  await expect(saved).toBeVisible();
  await page.unroute(saveApi);
  expect((await read()).draft.body).toBe('Latest response entered while earlier work saves.');
  // Real competing save verifies stale version recovery without losing local text.
  const latest = await read();
  await post(base + '/draft', {
    clientId: client,
    version: latest.draft.version,
    data: { body: 'Other tab saved this version.', files: [], answers: [] },
  });
  await response.fill('Local stale-tab text must remain available.');
  await expect(page.locator('p[role=alert]')).toBeVisible();
  await expect(response).toHaveValue('Local stale-tab text must remain available.');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await expect(response).toHaveValue('Other tab saved this version.');
  await response.fill('Observed safe practice with independently checked evidence.');
  await page.getByRole('radio', { name: 'Observed safe practice', exact: true }).first().check();
  await page.getByRole('radio', { name: 'Observed safe practice', exact: true }).last().check();
  await expect(saved).toBeVisible();
  expect((await read()).draft.answers).toEqual([0, 0]);
  // Real upload is quarantined. Scan result below is an isolated DB fixture, not a live scanner.
  const upload = page.getByLabel('Upload supporting evidence', { exact: true });
  await upload.setInputFiles({
    name: 'Lesson evidence.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic observed practice evidence.'),
  });
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  expect(await upload.evaluate((e: HTMLInputElement) => e.files?.length)).toBe(1);
  const filesApi = `**/api/enrolments/${id}/files`;
  await page.route(filesApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic evidence upload outage.' } }),
  );
  await page.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await expect(page.locator('p[role=alert]')).toContainText(
    'Refresh the list before uploading again.',
  );
  expect(await upload.evaluate((e: HTMLInputElement) => e.files?.length)).toBe(1);
  await page.unroute(filesApi);
  let finishUpload!: () => void;
  const pendingUpload = new Promise<void>((r) => {
    finishUpload = r;
  });
  await page.route(filesApi, async (r) => {
    await pendingUpload;
    await r.continue();
  });
  await page.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Uploading evidence...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finishUpload();
  await expect(
    page.getByText('File uploaded. It must pass scanning before you can attach it.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(filesApi);
  expect(await upload.evaluate((e: HTMLInputElement) => e.files?.length)).toBe(0);
  const fileList = await (
    await page.request.get(`/api/enrolments/${id}/files?clientId=${client}`)
  ).json();
  const fileId = fileList.files[0].id;
  await expect(page.getByRole('checkbox', { name: /Lesson evidence.txt/ })).toBeDisabled();
  expect((await page.request.get('/api/files/' + fileId)).status()).toBe(409);
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
  try {
    await db.pool.query(
      "UPDATE evidence_files SET scan_status='clean',scan_token=NULL WHERE id=$1 AND enrolment_id=$2 AND environment='test'",
      [fileId, id],
    );
    await page.getByRole('button', { name: 'Refresh evidence', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('checkbox', { name: 'Lesson evidence.txt - clean', exact: true }).check();
    await expect(saved).toBeVisible();
    expect((await read()).draft.files).toEqual([fileId]);
    await expect(
      page.getByRole('link', { name: 'Download Lesson evidence.txt', exact: true }),
    ).toHaveAttribute('href', '/api/files/' + fileId);
    await db.pool.query(
      "UPDATE evidence_files SET scan_status='rejected' WHERE id=$1 AND environment='test'",
      [fileId],
    );
    await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
    await page
      .getByRole('checkbox', { name: 'Lesson evidence.txt - rejected', exact: true })
      .uncheck();
    await expect(saved).toBeVisible();
    expect((await read()).draft.files).toEqual([]);
  } finally {
    await db.close();
  }
  const memberView = await read();
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
    await touch.goto(lessonUrl);
    await expect(touch.getByLabel('Your response', { exact: true })).toBeVisible();
    expect(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const radioLabel = touch
      .getByRole('radio', { name: 'Observed safe practice', exact: true })
      .first()
      .locator('..');
    expect((await radioLabel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await touch.getByRole('button', { name: 'Upload evidence', exact: true }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await touch
        .getByLabel('Your response', { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await a11y();
  await screenshot('lesson-desktop');
  for (const width of [800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('lesson-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
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
  // Presentation fixtures for long content, a read-only state and the five-file limit.
  const long = structuredClone(memberView);
  long.lesson.title = 'Lesson ' + 'x'.repeat(260);
  long.lesson.explanation = 'Long unbroken resource ' + 'y'.repeat(300);
  long.editable = false;
  long.enrolment.status = 'paused';
  await page.route(lessonApi, (r) => r.fulfill({ json: long }));
  await page.reload();
  await expect(response).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.unroute(lessonApi);
  const limit = structuredClone(memberView);
  limit.draft.files = ['a', 'b', 'c', 'd', 'e'];
  await page.route(lessonApi, (r) => r.fulfill({ json: limit }));
  await page.route(`**/api/enrolments/${id}/files?*`, (r) =>
    r.fulfill({
      json: {
        files: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({
          id,
          name: 'Limit fixture ' + id,
          status: 'clean',
          bytes: 1,
        })),
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByRole('checkbox', { name: 'Limit fixture f - clean', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('checkbox', { name: 'Limit fixture a - clean', exact: true }),
  ).toBeEnabled();
  await page.unroute(lessonApi);
  await page.unroute(`**/api/enrolments/${id}/files?*`);
  await page.reload();
  const submit = page.getByRole('button', { name: 'Submit saved work for review', exact: true });
  page.once('dialog', (d) => d.dismiss());
  await submit.click();
  await expect(response).toBeVisible();
  const submissionApi = `**/api${base}/submit`;
  const keys: string[] = [];
  // Commit succeeds, response is lost: retry must open the same immutable receipt.
  let committed: string | undefined;
  await page.route(submissionApi, async (r) => {
    keys.push(r.request().postDataJSON().key);
    const result = await r.fetch();
    expect(result.ok()).toBe(true);
    committed = (await result.json()).id;
    await r.fulfill({ status: 503, json: { message: 'Synthetic lost submission response.' } });
  });
  page.once('dialog', (d) => d.accept());
  await submit.click();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic lost submission response.');
  await expect(response).toHaveValue(memberView.draft.body);
  await page.unroute(submissionApi);
  let finishSubmission!: () => void;
  const pendingSubmission = new Promise<void>((r) => {
    finishSubmission = r;
  });
  await page.route(submissionApi, async (r) => {
    keys.push(r.request().postDataJSON().key);
    await pendingSubmission;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await submit.click();
  await expect(response).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finishSubmission();
  await expect(page).toHaveURL(new RegExp(`/submissions/${committed}$`));
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.unroute(submissionApi);
  const receipt = await (
    await page.request.get(`/api/enrolments/${id}/submissions/${committed}?clientId=${client}`)
  ).json();
  expect(receipt.submission.body).toBe(memberView.draft.body);
  await page.goto(lessonUrl);
  await expect(page.getByRole('link', { name: /Attempt 1/ })).toHaveAttribute(
    'href',
    `/enrolments/${id}/submissions/${committed}`,
  );
  expect((await read()).attempts).toHaveLength(1);
  expect((await page.request.get(`/api${base}?clientId=${other}`)).status()).toBe(403);
  await login('demo.1.0@example.invalid');
  await page.goto(lessonUrl);
  await expect(page.locator('p[role=alert]')).toBeVisible();
  expect((await page.request.get(`/api${base}?clientId=${client}`)).status()).toBe(404);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await post('/clients/select', { clientId: client });
  expect((await page.request.get(`/api${base}?clientId=${client}`)).status()).toBe(404);
  expect(errors).toEqual([]);
});

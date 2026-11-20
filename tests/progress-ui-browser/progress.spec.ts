import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared progress preserves KPI evidence, future definitions and approved support', async ({
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
    await page.screenshot({ path: `output/playwright/progress-ui/${name}.png`, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/progress');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/progress');
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
  const progressUrl = `/enrolments/${id}/progress`,
    progressApi = `**/api${progressUrl}?*`,
    progressPost = `**/api${progressUrl}`,
    supportPath = `/enrolments/${id}/support`,
    supportApi = `**/api${supportPath}?*`,
    supportPost = `**/api${supportPath}`,
    read = async () =>
      (await page.request.get('/api' + progressUrl + '?clientId=' + client)).json(),
    readSupport = async () =>
      (await page.request.get('/api' + supportPath + '?clientId=' + client)).json();
  let release!: () => void;
  const waiting = new Promise<void>((r) => {
    release = r;
  });
  await page.route(progressApi, async (r) => {
    await waiting;
    await r.continue();
  });
  await page.goto(progressUrl);
  await expect(page.getByText('Loading progress...', { exact: true })).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Measure 0', exact: true })).toBeVisible();
  await page.unroute(progressApi);
  await page.route(progressApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic progress outage.' } }),
  );
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic progress outage.');
  await page.unroute(progressApi);
  await page.getByRole('button', { name: 'Try loading again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Measure 0', exact: true })).toBeVisible();
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  const metric = (name: string) =>
    page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const gradeMetric = metric('Measure 0'),
    observedMetric = metric('Measure 1');
  await expect(observedMetric.getByText(/No sufficient result/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('summary').filter({ hasText: 'Theme' }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await gradeMetric.getByRole('button', { name: 'Refresh evidence snapshot', exact: true }).click();
  await expect(gradeMetric.getByText(/1\/3 required samples/)).toBeVisible();
  expect((await read()).metrics[0].snapshot.value).toBeNull();
  await gradeMetric.getByText('Evidence lineage', { exact: true }).click();
  await expect(gradeMetric.getByText(/Later changes do not rewrite this snapshot/)).toBeVisible();
  const initial = await read(),
    observedId = initial.metrics[1].id;
  await observedMetric.getByText('Record workplace evidence', { exact: true }).click();
  const value = observedMetric.getByLabel('Observed value', { exact: true }),
    evidence = observedMetric.getByLabel('Evidence reference', { exact: true }),
    reason = observedMetric.getByLabel('Observation reason', { exact: true }),
    record = observedMetric.getByRole('button', { name: 'Record evidence', exact: true });
  await record.click();
  await expect(value).toBeFocused();
  await value.fill('80');
  await evidence.fill('Verified observation in the isolated practice log.');
  await reason.fill('Independently checked workplace observation');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(value).toHaveValue('80');
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to learning plan', exact: true }).click();
  await expect(page).toHaveURL(progressUrl);
  page.once('dialog', (d) => d.dismiss());
  await record.click();
  await page.route(progressPost, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic observation outage.' } }),
  );
  page.once('dialog', (d) => d.accept());
  await record.click();
  await expect(observedMetric.locator('p[role=alert]')).toContainText(
    'Synthetic observation outage.',
  );
  await expect(evidence).toHaveValue('Verified observation in the isolated practice log.');
  await page.unroute(progressPost);
  let finish!: () => void;
  const pendingObservation = new Promise<void>((r) => {
    finish = r;
  });
  await page.route(progressPost, async (r) => {
    await pendingObservation;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await record.click();
  await expect(
    observedMetric.getByRole('button', { name: 'Recording evidence...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finish();
  await expect(
    observedMetric.getByText('Verified observation recorded.', { exact: true }),
  ).toBeVisible();
  await page.unroute(progressPost);
  await expect(value).toHaveValue('');
  expect((await read()).metrics[1].snapshot.value).toBeNull();
  for (const n of ['90', '100']) {
    await value.fill(n);
    await evidence.fill('Verified observation from a separate work sample ' + n);
    await reason.fill('Record separate comparable work sample');
    page.once('dialog', (d) => d.accept());
    await record.click();
    await expect(value).toHaveValue('');
  }
  await expect(observedMetric.getByText(/3\/3 required samples/)).toBeVisible();
  const observed = (await read()).metrics[1];
  expect(observed.snapshot.value).toBe(90);
  expect(observed.snapshot.sourceIds).toHaveLength(3);
  await observedMetric.getByText('Evidence lineage', { exact: true }).click();
  await a11y();
  await screenshot('progress-desktop');
  // Snapshot failure retains already recorded evidence, and pending snapshot blocks shell mutation.
  await page.route(progressPost, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic snapshot outage.' } }),
  );
  await observedMetric
    .getByRole('button', { name: 'Refresh evidence snapshot', exact: true })
    .click();
  await expect(observedMetric.locator('p[role=alert]')).toContainText('Synthetic snapshot outage.');
  await expect(observedMetric.getByText(/3\/3 required samples/)).toBeVisible();
  await page.unroute(progressPost);
  let snapshotDone!: () => void;
  const pendingSnapshot = new Promise<void>((r) => {
    snapshotDone = r;
  });
  await page.route(progressPost, async (r) => {
    await pendingSnapshot;
    await r.continue();
  });
  await observedMetric
    .getByRole('button', { name: 'Refresh evidence snapshot', exact: true })
    .click();
  await expect(
    observedMetric.getByRole('button', { name: 'Recording snapshot...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  snapshotDone();
  await expect(
    observedMetric.getByText('Evidence snapshot recorded. Earlier snapshots remain in history.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(progressPost);
  await observedMetric.getByText('Revise future KPI definition', { exact: true }).click();
  await observedMetric.getByLabel('Target', { exact: true }).fill('85');
  await observedMetric.getByLabel('Direction', { exact: true }).selectOption('band');
  await observedMetric.getByLabel('Upper target', { exact: true }).fill('80');
  await observedMetric.getByLabel('Effective from (UTC)', { exact: true }).fill('2091-01-01T00:00');
  await observedMetric
    .getByLabel('Revision reason', { exact: true })
    .fill('Future band target with separate evidence history');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(observedMetric.getByLabel('Upper target', { exact: true })).toHaveValue('80');
  const revise = observedMetric.getByRole('button', {
    name: 'Save future definition',
    exact: true,
  });
  page.once('dialog', (d) => d.accept());
  await revise.click();
  await expect(
    observedMetric.getByText('The upper target cannot be lower than the target.', { exact: true }),
  ).toBeVisible();
  await observedMetric.getByLabel('Upper target', { exact: true }).fill('100');
  // A real competing definition invalidates this editor's latest ID; input remains available.
  await post(progressUrl, {
    clientId: client,
    action: 'revise',
    metricId: observedId,
    definition: { ...observed.definition, target: 95 },
    effective: '2090-12-01T00:00:00Z',
    reason: 'Another tab created a future definition',
  });
  page.once('dialog', (d) => d.accept());
  await revise.click();
  await expect(
    observedMetric.getByText('KPI definition changed. Reload the latest version.', { exact: true }),
  ).toBeVisible();
  await expect(observedMetric.getByLabel('Target', { exact: true })).toHaveValue('85');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await observedMetric.getByText('Revise future KPI definition', { exact: true }).click();
  await expect(observedMetric.getByLabel('Target', { exact: true })).toHaveValue('95');
  await observedMetric.getByLabel('Target', { exact: true }).fill('85');
  await observedMetric.getByLabel('Direction', { exact: true }).selectOption('band');
  await observedMetric.getByLabel('Upper target', { exact: true }).fill('100');
  await observedMetric.getByLabel('Effective from (UTC)', { exact: true }).fill('2091-01-01T00:00');
  await observedMetric
    .getByLabel('Revision reason', { exact: true })
    .fill('Confirm revised future band without recalculating history');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('definition-mobile');
  let revisionDone!: () => void;
  const pendingRevision = new Promise<void>((r) => {
    revisionDone = r;
  });
  await page.route(progressPost, async (r) => {
    await pendingRevision;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await revise.click();
  await expect(
    observedMetric.getByRole('button', { name: 'Saving definition...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  revisionDone();
  await expect(observedMetric.getByText(/Latest definition 3 takes effect/)).toBeVisible();
  await page.unroute(progressPost);
  const versioned = (await read()).metrics[1];
  expect(versioned.id).toBe(observedId);
  expect(versioned.version).toBe(1);
  expect(versioned.snapshot.value).toBe(90);
  expect(versioned.latest.version).toBe(3);
  const support = page.getByRole('region', { name: 'Learning support', exact: true });
  let supportReady!: () => void;
  const waitingSupport = new Promise<void>((r) => {
    supportReady = r;
  });
  await page.route(supportApi, async (r) => {
    await waitingSupport;
    await r.continue();
  });
  await page.reload();
  await expect(support.getByText('Loading support...', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Measure 0', exact: true })).toBeVisible();
  supportReady();
  await expect(
    support.getByRole('button', { name: 'Refresh support status', exact: true }),
  ).toBeVisible();
  await page.unroute(supportApi);
  await page.route(supportApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic support outage.' } }),
  );
  await page.reload();
  await expect(support.locator('p[role=alert]')).toHaveCount(1);
  await page.unroute(supportApi);
  await support.getByRole('button', { name: 'Try loading support again', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(
    support.getByText('No adaptations yet. The existing learning plan remains in effect.', {
      exact: true,
    }),
  ).toBeVisible();
  await support.getByText('Request future adaptation', { exact: true }).click();
  const evidenceBlock = support.getByLabel('Evidence block number', { exact: true });
  await evidenceBlock.fill('2');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(evidenceBlock).toHaveValue('2');
  await support
    .getByLabel('Request adaptation reason', { exact: true })
    .fill('Use approved evidence to scaffold future practice');
  page.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Request adaptation', exact: true }).click();
  await expect(support.locator('p[role=alert]')).toBeVisible();
  await evidenceBlock.fill('1');
  page.once('dialog', (d) => d.dismiss());
  await support.getByRole('button', { name: 'Request adaptation', exact: true }).click();
  let proposalDone!: () => void;
  const pendingProposal = new Promise<void>((r) => {
    proposalDone = r;
  });
  await page.route(supportPost, async (r) => {
    await pendingProposal;
    await r.continue();
  });
  page.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Request adaptation', exact: true }).click();
  await expect(
    support.getByRole('button', { name: 'Saving decision...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  proposalDone();
  await expect(support.getByText('provisional', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.unroute(supportPost);
  await expect(
    support.getByRole('heading', { name: 'Block 3 adaptation', exact: true }),
  ).toBeVisible();
  const provisional = await readSupport();
  expect(provisional.proposals[0].replacement.number).toBe(3);
  await login('demo.1.3@example.invalid');
  await page.goto(progressUrl);
  await expect(
    support.getByText(
      'No approved adaptations yet. The existing learning plan remains in effect.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh evidence snapshot', exact: true }),
  ).toHaveCount(0);
  const memberContext = await (await page.request.get('/api/auth/context')).json();
  expect(
    (
      await page.request.post('/api' + progressUrl, {
        headers: { Origin: origin },
        data: {
          csrf: memberContext.csrf,
          clientId: client,
          action: 'snapshot',
          metricId: observedId,
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api' + supportPath, {
        headers: { Origin: origin },
        data: { csrf: memberContext.csrf, clientId: client, action: 'suggest' },
      })
    ).status(),
  ).toBe(403);
  await login('demo.1.2@example.invalid');
  await page.goto(progressUrl);
  const approveReason = support.getByLabel('Approve adaptation reason', { exact: true });
  await approveReason.fill('Reviewed exact future teaching changes and preserved requirements');
  await support.getByRole('button', { name: 'Refresh support status', exact: true }).click();
  await expect(approveReason).toHaveValue(
    'Reviewed exact future teaching changes and preserved requirements',
  );
  page.once('dialog', (d) => d.dismiss());
  await support.getByRole('button', { name: 'Approve adaptation', exact: true }).click();
  await page.route(supportPost, (r) =>
    r.fulfill({ status: 409, json: { message: 'Synthetic changed proposal version.' } }),
  );
  page.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Approve adaptation', exact: true }).click();
  await expect(support.locator('p[role=alert]')).toContainText(
    'Synthetic changed proposal version.',
  );
  await page.unroute(supportPost);
  page.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Approve adaptation', exact: true }).click();
  await expect(support.getByText('approved', { exact: true })).toBeVisible();
  const after = await (
    await page.request.get(`/api/enrolments/${id}/delivery?clientId=${client}`)
  ).json();
  expect(after.blocks[0].id).toBe(active.blocks[0].id);
  expect(after.blocks[0].content).toEqual(active.blocks[0].content);
  expect(after.blocks[2].version).toBe(2);
  expect(after.blocks[2].content.lessons[0].reading).toBe(
    active.blocks[2].content.lessons[0].reading,
  );
  let suggestionsDone!: () => void;
  const pendingSuggestions = new Promise<void>((r) => {
    suggestionsDone = r;
  });
  await page.route(supportPost, async (r) => {
    await pendingSuggestions;
    await r.continue();
  });
  page.once('dialog', (d) => d.dismiss());
  await support.getByRole('button', { name: 'Request support suggestions', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await support.getByRole('button', { name: 'Request support suggestions', exact: true }).click();
  await expect(
    support.getByRole('button', { name: 'Requesting suggestions...', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  suggestionsDone();
  await expect(
    support.getByRole('heading', { name: 'Support suggestions: provisional', exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await page.unroute(supportPost);
  const supported = await readSupport();
  await support.getByText('Review teaching changes', { exact: true }).click();
  await support.getByText('Adaptation evidence lineage', { exact: true }).click();
  await support.getByText('Suggestion evidence lineage', { exact: true }).click();
  await a11y();
  await screenshot('support-mobile');
  for (const width of [320, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
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
  // Explicit recovery/display fixtures; these do not replace the real N+2 journey above.
  let polls = 0;
  const state = structuredClone(supported);
  state.proposals[0].status = 'queued';
  state.suggestions[0].status = 'queued';
  await page.route(supportApi, (r) => {
    polls++;
    return r.fulfill({ json: state });
  });
  await page.reload();
  await expect(
    support.getByText('Support is being prepared. You can leave this page and return later.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(() => polls, { timeout: 10000 }).toBeGreaterThan(1);
  await page.unroute(supportApi);
  await page.route(supportApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic polling failure.' } }),
  );
  await expect(support.locator('p[role=alert]')).toContainText('Synthetic polling failure.');
  await expect(
    support.getByRole('heading', { name: 'Block 3 adaptation', exact: true }),
  ).toBeVisible();
  await page.unroute(supportApi);
  const statuses = ['source_review_required', 'stale', 'final_support', 'failed', 'ambiguous'];
  state.proposals = statuses.map((status, n) => ({
    ...supported.proposals[0],
    id: 'fixture-' + n,
    status,
  }));
  state.suggestions = ['failed', 'ambiguous'].map((status, n) => ({
    ...supported.suggestions[0],
    id: 'suggestion-fixture-' + n,
    status,
  }));
  state.proposals[0].reason = 'Long explanation ' + 'x'.repeat(250);
  state.proposals[0].sourceIds = ['y'.repeat(300)];
  await page.route(supportApi, (r) => r.fulfill({ json: state }));
  const paused = await read();
  paused.enrolment.status = 'paused';
  await page.route(progressApi, (r) => r.fulfill({ json: paused }));
  await page.reload();
  await expect(
    support.getByText('Adaptation requests and approvals require an active programme.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(support.getByText(/Source evidence was regraded/)).toBeVisible();
  await expect(support.getByText(/No eligible future block remains/)).toBeVisible();
  await support.getByText('Request future adaptation', { exact: true }).click();
  await expect(
    support.getByRole('button', { name: 'Request adaptation', exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 1000 });
  await a11y();
  await page.unroute(supportApi);
  await page.unroute(progressApi);
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
    await touch.goto(progressUrl);
    await expect(touch.getByRole('heading', { name: 'Measure 1', exact: true })).toBeVisible();
    const target = touch
      .getByRole('button', { name: 'Refresh evidence snapshot', exact: true })
      .first();
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const disclosure = touch.getByText('Record workplace evidence', { exact: true }).first();
    expect((await disclosure.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await disclosure.click();
    expect(
      await touch
        .getByLabel('Observed value', { exact: true })
        .first()
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
  await page.goto(progressUrl);
  await expect(
    support.getByRole('heading', { name: 'Block 3 adaptation', exact: true }),
  ).toBeVisible();
  await expect(
    support.getByRole('heading', { name: 'KPI support suggestions', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Revise future KPI definition', { exact: true })).toHaveCount(0);
  await a11y();
  await screenshot('member-mobile');
  expect((await page.request.get('/api' + progressUrl + '?clientId=' + other)).status()).toBe(403);
  for (const email of ['demo.1.0@example.invalid', 'curriculum-ui@example.invalid']) {
    await login(email);
    await page.goto(progressUrl);
    await expect(page.locator('p[role=alert]')).toBeVisible();
    expect((await page.request.get('/api' + progressUrl + '?clientId=' + client)).status()).toBe(
      404,
    );
  }
  expect(errors).toEqual([]);
});

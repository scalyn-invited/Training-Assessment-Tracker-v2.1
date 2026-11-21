import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared assessment directory preserves author permissions and independent appeal routing', async ({
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
      path: `output/playwright/assessment-directory-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/assessments');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/assessments');
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
  await page.goto('/assessments');
  await expect(
    page.getByText('No definitions yet. Build an assessment to begin.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Build an assessment', exact: true }),
  ).toHaveAttribute('href', '/assessments/definitions/new');
  const content = {
    title: 'Directory evidence assessment',
    questions: [{ id: 'written', type: 'open_response', prompt: 'Explain your evidence.' }],
    rubric: {
      threshold: 75,
      criteria: [
        {
          id: 'evidence',
          category: 'Practice',
          label: 'Evidence',
          guidance: 'Use evidence',
          weight: 1,
        },
      ],
    },
  };
  const published = await post('/assessments/definitions', {
    clientId: client,
    source: null,
    version: 0,
    saveToken: crypto.randomUUID(),
    content,
  });
  await post('/assessments/publish', { clientId: client, id: published.id, version: 1 });
  const draft = await post('/assessments/definitions', {
    clientId: client,
    source: null,
    version: 0,
    saveToken: crypto.randomUUID(),
    content: { ...content, title: 'Unpublished directory draft' },
  });
  const assignment = await post('/assessments/assignments', {
    clientId: client,
    definition: published.id,
    mode: 'member',
    target: id,
    confirmed: true,
  });
  const assignmentUrl = '/assessments/assignments/' + assignment.id;
  await page.reload();
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  const definitionsTable = page.getByRole('table', { name: 'Assessment definitions', exact: true });
  const assignmentsTable = page.getByRole('table', { name: 'Assigned assessments', exact: true });
  await expect(
    definitionsTable.getByRole('link', { name: 'Revise assessment', exact: true }),
  ).toHaveAttribute('href', '/assessments/definitions/' + published.id);
  await expect(
    definitionsTable.getByRole('link', { name: 'Edit draft', exact: true }),
  ).toHaveAttribute('href', '/assessments/definitions/' + draft.id);
  await expect(
    definitionsTable.getByRole('link', { name: 'Assign assessment', exact: true }),
  ).toHaveAttribute('href', '/assessments/definitions/' + published.id + '/assign');
  await expect(
    assignmentsTable.getByRole('link', { name: 'Open assessment', exact: true }),
  ).toHaveAttribute('href', assignmentUrl);
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await screenshot('directory-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('directory-mobile');
  await login('demo.1.3@example.invalid');
  await page.goto('/assessments');
  await expect(definitionsTable).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Build an assessment', exact: true })).toHaveCount(0);
  await expect(
    assignmentsTable.getByRole('link', { name: 'Open assessment', exact: true }),
  ).toHaveAttribute('href', assignmentUrl);
  await assignmentsTable.getByRole('link', { name: 'Open assessment', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(assignmentUrl + '$'));
  expect((await page.request.get('/api/assessments/definitions?clientId=' + client)).status()).toBe(
    403,
  );
  await post('/assessments/responses/' + assignment.id, {
    clientId: client,
    action: 'save',
    expected_version: 1,
    responses: { written: 'Submitted evidence for independent directory review.' },
    files: [],
    save_token: crypto.randomUUID(),
  });
  const submitted = await post('/assessments/responses/' + assignment.id, {
    clientId: client,
    action: 'submit',
    expected_version: 2,
    idempotency_key: crypto.randomUUID(),
  });
  await login('demo.1.2@example.invalid');
  const approved = await post('/assessments/reviews/' + assignment.id, {
    clientId: client,
    expected_version: submitted.version,
    action: 'approve',
    reason: 'Independently verified submitted evidence',
    attempt: submitted.receipt,
    result: {
      rubric_id: published.id,
      rubric_version: 1,
      criteria: [
        {
          id: 'evidence',
          score: 80,
          evidence_ids: [submitted.receipt + ':written'],
          feedback: 'Evidence supports this criterion.',
          insufficient_evidence: false,
        },
      ],
    },
  });
  await login('demo.1.3@example.invalid');
  const opened = await post('/assessments/reviews/' + assignment.id, {
    clientId: client,
    expected_version: approved.version,
    action: 'appeal',
    reason: 'Request independent review of the recorded decision',
  });
  expect((await page.request.get('/api/assessments/assignments?clientId=' + other)).status()).toBe(
    403,
  );
  await login('demo.1.0@example.invalid');
  expect((await page.request.get('/api' + assignmentUrl + '?clientId=' + client)).status()).toBe(
    404,
  );
  const routing = await (
    await page.request.get('/api/assessments/appeals?clientId=' + client)
  ).json();
  const appeal = routing.appeals.find((a: { id: string }) => a.id === opened.appeal);
  const alternate = appeal.reviewers.find(
    (r: { name: string }) => r.name === 'Demo Coordinator 1.1',
  );
  expect(alternate).toBeTruthy();
  expect(appeal.reviewers.some((r: { name: string }) => r.name === 'Demo Coordinator 1.2')).toBe(
    false,
  );
  await page.goto('/assessments');
  await expect(definitionsTable).toHaveCount(0);
  await expect(assignmentsTable).toContainText(
    'No assessments are available for your current client and permissions.',
  );
  await page.getByText('Case ' + appeal.id, { exact: true }).click();
  const reviewer = page.getByRole('combobox', { name: 'Reviewer for ' + appeal.id, exact: true });
  const reason = page.getByLabel('Assignment reason for ' + appeal.id, { exact: true });
  const assign = page.getByRole('button', { name: 'Assign alternate reviewer', exact: true });
  await assign.click();
  await expect(reviewer).toBeFocused();
  await reviewer.selectOption(alternate.id);
  await reason.fill('Assign a different eligible coordinator for independent review');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(reason).toHaveValue(
      'Assign a different eligible coordinator for independent review',
    );
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/assessments$/);
  page.once('dialog', (d) => d.dismiss());
  await assign.click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await screenshot('routing-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('routing-mobile');
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
    await touch.goto('/assessments');
    const summary = touch.getByText('Case ' + appeal.id, { exact: true });
    await summary.click();
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(
      (await touch
        .getByRole('button', { name: 'Assign alternate reviewer', exact: true })
        .boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      await touch
        .getByLabel('Assignment reason for ' + appeal.id, { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  const routeApi = '**/api/assessments/appeals/' + appeal.id + '/route';
  const routingApi = '**/api/assessments/appeals?*';
  await page.route(routeApi, (r) =>
    r.fulfill({
      status: 422,
      json: { message: 'Choose another active coordinator for this team.' },
    }),
  );
  page.once('dialog', (d) => d.accept());
  await assign.click();
  await expect(
    page.getByText('Choose another active coordinator for this team.', { exact: true }),
  ).toBeVisible();
  await expect(reviewer).toHaveValue(alternate.id);
  await expect(reason).toHaveValue(
    'Assign a different eligible coordinator for independent review',
  );
  await page.unroute(routeApi);
  let releaseRoute!: () => void;
  const heldRoute = new Promise<void>((resolve) => {
    releaseRoute = resolve;
  });
  await page.route(routeApi, async (r) => {
    await heldRoute;
    await r.continue();
  });
  // Failure of the follow-up routing fetch must keep the submitted form and reason.
  await page.route(routingApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Routing refresh unavailable.' } }),
  );
  page.once('dialog', (d) => d.accept());
  await assign.click();
  await expect(reviewer).toBeDisabled();
  await expect(reason).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  releaseRoute();
  await expect(page.getByText('Alternate reviewer assigned.', { exact: true })).toBeVisible();
  await expect(page.getByText('Routing refresh unavailable.', { exact: true })).toBeVisible();
  await expect(reason).toHaveValue(
    'Assign a different eligible coordinator for independent review',
  );
  await reason.fill('Retain this newer unsaved reason during retry');
  await page.unroute(routeApi);
  await page.unroute(routingApi);
  await page.getByRole('button', { name: 'Retry appeal routing', exact: true }).click();
  await expect(page.getByText('Routing refresh unavailable.', { exact: true })).toHaveCount(0);
  await expect(reason).toHaveValue('Retain this newer unsaved reason during retry');
  await reason.fill('Assign a different eligible coordinator for independent review');
  await page.getByRole('link', { name: 'Workspace', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await login('demo.1.1@example.invalid');
  await page.goto('/assessments');
  await expect(
    assignmentsTable.getByRole('link', { name: 'Open assessment', exact: true }),
  ).toHaveAttribute('href', assignmentUrl);
  await assignmentsTable.getByRole('link', { name: 'Open assessment', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(assignmentUrl + '$'));
  const independent = await (
    await page.request.get('/api/assessments/reviews/' + assignment.id + '?clientId=' + client)
  ).json();
  expect(independent.canReview).toBe(true);
  await post('/assessments/reviews/' + assignment.id, {
    clientId: client,
    action: 'uphold',
    expected_version: independent.version,
    reason: 'Independent review confirms the recorded evidence and outcome',
  });
  expect((await page.request.get('/api' + assignmentUrl + '?clientId=' + client)).status()).toBe(
    404,
  );
  await page.goto('/assessments');
  await expect(assignmentsTable).toContainText(
    'No assessments are available for your current client and permissions.',
  );
  await login('curriculum-ui@example.invalid');
  await page.goto('/assessments');
  await expect(definitionsTable).toHaveCount(0);
  await expect(assignmentsTable).toContainText(
    'No assessments are available for your current client and permissions.',
  );
  await expect(
    page.getByRole('heading', { name: 'Assign alternate reviewers', exact: true }),
  ).toHaveCount(0);
  await login('demo.1.2@example.invalid');
  const assignmentsApi = '**/api/assessments/assignments?*';
  const definitionsApi = '**/api/assessments/definitions?*';
  const assignedRow = {
    id: assignment.id,
    title: 'Long assessment ' + 'x'.repeat(220),
    memberName: 'Demo Member 1.3',
    status: 'review_pending',
    revision: 1,
  };
  const definitionRow = {
    id: published.id,
    title: 'Long definition ' + 'y'.repeat(220),
    status: 'published',
    revision: 1,
    version: 2,
  };
  let failDefinition = true;
  await page.route(assignmentsApi, (r) =>
    r.fulfill({
      json: {
        author: true,
        assignments: [assignedRow],
        page: Number(new URL(r.request().url()).searchParams.get('page')),
        total: 21,
      },
    }),
  );
  await page.route(definitionsApi, (r) => {
    const p = Number(new URL(r.request().url()).searchParams.get('page'));
    if (p === 2 && failDefinition)
      return r.fulfill({
        status: 503,
        json: { message: 'Definition library temporarily unavailable.' },
      });
    return r.fulfill({ json: { definitions: [definitionRow], page: p, total: 21 } });
  });
  await page.goto('/assessments');
  const definitionPages = page.getByRole('navigation', { name: 'Assessment pages', exact: true });
  const assignmentPages = page.getByRole('navigation', { name: 'Assignment pages', exact: true });
  await page.getByRole('button', { name: 'Next revisions', exact: true }).click();
  await expect(
    page.getByText('Definition library temporarily unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(definitionPages).toContainText('Page 1');
  await expect(definitionsTable).toContainText(definitionRow.title);
  failDefinition = false;
  await page.getByRole('button', { name: 'Next revisions', exact: true }).click();
  await expect(definitionPages).toContainText('Page 2');
  await expect(assignmentPages).toContainText('Page 1');
  await page.getByRole('button', { name: 'Next assignments', exact: true }).click();
  await expect(assignmentPages).toContainText('Page 2');
  await expect(definitionPages).toContainText('Page 2');
  await expect(page.getByRole('button', { name: 'Next revisions', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next assignments', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Previous revisions', exact: true }).click();
  await expect(definitionPages).toContainText('Page 1');
  await expect(assignmentPages).toContainText('Page 2');
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await a11y();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await a11y();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  await a11y();
  await page.unroute(assignmentsApi);
  await page.unroute(definitionsApi);
  let releaseLoad!: () => void;
  const heldLoad = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  await page.route(assignmentsApi, async (r) => {
    await heldLoad;
    await r.fulfill({ status: 503, json: { message: 'Assessment list unavailable.' } });
  });
  await page.reload();
  await expect(page.getByText('Loading assessments...', { exact: true })).toBeVisible();
  releaseLoad();
  await expect(page.getByText('Assessment list unavailable.', { exact: true })).toBeVisible();
  await page.unroute(assignmentsApi);
  await page.getByRole('button', { name: 'Retry assessments', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(definitionsTable).toBeVisible();
  await login('demo.1.0@example.invalid');
  await page.route(routingApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Appeal options unavailable.' } }),
  );
  await page.goto('/assessments');
  await expect(page.getByText('Appeal options unavailable.', { exact: true })).toBeVisible();
  await expect(assignmentsTable).toBeVisible();
  await page.unroute(routingApi);
  const longCase = 'case-' + 'z'.repeat(220);
  await page.route(routingApi, (r) =>
    r.fulfill({
      json: {
        canRoute: true,
        appeals: [{ id: longCase, assignmentId: assignment.id, reviewerId: null, reviewers: [] }],
      },
    }),
  );
  await page.getByRole('button', { name: 'Retry appeal routing', exact: true }).click();
  await page.getByText('Case ' + longCase, { exact: true }).click();
  await expect(
    page.getByText('No eligible alternate coordinator is currently available for this team.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Assign alternate reviewer', exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 320, height: 900 });
  await a11y();
  await page.unroute(routingApi);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Assign alternate reviewers', exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

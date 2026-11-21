import { test, expect } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';

test('shared response and review preserve submission recovery and independent decisions', async ({
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
      path: `output/playwright/response-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/assessments/assignments/00000000-0000-4000-8000-000000000000');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/assessments/assignments/00000000-0000-4000-8000-000000000000');
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
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  const content = {
    title: 'Shared response verification',
    questions: [
      {
        id: 'matrix',
        type: 'self_assessment',
        prompt: 'Reflect on practice.',
        matrix: {
          instructions: 'Rate current practice.',
          required: true,
          notes_enabled: true,
          areas: [{ id: crypto.randomUUID(), text: 'I verify evidence.' }],
          ratings: [
            { id: crypto.randomUUID(), text: 'Confident' },
            { id: crypto.randomUUID(), text: 'Needs practice' },
          ],
        },
      },
      {
        id: 'choice',
        type: 'multiple_choice',
        prompt: 'Choose the supported practice.',
        choices: [
          { id: 'yes', text: 'Verify evidence' },
          { id: 'no', text: 'Ignore evidence' },
        ],
      },
      { id: 'written', type: 'open_response', prompt: 'Explain the evidence.' },
    ],
    sections: [
      {
        id: first,
        title: 'Reflection',
        instructions: 'Complete the reflection before continuing.',
        question_ids: ['matrix', 'choice'],
      },
      {
        id: second,
        title: 'Evidence',
        instructions: 'Provide a worked example.',
        question_ids: ['written'],
      },
    ],
    answer_key: { choice: 'yes' },
    rubric: {
      threshold: 75,
      criteria: [
        {
          id: 'evidence',
          category: 'Practice',
          label: 'Evidence',
          guidance: 'Use submitted evidence',
          weight: 1,
        },
      ],
    },
  };
  const definition = await post('/assessments/definitions', {
    clientId: client,
    source: null,
    version: 0,
    saveToken: crypto.randomUUID(),
    content,
  });
  await post('/assessments/publish', { clientId: client, id: definition.id, version: 1 });
  const assignment = await post('/assessments/assignments', {
    clientId: client,
    definition: definition.id,
    mode: 'member',
    target: id,
    confirmed: true,
  });
  const responseUrl = '/assessments/assignments/' + assignment.id;
  const responseApi = '**/api/assessments/responses/' + assignment.id;
  await login('demo.1.3@example.invalid');
  await page.goto(responseUrl);
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Your response', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2. Evidence', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Continue to next section', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Response errors' })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
  // Simulate loss of a real committed autosave response; retry must replay the exact operation.
  const saveBodies: any[] = [];
  await page.route(responseApi, async (r) => {
    saveBodies.push(r.request().postDataJSON());
    if (saveBodies.length === 1) {
      await r.fetch();
      await r.abort('failed');
    } else await r.continue();
  });
  await page.getByRole('radio', { name: 'I verify evidence.: Confident', exact: true }).check();
  await page.getByRole('radio', { name: 'Verify evidence', exact: true }).check();
  await page
    .getByLabel('Notes for I verify evidence.', { exact: true })
    .fill('Verified through a worked example.');
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('#response-save-status')).toHaveText('All changes saved.');
  expect(saveBodies[1]).toEqual(saveBodies[0]);
  await page.unroute(responseApi);
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await screenshot('response-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('response-mobile');
  await page.getByRole('button', { name: 'Continue to next section', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Evidence', exact: true })).toBeFocused();
  const answer = page.getByRole('textbox', { name: /Evidence.*Question 3/ });
  await answer.fill('First submitted evidence with a worked example.');
  await page
    .getByLabel('Additional context (optional)', { exact: true })
    .fill('Synthetic response context.');
  await expect(page.locator('#response-save-status')).toHaveText('All changes saved.');
  await page.reload();
  await expect(answer).toHaveValue('First submitted evidence with a worked example.');
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
    await touch.goto(responseUrl);
    await expect(touch.getByRole('textbox', { name: /Evidence.*Question 3/ })).toBeVisible();
    expect(
      await touch
        .getByRole('textbox', { name: /Evidence.*Question 3/ })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await touch.getByRole('button', { name: 'Save draft', exact: true }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  // Scan-state projection is a fixture; no scanner is run.
  const filesApi = '**/api/enrolments/' + id + '/files?*';
  await page.route(filesApi, (r) =>
    r.fulfill({
      json: {
        files: [{ id: 'pending-file', name: 'pending.txt', status: 'quarantined', bytes: 10 }],
      },
    }),
  );
  await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'pending.txt - quarantined', exact: true }),
  ).toBeDisabled();
  await page.unroute(filesApi);
  await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(answer).toHaveValue('First submitted evidence with a worked example.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Submission history', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your response', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Human review', exact: true })).toHaveCount(0);
  const snapshot = await (
    await page.request.get('/api' + responseUrl + '?clientId=' + client)
  ).json();
  expect(snapshot.attempts).toHaveLength(1);
  const receipt = snapshot.attempts[0].id;
  await login('demo.1.2@example.invalid');
  await page.goto(responseUrl);
  await expect(page.getByRole('heading', { name: 'Human review', exact: true })).toBeVisible();
  await page
    .getByLabel('Private decision rationale', { exact: true })
    .fill('Private rationale for the returned attempt.');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page.getByLabel('Private decision rationale', { exact: true })).toHaveValue(
    'Private rationale for the returned attempt.',
  );
  await page.getByRole('button', { name: 'Reject and allow resubmission', exact: true }).click();
  await expect(
    page.getByText('Enter member-safe return feedback between 8 and 4,000 characters.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Member-safe return feedback', { exact: true })
    .fill('Add a specific example showing the evidence check.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reject and allow resubmission', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Changes requested', exact: true })).toBeVisible();
  await login('demo.1.3@example.invalid');
  await page.goto(responseUrl);
  await expect(
    page.getByText('Add a specific example showing the evidence check.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Private rationale for the returned attempt.', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Approved result', exact: true })).toHaveCount(0);
  // The returned draft may resume its final section; earlier immutable history remains visible.
  if (await page.getByRole('button', { name: 'Continue to next section', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Continue to next section', exact: true }).click();
  await answer.fill('Revised worked example: I compared the record with its source.');
  await expect(page.locator('#response-save-status')).toHaveText('All changes saved.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your response', exact: true })).toHaveCount(0);
  const next = await (await page.request.get('/api' + responseUrl + '?clientId=' + client)).json();
  expect(next.attempts).toHaveLength(2);
  expect(next.attempts.find((a: any) => a.id === receipt).responses.written).toBe(
    'First submitted evidence with a worked example.',
  );
  const latest = next.attempts.find((a: any) => a.id !== receipt).id;
  await login('demo.1.2@example.invalid');
  await page.goto(responseUrl);
  await page.getByLabel('Score for Evidence', { exact: true }).fill('85');
  await page
    .getByLabel('Feedback for Evidence', { exact: true })
    .fill('Your example supports this criterion.');
  await page.getByRole('checkbox', { name: latest + ':written', exact: true }).check();
  await page
    .getByLabel('Private decision rationale', { exact: true })
    .fill('Verified source evidence against this revision.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await screenshot('review-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('review-mobile');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Approve reviewed result', exact: true }).click();
  await expect(page.getByLabel('Score for Evidence', { exact: true })).toHaveValue('85');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve reviewed result', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approved result', exact: true })).toBeVisible();
  await login('demo.1.3@example.invalid');
  await page.goto(responseUrl);
  await expect(page.getByRole('heading', { name: 'Approved result', exact: true })).toBeVisible();
  await expect(
    page.getByText('Your example supports this criterion.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('Private decision rationale', { exact: true })).toHaveCount(0);
  await page
    .getByLabel('Reason for appeal', { exact: true })
    .fill('Please request an independent evidence review.');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page.getByLabel('Reason for appeal', { exact: true })).toHaveValue(
    'Please request an independent evidence review.',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Request alternate review', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Alternate review requested', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approved result', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  await login('demo.1.0@example.invalid');
  const routing = await (
    await page.request.get('/api/assessments/appeals?clientId=' + client)
  ).json();
  const appeal = routing.appeals.find((a: any) => a.assignmentId === assignment.id);
  const alternate = appeal.reviewers.find((r: any) => r.name === 'Demo Coordinator 1.1');
  await post('/assessments/appeals/' + appeal.id + '/route', {
    clientId: client,
    id: appeal.id,
    reviewer: alternate.id,
    reason: 'Assign an independent reviewer for this evidence',
    confirmed: true,
  });
  await login('demo.1.1@example.invalid');
  await page.goto(responseUrl);
  await expect(
    page.getByRole('button', { name: 'Uphold previous decision', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Private decision rationale', { exact: true })
    .fill('Independent review confirms the recorded evidence.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Uphold previous decision', exact: true }).click();
  await expect(page).toHaveURL(/\/assessments\?review=recorded$/);
  expect((await page.request.get('/api' + responseUrl + '?clientId=' + client)).status()).toBe(404);
  for (const email of ['demo.1.0@example.invalid', 'curriculum-ui@example.invalid']) {
    await login(email);
    await page.goto(responseUrl);
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Submission history', exact: true }),
    ).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

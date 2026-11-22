import { test, expect } from '@playwright/test';

import AxeBuilder from '@axe-core/playwright';

test('shared assignment form preserves pinned recipients, team rules and recovery', async ({
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
      path: `output/playwright/assignment-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/assessments/definitions/new/assign');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/assessments/definitions/new/assign');
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
  const content = {
    title: 'Shared assignment verification',
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
  const definition = await post('/assessments/definitions', {
    clientId: client,
    source: null,
    version: 0,
    saveToken: crypto.randomUUID(),
    content,
  });
  await post('/assessments/publish', { clientId: client, id: definition.id, version: 1 });
  const assignmentUrl = '/assessments/definitions/' + definition.id + '/assign';
  const optionsApi = '**/api/assessments/assignment-options?*';
  const assignApi = '**/api/assessments/assignments';
  const options = async () =>
    (
      await page.request.get(
        '/api/assessments/assignment-options?clientId=' + client + '&definition=' + definition.id,
      )
    ).json();
  await page.goto(assignmentUrl);
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Assign assessment', exact: true })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Assign assessment', exact: true });
  const confirm = page.getByRole('checkbox');
  const target = page.getByLabel('Member record', { exact: true });
  await expect(submit).toBeDisabled();
  await page.getByLabel('Search recipients', { exact: true }).fill('no matching person');
  await expect(page.getByText('0 matching recipients.', { exact: true })).toBeVisible();
  await page.getByLabel('Search recipients', { exact: true }).fill('Demo Member 1.3');
  await target.selectOption(id);
  await submit.click();
  await expect(confirm).toBeFocused();
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(target).toHaveValue(id);
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page).toHaveURL(assignmentUrl);
  await confirm.check();
  await page.route(assignApi, (r) =>
    r.fulfill({ status: 403, json: { message: 'Assignment authority changed.' } }),
  );
  await submit.click();
  await expect(page.getByText('Assignment authority changed.', { exact: true })).toBeVisible();
  await expect(confirm).toBeChecked();
  await expect(target).toHaveValue(id);
  await page.unroute(assignApi);
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(assignApi, async (r) => {
    await held;
    await r.continue();
  });
  // Keep a confirmed mutation distinct from a failed options refresh.
  await page.route(optionsApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Options temporarily unavailable.' } }),
  );
  await submit.click();
  await expect(page.getByRole('button', { name: 'Assigning…', exact: true })).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  release();
  await expect(
    page.getByText('Assessment assigned to the selected member record.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Options temporarily unavailable.', { exact: true })).toBeVisible();
  await expect(target).toHaveValue(id);
  await expect(confirm).not.toBeChecked();
  await page.unroute(assignApi);
  await page.unroute(optionsApi);
  await page.getByRole('button', { name: 'Retry assignment options', exact: true }).click();
  await expect(page.getByText('Options temporarily unavailable.', { exact: true })).toHaveCount(0);
  const assigned = await (
    await page.request.get('/api/assessments/assignments?clientId=' + client)
  ).json();
  expect(assigned.assignments).toHaveLength(1);
  const assignmentId = assigned.assignments[0].id;
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page).toHaveURL(/\/assessments$/);
  await page.goto(assignmentUrl);
  await page.getByLabel('Assign to', { exact: true }).selectOption('team');
  const teamOptions = await options();
  const team = teamOptions.teams.find((t: { id: string }) => t.id === choices.teams[0].id);
  await page.getByLabel('Team', { exact: true }).selectOption(team.id);
  await confirm.check();
  await submit.click();
  await expect(
    page.getByText('Team assignment rule is active. Existing work is preserved.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Stop future assignments', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(/1 eligible member records assigned or already assigned/),
  ).toBeVisible();
  const rule = (await options()).rules[0];
  const assignments = async () =>
    (await (await page.request.get('/api/assessments/assignments?clientId=' + client)).json())
      .assignments;
  expect((await assignments())[0].id).toBe(assignmentId);
  // A real competing change produces a stale version; retry fetches it without resetting form selection.
  await post('/assessments/team-rules', {
    clientId: client,
    id: rule.id,
    version: rule.version,
    action: 'stop',
  });
  await page.getByRole('button', { name: 'Stop future assignments', exact: true }).click();
  await expect(
    page.getByText('This rule changed. Reload before updating it.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry assignment options', exact: true }).click();
  await expect(page.getByLabel('Team', { exact: true })).toHaveValue(team.id);
  await page.getByRole('button', { name: 'Resume future assignments', exact: true }).click();
  await expect(page.getByText('Future assignments resumed.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry processing', exact: true }).click();
  await expect(page.getByText('Assignment processing checked.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop future assignments', exact: true }).click();
  await expect(
    page.getByText('Future assignments stopped. Existing assignments are preserved.', {
      exact: true,
    }),
  ).toBeVisible();
  expect((await assignments())[0].id).toBe(assignmentId);
  expect((await assignments())[0].revision).toBe(1);
  await page.getByRole('button', { name: 'Resume future assignments', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop future assignments', exact: true }),
  ).toBeEnabled();
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await screenshot('team-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('team-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await a11y();
  await page.getByLabel('Assign to', { exact: true }).selectOption('member');
  await screenshot('member-light-desktop');
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('member-dark-mobile');
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  await personal.locator('summary').click();
  await personal.getByRole('button', { name: 'Use client default', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'client-dark');
  // Empty/partial results are explicit presentation fixtures, not claimed domain eligibility changes.
  const original = await options();
  await page.route(optionsApi, (r) =>
    r.fulfill({
      json: {
        ...original,
        members: [],
        teams: [],
        rules: [{ ...original.rules[0], group_id: 'unavailable', result: null, checked_at: null }],
      },
    }),
  );
  await page.reload();
  await expect(page.getByText('0 matching recipients.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Team no longer available', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Waiting for processing.', { exact: true })).toBeVisible();
  await expect(submit).toBeDisabled();
  await a11y();
  await page.unroute(optionsApi);
  await page.route(optionsApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Assignment options unavailable.' } }),
  );
  await page.reload();
  await expect(page.getByText('Assignment options unavailable.', { exact: true })).toBeVisible();
  await page.unroute(optionsApi);
  await page.getByRole('button', { name: 'Retry assignment options', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(target).toBeVisible();
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
    await touch.goto(assignmentUrl);
    await expect(touch.getByLabel('Member record', { exact: true })).toBeVisible();
    expect(
      await touch
        .getByLabel('Search recipients', { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await touch.getByRole('button', { name: 'Assign assessment', exact: true }).boundingBox())!
        .height,
    ).toBeGreaterThanOrEqual(44);
    await touch.getByRole('checkbox').focus();
    await touch.keyboard.press('Space');
    await expect(touch.getByRole('checkbox')).toBeChecked();
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  for (const email of [
    'demo.1.3@example.invalid',
    'demo.1.0@example.invalid',
    'curriculum-ui@example.invalid',
  ]) {
    await login(email);
    await page.goto(assignmentUrl);
    await expect(
      page.getByRole('button', { name: 'Retry assignment options', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Member record', { exact: true })).toHaveCount(0);
    expect(
      (
        await page.request.get(
          '/api/assessments/assignment-options?clientId=' + client + '&definition=' + definition.id,
        )
      ).status(),
    ).toBe(403);
  }
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared curriculum preserves versioned edits, complete review, approval and generation safeguards', async ({
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
    await page.screenshot({ path: `output/playwright/curriculum-ui/${name}.png`, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/plan');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/plan');
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
    title: 'Curriculum UI verification',
    reason: 'Isolated curriculum UI fixture',
  });
  const id = created.id,
    url = `/enrolments/${id}/plan`,
    getApi = `**/api/enrolments/${id}/plan?*`,
    genApi = `**/api/enrolments/${id}/plan/generation`;
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
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(getApi, async (r) => {
    await held;
    await r.continue();
  });
  await page.goto(url);
  await expect(page.getByText('Loading curriculum…', { exact: true })).toBeVisible();
  release();
  await expect(page.getByLabel('Learning objective', { exact: true })).toBeVisible();
  await page.unroute(getApi);
  await page.route(getApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic curriculum outage.' } }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry curriculum', exact: true })).toBeVisible();
  await page.unroute(getApi);
  await page.getByRole('button', { name: 'Retry curriculum', exact: true }).click();
  await expect(page.getByLabel('Learning objective', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await page
    .getByRole('button', { name: 'Validate all blocks and request review', exact: true })
    .click();
  await expect(page.locator('p[role=alert]')).toContainText('usable content');
  const generation = page
    .locator('details')
    .filter({ has: page.getByText('Generate or revise with AI', { exact: true }) });
  await generation.locator('summary').click();
  await expect(generation.getByText('No generation requests yet.', { exact: false })).toBeVisible();
  await page
    .getByLabel('Revision notes (optional)', { exact: true })
    .fill('Retain generation notes across block edits');
  const blocks = page.getByRole('navigation', { name: 'Learning blocks' });
  for (let i = 0; i < 4; i++) {
    if (i) await blocks.getByRole('button').nth(i).click();
    for (const [label, value] of Object.entries({
      'Learning objective': 'Apply safe practice for block ' + (i + 1),
      'Prerequisites and sequence': 'Complete induction',
      'Criterion one and evidence expectations': 'Safe method',
      'Criterion two and evidence expectations': 'Evidence quality',
      'Lesson title': 'Safe practice lesson',
      'Explanation and learning content': 'Read the reviewed method.',
      'Worked example or approved demonstration': 'Observe a worked example.',
      'Practical activity and deliverable': 'Demonstrate the method.',
      'Permitted tools': 'Use the reviewed handbook.',
      'Completion criteria and evidence required': 'Record an observed demonstration.',
      'Reading minutes': '5',
      'Practice minutes': '15',
      'Assessment minutes': '5',
      'Revision minutes': '5',
    }))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page
      .getByLabel('Reason for this version', { exact: true })
      .fill('Complete reviewed block ' + (i + 1));
    if (i === 0) {
      page.once('dialog', (d) => d.dismiss());
      await blocks.getByRole('button').nth(1).click();
      await expect(page.getByLabel('Learning objective', { exact: true })).toHaveValue(
        'Apply safe practice for block 1',
      );
      page.once('dialog', (d) => d.dismiss());
      await page.getByRole('button', { name: 'Switch client', exact: true }).click();
      await page.route(`**/api/enrolments/${id}/plan/edit`, (r) =>
        r.fulfill({ status: 409, json: { message: 'Synthetic version conflict.' } }),
      );
      await page.getByRole('button', { name: 'Save new draft version', exact: true }).click();
      await expect(page.locator('p[role=alert]')).toContainText('Your block input is retained.');
      await expect(page.getByLabel('Lesson title', { exact: true })).toHaveValue(
        'Safe practice lesson',
      );
      await page.unroute(`**/api/enrolments/${id}/plan/edit`);
      await a11y();
    }
    await page.getByRole('button', { name: 'Save new draft version', exact: true }).click();
    await expect(
      page.getByText('New draft version saved. Review must be requested again.', { exact: true }),
    ).toBeVisible();
    if (i === 0) await screenshot('editor-desktop');
  }
  await expect(page.getByLabel('Revision notes (optional)', { exact: true })).toHaveValue(
    'Retain generation notes across block edits',
  );
  await page.getByLabel('Revision notes (optional)', { exact: true }).fill('');
  await page
    .getByRole('button', { name: 'Validate all blocks and request review', exact: true })
    .click();
  await expect(
    page.getByText('All blocks validated. This exact version is awaiting coordinator approval.', {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel('Approval rationale', { exact: true })
    .fill('All blocks and shared capacity reviewed');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Approval rationale', { exact: true })).toHaveValue(
    'All blocks and shared capacity reviewed',
  );
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Approve exact version 5', exact: true }).click();
  await expect(page.getByLabel('Approval rationale', { exact: true })).toHaveValue(
    'All blocks and shared capacity reviewed',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve exact version 5', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approval receipt', exact: true })).toBeVisible();
  await expect(
    page.getByText('Exact plan version approved. Enrolment is ready; training has not started.', {
      exact: true,
    }),
  ).toBeVisible();
  const approved = await (
    await page.request.get(`/api/enrolments/${id}/plan?clientId=${client}&version=5`)
  ).json();
  expect(approved.approval.content_hash).toMatch(/^[a-f0-9]{64}$/);
  // Editing an approved baseline creates a new draft while preserving its immutable receipt.
  await page
    .getByLabel('Learning objective', { exact: true })
    .fill('Refined safe practice objective');
  await page
    .getByLabel('Reason for this version', { exact: true })
    .fill('Clarify the block without replacing approved history');
  await page.getByRole('button', { name: 'Save new draft version', exact: true }).click();
  await expect(page.getByText('Curriculum · Version 6', { exact: true })).toBeVisible();
  await page.getByText('Compare this block with previous version', { exact: true }).click();
  await expect(page.getByText('Refined safe practice objective', { exact: true })).toBeVisible();
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('comparison-mobile');
  await page.getByText('Version history', { exact: true }).click();
  await page.getByRole('button', { name: 'Version 5 · approved', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approval receipt', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save new draft version', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Learning objective', { exact: true })).toBeDisabled();
  await a11y();
  await screenshot('approved-mobile');
  await page.getByRole('button', { name: 'Version 6 · draft', exact: true }).click();
  await generation.locator('summary').click();
  await page
    .getByLabel('Revision notes (optional)', { exact: true })
    .fill('Retain failed generation notes');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Queue curriculum generation', exact: true }).click();
  await expect(page.getByLabel('Revision notes (optional)', { exact: true })).toHaveValue(
    'Retain failed generation notes',
  );
  let finish!: () => void;
  const wait = new Promise<void>((r) => {
    finish = r;
  });
  const keys: string[] = [];
  await page.route(genApi, async (r) => {
    keys.push(r.request().postDataJSON().key);
    await wait;
    await r.fulfill({ status: 503, json: { message: 'Synthetic generation outage.' } });
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Queue curriculum generation', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Queuing curriculum generation…', exact: true }),
  ).toBeDisabled();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  finish();
  await expect(generation.locator('p[role=alert]')).toContainText(
    'Retry uses the same request key',
  );
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Queue curriculum generation', exact: true }).click();
  await expect(generation.locator('p[role=alert]')).toContainText(
    'Retry uses the same request key',
  );
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[1]).toBe(keys[0]);
  await page.unroute(genApi);
  await page.getByLabel('Revision notes (optional)', { exact: true }).fill('');
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
  await page.reload();
  await expect(page.getByLabel('Learning objective', { exact: true })).toBeVisible();
  await generation.locator('summary').click();
  const listApi = genApi + '?*';
  await page.route(listApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic generation list outage.' } }),
  );
  const refresh = generation.getByRole('button', {
    name: 'Refresh generation requests',
    exact: true,
  });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(generation.locator('p[role=alert]')).toContainText(
    'Refresh generation details to retry.',
  );
  await page.unroute(listApi);
  for (const status of ['queued', 'ambiguous']) {
    await page.route(listApi, (r) =>
      r.fulfill({
        json: {
          enrolment: { id, title: 'Curriculum UI verification' },
          runs: [{ id: 'fixture-run', status, baseVersion: 6, createdAt: '2026-01-01T00:00:00Z' }],
        },
      }),
    );
    await refresh.click();
    await expect(
      generation.getByRole('link', { name: new RegExp('Version 6 request.*' + status) }),
    ).toHaveAttribute('href', `/enrolments/${id}/generation/fixture-run`);
    await expect(
      generation.getByRole('button', { name: 'Queue curriculum generation', exact: true }),
    ).toBeDisabled();
    await a11y();
    await page.unroute(listApi);
  }
  await refresh.click();
  await expect(
    generation.getByRole('button', { name: 'Queue curriculum generation', exact: true }),
  ).toBeEnabled();
  const preserved = await (
    await page.request.get(`/api/enrolments/${id}/plan?clientId=${client}&version=5`)
  ).json();
  expect(preserved.approval.content_hash).toBe(approved.approval.content_hash);
  expect((await page.request.get(`/api/enrolments/${id}/plan?clientId=${other}`)).status()).toBe(
    403,
  );
  await login('demo.1.3@example.invalid');
  await page.goto(url + '?version=5');
  await expect(page.getByLabel('Learning objective', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Save new draft version', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Generate or revise with AI', { exact: true })).toHaveCount(0);
  await a11y();
  await login('demo.1.0@example.invalid');
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Retry curriculum', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

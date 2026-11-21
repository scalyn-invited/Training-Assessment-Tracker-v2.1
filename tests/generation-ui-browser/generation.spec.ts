import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared generation progress preserves polling, provenance, recovery and role restrictions', async ({
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
    await page.screenshot({ path: `output/playwright/generation-ui/${name}.png`, fullPage: true });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/generation/00000000-0000-4000-8000-000000000002',
  );
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto(
    '/enrolments/00000000-0000-4000-8000-000000000001/generation/00000000-0000-4000-8000-000000000002',
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
    title: 'Curriculum UI verification',
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
    feedback: 'Review safe practice examples',
    key: crypto.randomUUID(),
  });
  const progressUrl = `/enrolments/${id}/generation/${queued.id}`;
  const detailApi = `**/api/enrolments/${id}/plan/generation/${queued.id}?*`;
  const detailPath = `/api/enrolments/${id}/plan/generation/${queued.id}?clientId=${client}`;
  await page.goto(progressUrl);
  await expect(
    page.getByRole('heading', { name: 'Generation progress', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Review generated draft/ })).toBeVisible({
    timeout: 60000,
  });
  const actual = await (await page.request.get(detailPath)).json();
  expect(actual.runs[0].status).toBe('complete');
  expect(
    actual.runs[0].configuration.providers.every((p: { synthetic: boolean }) => p.synthetic),
  ).toBe(true);
  const resultVersion = actual.runs[0].resultVersion;
  await expect(page.getByRole('link', { name: /Review generated draft/ })).toHaveAttribute(
    'href',
    `/enrolments/${id}/plan?version=${resultVersion}`,
  );
  await page.getByRole('link', { name: /Review generated draft/ }).click();
  await expect(
    page.getByText(`Curriculum · Version ${resultVersion}`, { exact: true }),
  ).toBeVisible();
  const baseline = await (
    await page.request.get(`/api/enrolments/${id}/plan?clientId=${client}&version=${resultVersion}`)
  ).json();
  expect(baseline.plan.state).toBe('draft');
  expect(baseline.approval).toBeFalsy();
  await page.goto(progressUrl);
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: /^Theme / }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await a11y();
  await screenshot('complete-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('complete-mobile');
  let release!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(detailApi, async (r) => {
    await held;
    await r.fulfill({ json: actual });
  });
  await page.reload();
  await expect(page.getByText('Loading generation details…', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refreshing generation details…', exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole('heading', { name: 'Generation progress', exact: true }),
  ).toBeVisible();
  await page.unroute(detailApi);
  await page.route(detailApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Synthetic progress outage.' } }),
  );
  const refresh = page.getByRole('button', { name: 'Refresh full details', exact: true });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('p[role=alert]')).toContainText('Refresh generation details to retry.');
  await expect(
    page.getByRole('heading', { name: 'Configuration and provenance', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('p[role=alert]')).toContainText('Synthetic progress outage.');
  await expect(page.getByRole('heading', { name: 'Generation progress', exact: true })).toHaveCount(
    0,
  );
  await page.unroute(detailApi);
  await refresh.click();
  await expect(
    page.getByRole('heading', { name: 'Generation progress', exact: true }),
  ).toBeVisible();
  let fixture = structuredClone(actual);
  let reads = 0;
  await page.route(detailApi, (r) => {
    reads++;
    return r.fulfill({ json: fixture });
  });
  fixture.runs = [];
  await refresh.click();
  await expect(page.getByText(/This request is unavailable/)).toBeVisible();
  for (const status of ['queued', 'running', 'ambiguous', 'failed', 'complete']) {
    fixture = structuredClone(actual);
    Object.assign(fixture.runs[0], {
      status,
      message: `Fixture ${status} progress`,
      resultVersion: status === 'complete' ? resultVersion : null,
    });
    if (status !== 'complete') {
      fixture.runs[0].reserved = status === 'failed' ? 0 : 288000;
      fixture.runs[0].spent = status === 'running' ? 200 : 0;
      fixture.runs[0].attempts =
        status === 'queued'
          ? []
          : [
              {
                ...actual.runs[0].attempts[0],
                status: status === 'running' ? 'validated' : status,
                input_tokens: status === 'running' ? '100' : null,
                output_tokens: status === 'running' ? '100' : null,
              },
            ];
      fixture.runs[0].blocks.forEach(
        (b: { status: string; calls: number; repairs: number }, i: number) => {
          b.status =
            i === 0 && status !== 'queued'
              ? status === 'running'
                ? 'complete'
                : status
              : 'queued';
          b.calls = i === 0 && status !== 'queued' ? 1 : 0;
          b.repairs = 0;
        },
      );
    }
    await refresh.click();
    await expect(page.getByText(`Fixture ${status} progress`, { exact: true })).toBeVisible();
    if (status === 'queued' || status === 'running') {
      const before = reads;
      await expect.poll(() => reads, { timeout: 6000 }).toBeGreaterThan(before);
    }
    if (status === 'queued')
      await expect(page.getByText('No provider attempts yet.', { exact: true })).toBeVisible();
    if (status === 'ambiguous') {
      await expect(page.getByText(/Automatic retry is stopped/)).toBeVisible();
      await screenshot('ambiguous-mobile');
    }
    if (status === 'failed')
      await expect(page.getByText(/The generated content was not applied/)).toBeVisible();
    await a11y();
  }
  const completedReads = reads;
  await page.waitForTimeout(3500);
  expect(reads).toBe(completedReads);
  fixture.runs[0].baseVersion = null;
  fixture.runs[0].feedback = '';
  fixture.runs[0].configuration.providers.push({
    ...fixture.runs[0].configuration.providers[0],
    id: 'fallback',
    model: 'long-model-'.repeat(30),
  });
  fixture.runs[0].attempts[0].external_id = 'request-'.repeat(80);
  fixture.runs[0].attempts[0].input_tokens = null;
  await refresh.click();
  await expect(page.getByText(/Removed under retention policy/)).toBeVisible();
  await expect(page.getByText(/permitted fallback/)).toBeVisible();
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
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
  await page.unroute(detailApi);
  expect((await page.request.get(detailPath.replace(client, other))).status()).toBe(403);
  for (const email of ['demo.1.3@example.invalid', 'demo.1.0@example.invalid']) {
    await login(email);
    await page.goto(progressUrl);
    await expect(page.locator('p[role=alert]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Generation progress', exact: true }),
    ).toHaveCount(0);
    expect((await page.request.get(detailPath)).status()).toBe(
      email === 'demo.1.3@example.invalid' ? 403 : 404,
    );
  }
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await post('/clients/select', { clientId: client });
  await page.goto(progressUrl);
  await expect(page.locator('p[role=alert]')).toBeVisible();
  expect((await page.request.get(detailPath)).status()).toBe(404);
  const logout = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/logout') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await logout).ok()).toBe(true);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/auth/context')).json()).user).toBeNull();
  await page.goto(progressUrl);
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

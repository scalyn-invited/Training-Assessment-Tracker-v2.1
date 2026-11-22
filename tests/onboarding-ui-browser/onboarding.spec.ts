import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('shared onboarding preserves autosave, guards, roles, confirmations and curriculum creation', async ({
  page,
  browser,
}) => {
  test.setTimeout(240000);
  const origin = 'http://127.0.0.1:3110',
    password = 'Isolated onboarding administrator',
    demo = 'Isolated onboarding demonstration';
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
    await page.screenshot({ path: `output/playwright/onboarding-ui/${name}.png`, fullPage: true });
  }
  async function saved() {
    await expect(
      page.getByText('Draft saved. This is not an approval.', { exact: true }),
    ).toBeVisible();
  }
  async function fields(values: Record<string, string>) {
    for (const [label, value] of Object.entries(values))
      await page.getByLabel(label, { exact: true }).fill(value);
    await saved();
  }
  async function step(n: number) {
    await page
      .getByRole('navigation', { name: 'Onboarding steps' })
      .getByRole('button', { name: new RegExp('^' + n + '\\. ') })
      .click();
  }
  await post('/auth/setup', {
    name: 'Onboarding reviewer',
    email: 'onboarding-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/onboarding');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'onboarding-ui@example.invalid', password });
  await page.goto('/enrolments/00000000-0000-4000-8000-000000000001/onboarding');
  await expect(page).toHaveURL(/\/clients$/);
  const clients = await (await page.request.get('/api/clients')).json();
  const client = clients.find((c: { name: string }) => c.name === 'Demo Client 1').id;
  const other = clients.find((c: { name: string }) => c.name === 'Demo Client 2').id;
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
    title: 'Onboarding UI verification',
    reason: 'Isolated onboarding UI fixture',
  });
  const id = created.id,
    url = `/enrolments/${id}/onboarding`,
    getApi = `**/api/enrolments/${id}/onboarding?*`,
    saveApi = `**/api/enrolments/${id}/onboarding`;
  await page.goto(url);
  await expect(page.getByRole('button', { name: 'Retry onboarding', exact: true })).toBeVisible();
  expect(
    (await page.request.get(`/api/enrolments/${id}/onboarding?clientId=${client}`)).status(),
  ).toBe(404);
  const brand = await (await page.request.get('/api/branding?clientId=' + client)).json();
  await post('/branding', {
    clientId: client,
    version: brand.version,
    displayName: 'Onboarding fixture',
    appName: brand.appName,
    accent: '#7255a4',
    mode: 'white-label',
    theme: 'client-dark',
    reason: 'Onboarding theme verification',
  });
  async function login(email: string) {
    await post('/auth/login', { email, password: demo });
    await post('/clients/select', { clientId: client });
    await page.goto(url);
  }
  await login('demo.1.2@example.invalid');
  await expect(page.getByRole('button', { name: 'Retry onboarding', exact: true })).toBeVisible();
  await login('demo.1.3@example.invalid');
  await expect(page.getByLabel('Current role', { exact: true })).toBeVisible();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(getApi, async (route) => {
    await held;
    await route.continue();
  });
  await page.reload();
  await expect(page.getByText('Loading onboarding inputs…', { exact: true })).toBeVisible();
  release();
  await expect(page.getByLabel('Current role', { exact: true })).toBeVisible();
  await page.unroute(getApi);
  await page.route(getApi, (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic onboarding outage.' } }),
  );
  await page.reload();
  await expect(page.getByText('Synthetic onboarding outage.', { exact: true })).toBeVisible();
  await page.unroute(getApi);
  await page.getByRole('button', { name: 'Retry onboarding', exact: true }).click();
  await expect(page.getByLabel('Current role', { exact: true })).toBeVisible();
  await fields({ 'Current role': 'Member draft' });
  await step(2);
  await expect(page.getByLabel('Target role or skill', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
  await step(3);
  await expect(
    page.getByRole('button', { name: 'Confirm assessment findings', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Private assessment documents', exact: true }),
  ).toHaveCount(0);
  // Failed autosave retains input and blocks step changes; all shell exits consult the draft guard.
  await step(1);
  await page.route(saveApi, (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic save outage.' } }),
  );
  await page.getByLabel('Current role', { exact: true }).fill('Retained failed draft');
  await expect(page.getByText('Synthetic save outage.', { exact: true })).toBeVisible();
  await step(2);
  await expect(page.getByLabel('Current role', { exact: true })).toHaveValue(
    'Retained failed draft',
  );
  let dialogs = 0,
    contextMutations = 0;
  const cancel = async (d: import('@playwright/test').Dialog) => {
    dialogs++;
    await d.dismiss();
  };
  page.on('dialog', cancel);
  const count = (r: import('@playwright/test').Request) => {
    if (r.method() === 'POST' && /\/api\/(clients\/select|auth\/logout)$/.test(r.url()))
      contextMutations++;
  };
  page.on('request', count);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await page.getByRole('link', { name: '← Training records', exact: true }).click();
  expect(dialogs).toBe(3);
  expect(contextMutations).toBe(0);
  await expect(page).toHaveURL(new RegExp(`/enrolments/${id}/onboarding`));
  page.off('dialog', cancel);
  page.off('request', count);
  await page.unroute(saveApi);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await saved();
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
    reason: 'Isolated onboarding sensitive access',
  });
  await login('demo.1.2@example.invalid');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel('Current role', { exact: true })).toBeEnabled();
  await expect(page.locator('[data-application-shell="learning"]')).toBeVisible();
  await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await fields({
    'Current role': 'Operator',
    Responsibilities: 'Safe practice',
    Experience: 'One year',
    'Tools available': 'Laptop and handbook',
    'Language and accessibility preferences': 'English',
  });
  await a11y();
  await screenshot('profile-desktop');
  // Keep newer edits made while the first autosave request is in flight.
  let resume!: () => void;
  const paused = new Promise<void>((r) => {
    resume = r;
  });
  let first = true;
  await page.route(saveApi, async (route) => {
    if (first) {
      first = false;
      await paused;
    }
    await route.continue();
  });
  await page.getByLabel('Experience', { exact: true }).fill('Two years');
  await expect(page.getByText('Saving draft…', { exact: true })).toBeVisible();
  await page.getByLabel('Responsibilities', { exact: true }).fill('Safe independent practice');
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  resume();
  await saved();
  await page.unroute(saveApi);
  await page.reload();
  await expect(page.getByLabel('Responsibilities', { exact: true })).toHaveValue(
    'Safe independent practice',
  );
  await step(2);
  await expect(
    page.getByRole('heading', { name: 'Desired capability', exact: true }),
  ).toBeFocused();
  await fields({
    'Target role or skill': 'Supervisor',
    'Business purpose': 'Safe independent practice',
    'Expected proficiency': 'Independent',
    'Practical examples of success': 'Complete tasks safely',
    'Prerequisite skills': 'Induction',
    'Target competencies (one per line)': 'Safe practice',
  });
  await step(3);
  await fields({
    'Source or assessment reference': 'Observed source',
    'Provider or observer': 'Synthetic coordinator',
    'Assessment date': '2026-01-01',
    'Scoring scale (or not scored)': 'Not scored',
    'Findings to confirm': 'Reviewed safe practice',
  });
  await page.getByLabel('Evidence type', { exact: true }).selectOption('observed evidence');
  await saved();
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Confirm assessment findings', exact: true }).click();
  await expect(page.getByText('Assessment confirmation pending.', { exact: true })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm assessment findings', exact: true }).click();
  await expect(page.getByText('Assessment findings confirmed.', { exact: true })).toBeVisible();
  await page.getByLabel('Findings to confirm', { exact: true }).fill('Revised safe practice');
  await saved();
  await expect(page.getByText('Assessment confirmation pending.', { exact: true })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm assessment findings', exact: true }).click();
  await expect(page.getByText('Assessment findings confirmed.', { exact: true })).toBeVisible();
  const files = page.getByRole('region', { name: 'Private assessment documents', exact: true });
  await expect(
    files.getByText('No assessment documents uploaded.', { exact: false }),
  ).toBeVisible();
  await files.getByLabel('Upload private assessment', { exact: true }).setInputFiles({
    name: 'onboarding.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic onboarding assessment.'),
  });
  await page.route(`**/api/enrolments/${id}/files`, (route) =>
    route.fulfill({ status: 503, json: { message: 'Synthetic assessment upload outage.' } }),
  );
  await files.getByRole('button', { name: 'Upload assessment', exact: true }).click();
  await expect(files.getByRole('alert')).toContainText('Refresh the list before uploading again.');
  expect(
    await files
      .getByLabel('Upload private assessment', { exact: true })
      .evaluate((e: HTMLInputElement) => e.files?.[0].name),
  ).toBe('onboarding.txt');
  await page.unroute(`**/api/enrolments/${id}/files`);
  await files.getByRole('button', { name: 'Refresh assessment files', exact: true }).click();
  await files.getByRole('button', { name: 'Upload assessment', exact: true }).click();
  await expect(
    files.getByText('Assessment uploaded to quarantine.', { exact: false }),
  ).toBeVisible();
  await expect(
    files.getByRole('link', { name: 'Review onboarding.txt', exact: true }),
  ).toHaveAttribute('href', new RegExp(`/enrolments/${id}/documents/`));
  await expect(files).toContainText('quarantined');
  await a11y();
  await screenshot('assessment-desktop');
  await step(4);
  await fields({ 'Start date': '2090-01-02', 'Shared daily capacity (all plans)': '60' });
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('schedule-mobile');
  await step(5);
  for (let i = 1; i <= 3; i++) {
    const group = page.getByRole('group', { name: 'KPI ' + i, exact: true });
    for (const [label, value] of Object.entries({
      Name: 'Measure ' + i,
      'Baseline (or unknown)': 'unknown',
      Target: '90',
      Unit: 'percent',
      'Why this matters': 'Safety',
      'Evidence method': 'Observed demonstration',
      'Review cadence': 'Weekly',
    }))
      await group.getByLabel(label, { exact: true }).fill(value);
  }
  await saved();
  await a11y();
  await screenshot('measures-mobile');
  await step(6);
  await fields({
    'Approved resource title': 'Reviewed handbook',
    'Resource URL or internal reference': 'Internal handbook',
    'Licence or permission to use': 'Internal use',
    'Cost and budget approval': 'No cost',
    'Member access and required software checked': 'Access confirmed',
    'Suitable practical tasks': 'Safe practice',
  });
  await step(7);
  const calendarReason = page.getByLabel('Reason for confirming or changing the shared calendar', {
    exact: true,
  });
  await calendarReason.fill('Confirm shared calendar for UI verification');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Confirm shared calendar', exact: true }).click();
  await expect(calendarReason).toHaveValue('Confirm shared calendar for UI verification');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm shared calendar', exact: true }).click();
  await expect(
    page.getByText('Shared capacity calendar confirmed.', { exact: true }),
  ).toBeVisible();
  await expect(calendarReason).toHaveValue('');
  await page
    .getByText('Profile and role · saved, review completeness below', { exact: true })
    .click();
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await a11y();
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('review-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot('review-desktop');
  const draftReason = page.getByLabel('Draft creation or rescheduling reason', { exact: true });
  await draftReason.fill('Retained curriculum creation reason');
  page.once('dialog', (d) => d.dismiss());
  await step(1);
  await expect(draftReason).toHaveValue('Retained curriculum creation reason');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  await expect(draftReason).toHaveValue('Retained curriculum creation reason');
  await page.route(`**/api/enrolments/${id}/plan/create`, (r) =>
    r.fulfill({
      status: 409,
      json: { message: 'Synthetic curriculum conflict. Review current inputs.' },
    }),
  );
  await page.getByRole('button', { name: 'Create curriculum draft', exact: true }).click();
  await expect(
    page.getByText('Synthetic curriculum conflict. Review current inputs.', { exact: true }),
  ).toBeVisible();
  await expect(draftReason).toHaveValue('Retained curriculum creation reason');
  await page.unroute(`**/api/enrolments/${id}/plan/create`);
  await draftReason.fill('');
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
  expect(
    (await page.request.get(`/api/enrolments/${id}/onboarding?clientId=${other}`)).status(),
  ).toBe(403);
  // A real stale tab keeps its input; it cannot silently overwrite a newer saved revision.
  await step(1);
  const stale = await page.context().newPage();
  await stale.goto(origin + url + '?step=profile');
  await expect(stale.getByLabel('Current role', { exact: true })).toHaveValue('Operator');
  await fields({ 'Current role': 'Fresh operator' });
  await stale.getByLabel('Current role', { exact: true }).fill('Retained stale role');
  await expect(stale.locator('p[role=alert]')).toContainText('changed in another window');
  await expect(stale.getByLabel('Current role', { exact: true })).toHaveValue(
    'Retained stale role',
  );
  await stale.close();
  await step(7);
  await draftReason.fill('Create validated local curriculum draft');
  await page.getByRole('button', { name: 'Create curriculum draft', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/enrolments/${id}/plan\\?version=1`));
  await expect(page.getByText('Curriculum · Version 1', { exact: true })).toBeVisible();
  // Display fixture for active-record lock, long names and touch targets; no activation is fabricated in the database.
  const actual = await (
    await page.request.get(`/api/enrolments/${id}/onboarding?clientId=${client}`)
  ).json();
  const mobile = await browser.newContext({
    baseURL: origin,
    viewport: { width: 390, height: 900 },
    isMobile: true,
    hasTouch: true,
    storageState: await page.context().storageState(),
  });
  const locked = await mobile.newPage();
  try {
    await locked.route(getApi, (route) =>
      route.fulfill({
        json: {
          ...actual,
          enrolment: {
            ...actual.enrolment,
            status: 'active',
            title: 'LongOnboardingTitle'.repeat(12),
            memberName: 'Long member name '.repeat(8),
          },
        },
      }),
    );
    await locked.goto(url + '?step=schedule');
    await expect(
      locked.getByText('Active training uses the calendar-change workflow.', { exact: false }),
    ).toBeVisible();
    await expect(locked.getByLabel('Start date', { exact: true })).toBeDisabled();
    await expect(locked.getByRole('button', { name: 'Save draft', exact: true })).toHaveCount(0);
    const monday = locked
      .locator('label')
      .filter({ has: locked.getByRole('checkbox', { name: 'Monday', exact: true }) });
    expect((await monday.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const width of [390, 320]) {
      await locked.setViewportSize({ width, height: 900 });
      expect(await locked.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        (
          await new AxeBuilder({ page: locked })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await locked.screenshot({
      path: 'output/playwright/onboarding-ui/locked-mobile.png',
      fullPage: true,
    });
  } finally {
    await mobile.close();
  }
  expect(errors).toEqual([]);
});

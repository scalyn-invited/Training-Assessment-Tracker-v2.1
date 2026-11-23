import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';

test('shared builder preserves authoring, immutable publication and recovery', async ({ page }) => {
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
      path: `output/playwright/assessment-builder-ui/${name}.png`,
      fullPage: true,
    });
  }
  await post('/auth/setup', {
    name: 'Curriculum reviewer',
    email: 'curriculum-ui@example.invalid',
    password,
    demoPassword: demo,
  });
  await page.goto('/assessments/definitions/new');
  await expect(page).toHaveURL(/\/login$/);
  await post('/auth/login', { email: 'curriculum-ui@example.invalid', password });
  await page.goto('/assessments/definitions/new');
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
  const newUrl = '/assessments/definitions/new';
  const builderApi = '**/api/assessments/builder';
  await page.goto(newUrl);
  await expect(page.locator('[data-application-shell]')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'Build an assessment', exact: true }),
  ).toBeVisible();
  const step = async (name: string) => page.locator('[data-section=' + name + ']').click();
  await page.getByLabel('Assessment title', { exact: true }).fill('Shared authoring verification');
  for (const name of ['Switch client', 'Sign out']) {
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByLabel('Assessment title', { exact: true })).toHaveValue(
      'Shared authoring verification',
    );
  }
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page).toHaveURL(/\/definitions\/new$/);
  await step('review');
  await expect(
    page.getByRole('button', { name: 'Publish assessment', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('#readiness-list')).toContainText('add a title');
  await step('questions');
  await page
    .getByLabel('Section title (required for publication)', { exact: true })
    .fill('Practice');
  await page
    .getByLabel('Learner instructions (optional)', { exact: true })
    .fill('Review the evidence before answering.');
  await page.getByLabel('Question type', { exact: true }).selectOption('multiple_choice');
  await page.getByTestId('prompt-editor').fill('Choose the supported practice.');
  await page.getByLabel('Choice 1', { exact: true }).fill('Verify the evidence');
  await page.getByLabel('Choice 2', { exact: true }).fill('Skip the evidence');
  await page.getByRole('radio', { name: 'Correct answer: choice 1', exact: true }).check();
  await page.getByRole('button', { name: 'Duplicate question', exact: true }).click();
  await page.getByRole('button', { name: 'Remove question', exact: true }).click();
  await page.getByRole('button', { name: 'Undo removal', exact: true }).click();
  await page.getByRole('button', { name: 'Remove question', exact: true }).click();
  await page.locator('#add-question').click();
  await page.getByLabel('Question type', { exact: true }).selectOption('self_assessment');
  await page.getByTestId('prompt-editor').fill('Reflect on current practice.');
  await page.getByLabel('Assessment area 1', { exact: true }).fill('I verify the evidence.');
  await page.getByLabel('Require a rating for every area', { exact: true }).check();
  await page.getByLabel('Include optional Notes column', { exact: true }).check();
  await page.getByRole('button', { name: 'Remove rating 4', exact: true }).click();
  await page.getByRole('button', { name: 'Undo matrix removal', exact: true }).click();
  await expect(page.getByLabel('Rating heading 4', { exact: true })).toHaveValue(
    'Not at all confident',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await a11y();
  await screenshot('matrix-author-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await a11y();
  await screenshot('matrix-author-mobile');
  await page.locator('#add-question').click();
  await page.getByTestId('prompt-editor').fill('Explain the evidence for your choice.');
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page
    .getByLabel('Section title (required for publication)', { exact: true })
    .fill('Evidence');
  await page
    .getByRole('navigation', { name: 'Question sections', exact: true })
    .getByRole('button', { name: /Practice/ })
    .click();
  await page
    .getByRole('complementary', { name: 'Question list', exact: true })
    .getByRole('button', { name: /Explain the evidence/ })
    .click();
  await page
    .getByLabel('Move question to section', { exact: true })
    .selectOption({ label: 'Evidence' });
  await page.getByRole('button', { name: 'Move question', exact: true }).click();
  await page.getByRole('button', { name: 'Move section up', exact: true }).click();
  await page.getByRole('button', { name: 'Move section down', exact: true }).click();
  await step('rubric');
  await page.getByRole('button', { name: 'Add criterion', exact: true }).click();
  await page.getByLabel('Category', { exact: true }).fill('Practice');
  await page.getByLabel('Criterion', { exact: true }).fill('Evidence quality');
  await page
    .getByLabel('Scoring guidance', { exact: true })
    .fill('Use the submitted evidence to support the rating.');
  await page.getByRole('button', { name: 'Distribute equally', exact: true }).click();
  await expect(page.getByLabel('Weight (%)', { exact: true })).toHaveValue('100');
  await step('details');
  await page.locator('#assessment-threshold').fill('75');
  // A failed save must preserve all editor state; a later successful save stays exact.
  await page.route(builderApi, (r) =>
    r.fulfill({
      status: 422,
      json: {
        message: 'Fixture validation failure',
        errors: { title: 'Review the assessment title.' },
      },
    }),
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('Save failed. Your content is preserved.');
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveValue(
    'Shared authoring verification',
  );
  await page.unroute(builderApi);
  let releaseSave!: () => void;
  const heldSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(builderApi, async (r) => {
    await heldSave;
    await r.continue();
  });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  page.once('dialog', (d) => {
    expect(d.type()).toBe('alert');
    return d.accept();
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  releaseSave();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  await page.unroute(builderApi);
  const savedUrl = page.url(),
    savedId = savedUrl.split('/').pop()!;
  const read = async (definition = savedId) =>
    (
      await page.request.get(
        '/api/assessments/definitions?clientId=' + client + '&id=' + definition,
      )
    ).json();
  const snapshot = await read();
  expect(snapshot.questions).toHaveLength(3);
  expect(snapshot.sections).toHaveLength(2);
  await page.reload();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  await step('review');
  await expect(page.getByRole('button', { name: 'Publish assessment', exact: true })).toBeEnabled();
  await expect(page.locator('#learner-preview')).toContainText(
    'Content only: save, submission, permissions and file scanning are not simulated.',
  );
  await expect(page.locator('#learner-preview').getByRole('radiogroup')).toHaveCount(1);
  expect(
    await page
      .locator('#learner-preview .matrix-choice')
      .first()
      .evaluate((e) => getComputedStyle(e).display),
  ).toBe('flex');
  await expect(page.locator('#learner-preview')).not.toContainText('Correct answer');
  await expect(page.locator('#learner-preview')).not.toContainText(
    'Use the submitted evidence to support the rating.',
  );
  for (const width of [320, 390, 800, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await a11y();
  }
  await screenshot('review-desktop');
  await page.setViewportSize({ width: 390, height: 900 });
  await screenshot('review-mobile');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Publish assessment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish assessment', exact: true })).toBeEnabled();
  // The real server commits publication; its response is deliberately lost. Existing readback must reconcile it.
  await page.route(builderApi, async (r) => {
    const response = await r.fetch();
    expect(response.ok()).toBe(true);
    await r.abort('failed');
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Publish assessment', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText(
    'Publication confirmed for this exact definition.',
  );
  await page.unroute(builderApi);
  await expect(page.getByRole('link', { name: 'Assign assessment', exact: true })).toHaveAttribute(
    'href',
    '/assessments/definitions/' + savedId + '/assign',
  );
  const published = await read();
  expect(published.status).toBe('published');
  const assignment = await post('/assessments/assignments', {
    clientId: client,
    definition: savedId,
    mode: 'member',
    target: id,
    confirmed: true,
  });
  await step('details');
  await page
    .getByLabel('Assessment title', { exact: true })
    .fill('Separate revised authoring draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  const forkId = page.url().split('/').pop()!;
  expect(forkId).not.toBe(savedId);
  expect((await read(savedId)).title).toBe('Shared authoring verification');
  expect((await read(forkId)).source_definition_id).toBe(savedId);
  const pinned = await (
    await page.request.get('/api/assessments/assignments/' + assignment.id + '?clientId=' + client)
  ).json();
  expect(pinned.title).toBe('Shared authoring verification');
  expect(pinned.revision).toBe(published.revision);
  expect(pinned.definition.questions).toHaveLength(3);
  // A real competing save makes the visible version stale. Preserve edits and compare before explicit discard.
  const fork = await read(forkId);
  await post('/assessments/definitions', {
    clientId: client,
    source: forkId,
    version: fork.version,
    saveToken: crypto.randomUUID(),
    content: {
      title: 'Competing saved title',
      questions: fork.questions,
      sections: fork.sections,
      rubric: fork.rubric,
      answer_key: fork.answer_key,
    },
  });
  await page
    .getByLabel('Assessment title', { exact: true })
    .fill('Local title retained during conflict');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#builder-errors')).toContainText('Writes are stopped.');
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveValue(
    'Local title retained during conflict',
  );
  await page.getByRole('button', { name: 'Compare with saved definition', exact: true }).click();
  await page.getByText('Private structured comparison', { exact: true }).click();
  await expect(page.locator('#definition-comparison')).toContainText('Competing saved title');
  await expect(page.locator('#definition-comparison')).toContainText(
    'Local title retained during conflict',
  );
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Discard local edits and reload', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Discard local edits and reload', exact: true }).click();
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveValue(
    'Competing saved title',
  );
  await step('questions');
  await page
    .getByRole('navigation', { name: 'Question sections', exact: true })
    .getByRole('button', { name: /Practice/ })
    .click();
  await page
    .getByRole('complementary', { name: 'Question list', exact: true })
    .getByRole('button', { name: /Choose the supported/ })
    .click();
  const promptBefore = await page.getByTestId('prompt-editor').innerText();
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
  // Isolated response fixture: no scanner or usable media asset is claimed.
  let releaseScan!: () => void;
  const scanGate = new Promise<void>((resolve) => {
    releaseScan = resolve;
  });
  await page.route('**/assessments/media/*/status', async (r) => {
    await scanGate;
    await r.fulfill({ json: { status: 'unavailable' } });
  });
  let releaseUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  const uploadUrl = await page.locator('[data-upload]').getAttribute('data-upload');
  await page.route('**' + uploadUrl, async (r) => {
    await uploadGate;
    await r.continue();
  });
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Insert image', exact: true }).click();
  await (await picker).setFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('prompt-image-busy')).toContainText('Uploading image');
  await expect(page.getByTestId('prompt-editor')).toHaveAttribute('contenteditable', 'false');
  await expect(
    page.getByRole('toolbar', { name: 'Prompt formatting' }).locator('button:enabled'),
  ).toHaveCount(0);
  releaseUpload();
  await expect(page.getByTestId('prompt-image-busy')).toContainText('Checking image');
  // Re-render while processing must retain the lock for the same question.
  await page.getByLabel('Question type', { exact: true }).selectOption('open_response');
  await expect(page.getByTestId('prompt-editor')).toHaveAttribute('contenteditable', 'false');
  await page.getByLabel('Question type', { exact: true }).selectOption('multiple_choice');
  await expect(page.getByTestId('prompt-image-busy')).toBeVisible();
  await screenshot('image-processing-disabled');
  releaseScan();
  await expect(
    page.getByText(
      'Image processing is unavailable or still pending. Retry after the scanner and worker are available. Your prompt is intact.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId('prompt-editor')).toHaveText(promptBefore);
  await expect(page.getByRole('button', { name: 'Retry image upload', exact: true })).toBeEnabled();
  await expect(page.getByTestId('prompt-editor')).toHaveAttribute('contenteditable', 'true');
  await expect(page.getByTestId('prompt-image-busy')).toBeHidden();
  // Re-rendering the question must not discard the failed media ID or retry UI.
  await page.getByLabel('Question type', { exact: true }).selectOption('open_response');
  await page.getByLabel('Question type', { exact: true }).selectOption('multiple_choice');
  await expect(page.getByRole('button', { name: 'Retry image upload', exact: true })).toBeVisible();
  const retryRequest = page.waitForRequest((r) =>
    /\/assessments\/media\/[^/]+\/retry$/.test(r.url()),
  );
  await page.getByRole('button', { name: 'Retry image upload', exact: true }).click();
  await retryRequest;
  await expect(page.getByRole('button', { name: 'Retry image upload', exact: true })).toBeEnabled();
  await expect(page.getByTestId('prompt-editor')).toHaveText(promptBefore);
  await expect(page.getByTestId('prompt-editor').locator('img[src]')).toHaveCount(0);
  await page.unroute('**/assessments/media/*/status');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('button', { name: /^Theme(?: |$)/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await a11y();
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  const personal = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  await personal.getByRole('button', { name: /^Theme(?: |$)/ }).click();
  await personal.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await a11y();
  await screenshot('questions-dark-desktop');
  await page.getByRole('button', { name: 'Personal settings', exact: true }).click();
  await personal.getByRole('button', { name: /^Theme(?: |$)/ }).click();
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
    await touch.goto('/assessments/definitions/' + forkId);
    await expect(touch.getByLabel('Assessment title', { exact: true })).toBeVisible();
    expect(
      await touch
        .getByLabel('Assessment title', { exact: true })
        .evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    expect(
      (await touch.getByRole('button', { name: 'Save draft', exact: true }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    await touch.locator('[data-section=questions]').click();
    expect(
      await touch.getByTestId('prompt-editor').evaluate((e) => getComputedStyle(e).fontSize),
    ).toBe('16px');
    await touch.locator('[data-section=review]').click();
    expect(
      (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
  } finally {
    await touchContext.close();
  }
  page.once('dialog', (d) => d.accept());
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page).toHaveURL(/\/assessments$/);
  const definitionApi = '**/api/assessments/definitions?*';
  await page.route(definitionApi, (r) =>
    r.fulfill({ status: 503, json: { message: 'Builder definition unavailable.' } }),
  );
  await page.goto('/assessments/definitions/' + forkId);
  await expect(page.getByText('Builder definition unavailable.', { exact: true })).toBeVisible();
  await page.unroute(definitionApi);
  await page.getByRole('button', { name: 'Retry builder', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Assessment title', { exact: true })).toHaveValue(
    'Competing saved title',
  );
  for (const email of [
    'demo.1.3@example.invalid',
    'demo.1.0@example.invalid',
    'curriculum-ui@example.invalid',
  ]) {
    await login(email);
    await page.goto('/assessments/definitions/' + savedId);
    await expect(page.getByRole('button', { name: 'Retry builder', exact: true })).toBeVisible();
    await expect(page.getByLabel('Assessment title', { exact: true })).toHaveCount(0);
    expect(
      (
        await page.request.get('/api/assessments/definitions?clientId=' + client + '&id=' + savedId)
      ).status(),
    ).toBe(403);
  }
  expect(errors).toEqual([]);
});

import { Database } from '../../packages/database/src/database.js';
import { randomUUID } from 'node:crypto';
import { expect, type Browser } from '@playwright/test';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';
export async function assessmentBuilderFlow(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    page = await context.newPage(),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:3110/login');
  await page.getByLabel('Email', { exact: true }).fill('demo.1.2@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('Separate browser demo passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/clients$/);

  await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Active client', exact: true }).locator('option:checked'),
  ).toHaveText('Demo Client 1');
  await page.goto('http://127.0.0.1:3110/assessments');
  await page.getByRole('link', { name: 'Build an assessment', exact: true }).click();
  await page.getByLabel('Assessment title', { exact: true }).fill('Browser matrix assessment');
  await page.locator('[data-section="questions"]').click();
  await page.getByLabel('Section title (required for publication)').fill('Safety reflection');
  await page.getByLabel('Question type', { exact: true }).selectOption('self_assessment');
  await page.getByTestId('prompt-editor').fill('Reflect on your current practice.');
  await page.getByLabel('Assessment area 1', { exact: true }).fill('I check the evidence.');
  await page.getByText('Insert image or edit alt text', { exact: true }).click();
  await page.getByLabel('Image alt text', { exact: true }).fill('Test diagram');
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
  await page
    .getByLabel('Image file (PNG, JPEG or WebP, up to 2 MiB)', { exact: true })
    .setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: image });
  await page.getByRole('button', { name: 'Upload and insert image', exact: true }).click();
  await expect(
    page.getByText(
      'Image processing is unavailable or still pending. Retry after the scanner and worker are available. Your prompt is intact.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByTestId('prompt-editor')).toHaveText('Reflect on your current practice.');
  await page.getByRole('button', { name: 'Retry image upload', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry image upload', exact: true })).toBeEnabled();
  await page.getByText('Insert image or edit alt text', { exact: true }).click();

  await page.getByLabel('Require a rating for every area').check();
  await page.getByLabel('Include optional Notes column').check();
  await page.getByRole('button', { name: 'Remove rating 4', exact: true }).click();
  await page.getByRole('button', { name: 'Undo matrix removal', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  await expect(page).toHaveURL(/\/assessments\/definitions\/[0-9a-f-]{36}$/);
  const original = page.url();
  for (let reload = 0; reload < 3; reload++) {
    await page.reload();
    await page.locator('[data-section="questions"]').click();
    await expect(page.getByLabel('Assessment area 1', { exact: true })).toHaveValue(
      'I check the evidence.',
    );
    await page.locator('[data-section="review"]').click();
    await expect
      .poll(
        async () => ({
          enabled: await page
            .getByRole('button', { name: 'Publish assessment', exact: true })
            .isEnabled(),
          save: await page.locator('#save-status').innerText(),
          help: await page.locator('#publish-help').innerText(),
          readiness: await page.locator('#readiness-list').innerText(),
          errors,
        }),
        { message: 'Saved complete definition must be publishable' },
      )
      .toMatchObject({ enabled: true });
  }
  await expect(page.locator('#learner-preview [role="radiogroup"]')).toHaveCount(1);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'output/playwright/assessment-builder-mobile.png',
    fullPage: true,
  });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Publish assessment', exact: true }).click();
  await expect(page.locator('#save-status')).toContainText('Assessment published');
  await page.locator('[data-section="questions"]').click();
  await page.getByLabel('Rating heading 1', { exact: true }).fill('Revised rating');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  expect(page.url()).not.toBe(original);
  await page.goto(original);
  await page.locator('[data-section="questions"]').click();
  await expect(page.getByLabel('Rating heading 1', { exact: true })).not.toHaveValue(
    'Revised rating',
  );
  await page.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Assessment definitions' })).toContainText(
    'Browser matrix assessment',
  );

  await page.getByRole('link', { name: 'Assign assessment', exact: true }).click();
  await page.getByLabel('Search recipients', { exact: true }).fill('Demo Member 1.3');
  await page
    .getByRole('combobox', { name: 'Member record', exact: true })
    .selectOption({ label: 'Demo Member 1.3 · Browser training record' });
  await page.getByRole('checkbox', { name: /I confirm assignment of revision/ }).check();
  await page.getByRole('button', { name: 'Assign assessment', exact: true }).click();
  await expect(
    page.getByText('Assessment assigned to the selected member record.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Assign to', exact: true }).selectOption('team');
  await page
    .getByRole('combobox', { name: 'Team', exact: true })
    .selectOption({ label: 'Demo team · 1 eligible member records now' });
  await page.getByRole('checkbox', { name: /I confirm assignment of revision/ }).check();
  await page.getByRole('button', { name: 'Assign assessment', exact: true }).click();
  await expect(
    page.getByText('Team assignment rule is active. Existing work is preserved.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Stop future assignments', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Resume future assignments', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resume future assignments', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Stop future assignments', exact: true }),
  ).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: 'output/playwright/assessment-assignment-mobile.png',
    fullPage: true,
  });
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    memberPage = await memberContext.newPage();
  await memberPage.goto('http://127.0.0.1:3110/login');
  await memberPage.getByLabel('Email', { exact: true }).fill('demo.1.3@example.invalid');
  await memberPage.getByLabel('Password', { exact: true }).fill('Separate browser demo passphrase');
  await memberPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await memberPage.waitForURL('**/clients');
  await memberPage.goto('http://127.0.0.1:3110/clients');
  await memberPage.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  await expect(memberPage).toHaveURL(/\/dashboard$/);
  await memberPage.goto('http://127.0.0.1:3110/assessments');
  await expect(memberPage.getByRole('table', { name: 'Assigned assessments' })).toContainText(
    'Browser matrix assessment',
  );
  await expect(
    memberPage.getByRole('link', { name: 'Build an assessment', exact: true }),
  ).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page: memberPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  const memberSession = await (
    await memberContext.request.get('http://127.0.0.1:3110/api/auth/context')
  ).json();
  const memberRecords = await (
    await memberContext.request.get(
      'http://127.0.0.1:3110/api/enrolments?clientId=' + memberSession.client.id,
    )
  ).json();
  const evidenceRecord = memberRecords.records.find(
    (r: { title: string }) => r.title === 'Browser training record',
  );
  const upload = await memberContext.request.post(
    'http://127.0.0.1:3110/api/enrolments/' + evidenceRecord.id + '/files',
    {
      headers: { Origin: 'http://127.0.0.1:3110' },
      multipart: {
        csrf: memberSession.csrf,
        clientId: memberSession.client.id,
        purpose: 'evidence',
        evidence: {
          name: 'supporting-notes.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('Synthetic supporting evidence for browser verification.'),
        },
      },
    },
  );
  expect(upload.ok()).toBeTruthy();
  const uploaded = await upload.json();
  expect(uploaded.status).toBe('quarantined');
  expect(
    (await memberContext.request.get('http://127.0.0.1:3110/api/files/' + uploaded.id)).status(),
  ).toBe(409);
  const fileList = await (
    await memberContext.request.get(
      'http://127.0.0.1:3110/api/enrolments/' +
        evidenceRecord.id +
        '/files?clientId=' +
        memberSession.client.id,
    )
  ).json();
  expect(fileList.files).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: uploaded.id, name: 'supporting-notes.txt' }),
    ]),
  );
  expect(fileList.files[0]).not.toHaveProperty('storage_key');

  await memberPage.getByRole('link', { name: 'Open assessment', exact: true }).click();
  await expect(
    memberPage.getByRole('heading', { name: 'Your response', exact: true }),
  ).toBeVisible();
  memberPage.once('dialog', (d) => d.accept());
  await memberPage.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(memberPage.getByRole('list', { name: 'Response errors' })).toBeVisible();
  await expect(
    memberPage.getByRole('button', { name: 'Submit response', exact: true }),
  ).toBeEnabled();
  // Deliver a save to the server, then lose its response: retry must replay the same receipt.
  let lost = false;
  await memberPage.route('**/api/assessments/responses/*', async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === 'save' && !lost) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await memberPage.getByRole('radio').first().check();
  await expect(memberPage.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await memberPage
    .getByLabel('Notes for I check the evidence.', { exact: true })
    .fill('A newer edit while recovering the previous save.');
  await memberPage.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(memberPage.locator('#response-save-status')).toHaveText('All changes saved.');
  await memberPage.reload();
  await expect(memberPage.getByRole('radio').first()).toBeChecked();
  await expect(
    memberPage.getByLabel('Notes for I check the evidence.', { exact: true }),
  ).toHaveValue('A newer edit while recovering the previous save.');
  await memberPage.getByLabel('Upload supporting evidence', { exact: true }).setInputFiles({
    name: 'response-evidence.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic response-screen evidence.'),
  });
  await memberPage.getByRole('button', { name: 'Upload evidence', exact: true }).click();
  await expect(
    memberPage.getByText('File uploaded. It must pass scanning before you can attach it.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    memberPage.getByRole('checkbox', { name: 'response-evidence.txt - quarantined', exact: true }),
  ).toBeDisabled();
  expect(
    (await new AxeBuilder({ page: memberPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await memberPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await memberPage.screenshot({
    path: 'output/playwright/assessment-response-mobile.png',
    fullPage: true,
  });
  memberPage.once('dialog', (d) => d.dismiss());
  await memberPage.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(
    memberPage.getByRole('button', { name: 'Submit response', exact: true }),
  ).toBeVisible();
  await memberPage.unroute('**/api/assessments/responses/*');
  let lostSubmit = false;
  await memberPage.route('**/api/assessments/responses/*', async (route) => {
    if (route.request().postDataJSON().action === 'submit' && !lostSubmit) {
      lostSubmit = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  memberPage.once('dialog', (d) => d.accept());
  await memberPage.getByRole('button', { name: 'Submit response', exact: true }).click();
  await expect(memberPage.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await memberPage.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(
    memberPage.getByRole('heading', { name: 'Submission history', exact: true }),
  ).toBeVisible();
  await expect(memberPage.getByText(/Submission receipt:/)).toBeVisible();
  await expect(
    memberPage.getByRole('button', { name: 'Submit response', exact: true }),
  ).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page: memberPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);

  const matrixUrl = memberPage.url();
  await page.goto(matrixUrl);
  await expect(page.getByRole('heading', { name: 'Human review', exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Private decision rationale', exact: true })
    .fill('Private rationale for matrix review.');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Approve reviewed result', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approved result', exact: true })).toHaveCount(0);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve reviewed result', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Approved result', exact: true })).toBeVisible();
  await expect(page.getByText('Rubric score: Not applicable', { exact: true })).toBeVisible();
  await memberPage.reload();
  await expect(
    memberPage.getByRole('heading', { name: 'Approved result', exact: true }),
  ).toBeVisible();
  await expect(
    memberPage.getByText('Private rationale for matrix review.', { exact: true }),
  ).toHaveCount(0);
  await memberPage
    .getByRole('textbox', { name: 'Reason for appeal', exact: true })
    .fill('Please obtain an independent review.');
  memberPage.once('dialog', (d) => d.accept());
  await memberPage.getByRole('button', { name: 'Request alternate review', exact: true }).click();
  await expect(
    memberPage.getByRole('heading', { name: 'Alternate review requested', exact: true }),
  ).toBeVisible();
  await expect(
    memberPage.getByRole('button', { name: 'Submit response', exact: true }),
  ).toHaveCount(0);
  async function rolePage(email: string) {
    const roleContext = await browser.newContext({ viewport: { width: 390, height: 844 } }),
      rolePage = await roleContext.newPage();
    rolePage.on('pageerror', (e) => errors.push(e.message));
    await rolePage.goto('http://127.0.0.1:3110/login');
    await rolePage.getByLabel('Email', { exact: true }).fill(email);
    await rolePage.getByLabel('Password', { exact: true }).fill('Separate browser demo passphrase');
    await rolePage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(rolePage).toHaveURL(/\/clients$/);

    await rolePage.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
    await expect(rolePage).toHaveURL(/\/dashboard$/);
    return { context: roleContext, page: rolePage };
  }
  const routing = await rolePage('demo.1.0@example.invalid');
  await routing.page.goto('http://127.0.0.1:3110/assessments');
  await expect(
    routing.page.getByRole('heading', { name: 'Assign alternate reviewers', exact: true }),
  ).toBeVisible();
  await routing.page
    .locator('summary')
    .filter({ hasText: /^Case / })
    .click();
  await routing.page
    .getByRole('combobox', { name: /Reviewer for/ })
    .selectOption({ label: 'Demo Coordinator 1.1' });
  await routing.page
    .getByRole('textbox', { name: /Assignment reason for/ })
    .fill('Independent reviewer for this appeal.');
  routing.page.once('dialog', (d) => d.accept());
  await routing.page
    .getByRole('button', { name: 'Assign alternate reviewer', exact: true })
    .click();
  await expect(
    routing.page.getByText('Alternate reviewer assigned.', { exact: true }),
  ).toBeVisible();
  await expect(
    routing.page.getByText('Please obtain an independent review.', { exact: true }),
  ).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page: routing.page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  expect(
    await routing.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  const alternate = await rolePage('demo.1.1@example.invalid');
  await alternate.page.goto('http://127.0.0.1:3110/assessments');
  await alternate.page.getByRole('link', { name: 'Open assessment', exact: true }).click();
  await alternate.page
    .getByRole('textbox', { name: 'Private decision rationale', exact: true })
    .fill('Original decision remains appropriate.');
  alternate.page.once('dialog', (d) => d.accept());
  await alternate.page
    .getByRole('button', { name: 'Uphold previous decision', exact: true })
    .click();
  await expect(alternate.page).toHaveURL(/\/assessments\?review=recorded$/);
  await expect(
    alternate.page.getByRole('link', { name: 'Open assessment', exact: true }),
  ).toHaveCount(0);
  await alternate.context.close();
  await routing.context.close();
  await memberPage.reload();
  await expect(
    memberPage.getByRole('heading', { name: 'Alternate review requested', exact: true }),
  ).toHaveCount(0);
  // Exercise resumed section navigation using a separate published synthetic revision.
  const authorSession = await (
    await context.request.get('http://127.0.0.1:3110/api/auth/context')
  ).json();
  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await context.request.post('http://127.0.0.1:3110/api' + path, {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: { csrf: authorSession.csrf, clientId: authorSession.client.id, ...body },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const sectionIds = [randomUUID(), randomUUID(), randomUUID()];
  const definition = await post('/assessments/definitions', {
    source: null,
    version: 0,
    saveToken: randomUUID(),
    content: {
      title: 'Browser section navigation',
      questions: sectionIds.map((_, i) => ({
        id: 'q' + i,
        type: 'multiple_choice',
        prompt: 'Section question ' + (i + 1),
        choices: [
          { id: 'yes', text: 'Yes' },
          { id: 'no', text: 'No' },
        ],
      })),
      sections: sectionIds.map((id, i) => ({
        id,
        title: 'Practice ' + (i + 1),
        instructions: 'Choose an answer, then continue.',
        question_ids: ['q' + i],
      })),
      answer_key: { q0: 'yes', q1: 'yes', q2: 'yes' },
      rubric: { threshold: 70, criteria: [] },
    },
  });
  await post('/assessments/publish', { id: definition.id, version: definition.version });
  const assigned = await post('/assessments/assignments', {
    definition: definition.id,
    mode: 'member',
    target: evidenceRecord.id,
    confirmed: true,
  });
  await memberPage.goto('http://127.0.0.1:3110/assessments/assignments/' + assigned.id);
  await expect(
    memberPage.getByRole('button', { name: '3. Practice 3', exact: true }),
  ).toBeDisabled();
  await memberPage.getByRole('radio', { name: 'Yes', exact: true }).check();
  await memberPage.getByRole('button', { name: 'Continue to next section', exact: true }).click();
  await expect(memberPage.getByRole('heading', { name: 'Practice 2', exact: true })).toBeVisible();
  await memberPage.reload();
  await expect(memberPage.getByRole('heading', { name: 'Practice 2', exact: true })).toBeVisible();
  await memberPage.getByRole('button', { name: 'Previous section', exact: true }).click();
  await expect(memberPage.getByRole('radio', { name: 'Yes', exact: true })).toBeChecked();
  await memberPage.getByRole('button', { name: '2. Practice 2', exact: true }).click();
  await memberPage.getByRole('radio', { name: 'No', exact: true }).check();
  await memberPage.getByRole('button', { name: 'Continue to next section', exact: true }).click();
  await expect(memberPage.getByRole('heading', { name: 'Practice 3', exact: true })).toBeVisible();
  // A second tab saves first. The original tab must preserve its text on a conflict.
  const current = await (
    await memberContext.request.get(
      'http://127.0.0.1:3110/api/assessments/assignments/' +
        assigned.id +
        '?clientId=' +
        memberSession.client.id,
    )
  ).json();
  const otherSave = await memberContext.request.post(
    'http://127.0.0.1:3110/api/assessments/responses/' + assigned.id,
    {
      headers: { Origin: 'http://127.0.0.1:3110' },
      data: {
        csrf: memberSession.csrf,
        clientId: memberSession.client.id,
        action: 'save',
        expected_version: current.version,
        section_id: sectionIds[2],
        save_token: randomUUID(),
        responses: { q2: 'no' },
        context: 'Saved in another tab',
        files: [],
      },
    },
  );
  expect(otherSave.ok()).toBeTruthy();
  await memberPage
    .getByRole('textbox', { name: 'Additional context (optional)', exact: true })
    .fill('Keep my unsaved text after conflict.');
  await expect(
    memberPage.getByRole('alert').filter({ hasText: 'Your answers remain on this page' }),
  ).toContainText('Your answers remain on this page');
  await expect(
    memberPage.getByRole('textbox', { name: 'Additional context (optional)', exact: true }),
  ).toHaveValue('Keep my unsaved text after conflict.');
  await expect(
    memberPage.getByRole('button', { name: 'Submit response', exact: true }),
  ).toBeDisabled();
  memberPage.once('dialog', (d) => d.dismiss());
  await memberPage.getByRole('link', { name: 'Back to assessments', exact: true }).click();
  await expect(
    memberPage.getByRole('textbox', { name: 'Additional context (optional)', exact: true }),
  ).toHaveValue('Keep my unsaved text after conflict.');

  const writtenDefinition = await post('/assessments/definitions', {
    source: null,
    version: 0,
    saveToken: randomUUID(),
    content: {
      title: 'Browser written review',
      questions: [{ id: 'written', type: 'open_response', prompt: 'Explain your evidence.' }],
      rubric: {
        threshold: 75,
        criteria: [
          {
            id: 'evidence',
            category: 'Practice',
            label: 'Evidence',
            guidance: 'Evaluate the submitted evidence.',
            weight: 1,
          },
        ],
      },
    },
  });
  await post('/assessments/publish', {
    id: writtenDefinition.id,
    version: writtenDefinition.version,
  });
  const writtenAssignment = await post('/assessments/assignments', {
    definition: writtenDefinition.id,
    mode: 'member',
    target: evidenceRecord.id,
    confirmed: true,
  });
  async function memberPost(body: Record<string, unknown>) {
    const result = await memberContext.request.post(
      'http://127.0.0.1:3110/api/assessments/responses/' + writtenAssignment.id,
      {
        headers: { Origin: 'http://127.0.0.1:3110' },
        data: { csrf: memberSession.csrf, clientId: memberSession.client.id, ...body },
      },
    );
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  }
  // Only this synthetic fixture is scan-approved directly. This verifies review UI,
  // not a real antivirus installation; scanner behavior has separate domain tests.
  async function fixtureScan(status: 'clean' | 'quarantined') {
    const fixtureDb = new Database('postgresql://postgres:postgres@127.0.0.1:55432/postgres');
    try {
      const changed = await fixtureDb.pool.query(
        "UPDATE evidence_files f SET scan_status=$1 FROM users u WHERE f.id=$2 AND f.enrolment_id=$3 AND f.uploaded_by=u.id AND f.environment='test' AND u.environment='test' AND u.is_synthetic",
        [status, uploaded.id, evidenceRecord.id],
      );
      expect(changed.rowCount).toBe(1);
    } finally {
      await fixtureDb.close();
    }
  }
  await fixtureScan('clean');
  await memberPost({
    action: 'save',
    expected_version: 1,
    save_token: randomUUID(),
    responses: { written: 'I compare the source evidence before deciding.' },
    files: [uploaded.id],
  });
  const writtenAttempt = await memberPost({
    action: 'submit',
    expected_version: 2,
    idempotency_key: randomUUID(),
  });
  await fixtureScan('quarantined');
  await page.goto('http://127.0.0.1:3110/assessments/assignments/' + writtenAssignment.id);
  await expect(
    page.getByText(
      'supporting-notes.txt - quarantined. File confirmation is available only after scanning passes.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText('Verify supporting-notes.txt', { exact: true })).toHaveCount(0);
  await fixtureScan('clean');
  await page.reload();

  await page
    .getByRole('textbox', { name: 'Analysis reason', exact: true })
    .fill('Check the synthetic evidence before human review.');
  page.once('dialog', (d) => d.dismiss());
  await page
    .getByRole('button', { name: 'Request synthetic provisional analysis', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Human review', exact: true })).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', { name: 'Request synthetic provisional analysis', exact: true })
    .click();
  await expect(page.getByText('Provisional analysis is prefilled.', { exact: false })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole('spinbutton', { name: 'Score for Evidence', exact: true }),
  ).toHaveValue('70');
  await expect(page.getByText('Demo Member 1.3 - review pending', { exact: true })).toBeVisible();
  const privateResult = await (
    await memberContext.request.get(
      'http://127.0.0.1:3110/api/assessments/reviews/' +
        writtenAssignment.id +
        '?clientId=' +
        authorSession.client.id,
    )
  ).json();
  expect(privateResult.approved).toBeNull();
  expect(privateResult.reviews).toEqual([]);
  expect(privateResult.canAnalyze).toBe(false);
  await page
    .getByRole('checkbox', { name: writtenAttempt.receipt + ':written', exact: true })
    .uncheck();
  await page.getByRole('spinbutton', { name: 'Score for Evidence', exact: true }).fill('80');
  await page
    .getByRole('textbox', { name: 'Feedback for Evidence', exact: true })
    .fill('Good evidence handling. Next focus: document the comparison.');
  await page
    .getByRole('textbox', { name: 'Private decision rationale', exact: true })
    .fill('Private rationale verified against submitted text.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve reviewed result', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'A score requires evidence.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: 'Score for Evidence', exact: true }),
  ).toHaveValue('80');
  await page.getByText('Verify supporting-notes.txt', { exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Verified evidence text 1', exact: true })
    .fill('My independently checked text must survive extraction polling.');
  await page.getByRole('button', { name: 'Request text extraction', exact: true }).click();
  await expect(page.getByText('Extraction: ready', { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(
    page.getByRole('textbox', { name: 'Verified evidence text 1', exact: true }),
  ).toHaveValue('My independently checked text must survive extraction polling.');
  await expect(
    page.getByRole('spinbutton', { name: 'Score for Evidence', exact: true }),
  ).toHaveValue('80');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Use extracted text', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Verified evidence text 1', exact: true }),
  ).toHaveValue('My independently checked text must survive extraction polling.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Use extracted text', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Verified evidence text 1', exact: true }),
  ).toHaveValue('Synthetic supporting evidence for browser verification.');
  await page
    .getByRole('textbox', { name: 'Verified evidence text 1', exact: true })
    .fill('Synthetic supporting evidence for browser verification.');
  await page
    .getByRole('textbox', { name: 'Confirmation reason 1', exact: true })
    .fill('Compared the text against the downloaded synthetic file.');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Confirm file evidence', exact: true }).click();
  await expect(
    page.getByText('File evidence confirmed. Review scores against the updated evidence.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: 'Score for Evidence', exact: true }),
  ).toHaveValue('80');
  const confirmedReview = await (
    await context.request.get(
      'http://127.0.0.1:3110/api/assessments/reviews/' +
        writtenAssignment.id +
        '?clientId=' +
        authorSession.client.id,
    )
  ).json();
  const confirmation = confirmedReview.evidence.find(
    (item: { id: string }) => !item.id.includes(':'),
  );
  expect(confirmation).toBeDefined();
  await page.getByRole('checkbox', { name: confirmation.id, exact: true }).check();
  await page
    .getByRole('checkbox', { name: writtenAttempt.receipt + ':written', exact: true })
    .check();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'output/playwright/assessment-review-mobile.png', fullPage: true });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Approve reviewed result', exact: true }).click();
  await expect(page.getByText('Rubric score: 80', { exact: true })).toBeVisible();
  const approvedPage = await memberContext.newPage();
  await approvedPage.goto(page.url());
  await expect(
    approvedPage.getByRole('heading', { name: 'Approved result', exact: true }),
  ).toBeVisible();
  await expect(
    approvedPage.getByText('80 - Good evidence handling. Next focus: document the comparison.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    approvedPage.getByText('Private rationale verified against submitted text.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    approvedPage.getByRole('heading', { name: 'Human review', exact: true }),
  ).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page: approvedPage }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  await memberContext.close();
  expect(errors).toEqual([]);
  await context.close();
}

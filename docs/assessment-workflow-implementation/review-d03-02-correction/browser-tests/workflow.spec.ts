import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
const origin = 'https://workflow-qa.invalid';
const shots = 'docs/assessment-workflow-implementation/review-d03-02-correction/screenshots';
const questions = ['A1', 'A2', 'B1', 'B2'].map((id) => ({
  id,
  type: 'multiple_choice',
  prompt: 'Synthetic prompt ' + id,
  choices: [
    { id: 'yes', text: 'Yes' },
    { id: 'no', text: 'No' },
  ],
}));
const initial = {
  id: 'synthetic-definition',
  version: 1,
  revision: 1,
  status: 'draft',
  title: 'Synthetic two-section assessment',
  threshold: null,
  criteria: [],
  questions,
  answer_key: Object.fromEntries(questions.map((q) => [q.id, 'yes'])),
  sections: [
    { id: 'a', title: 'Section A', instructions: 'First section', question_ids: ['A1', 'A2'] },
    { id: 'b', title: 'Section B', instructions: 'Second section', question_ids: ['B1', 'B2'] },
  ],
};
let css: string, builder: string, review: string, shell: string, responses: string;
async function bundle(contents: string, shim = false) {
  return (
    await build({
      stdin: { contents, resolveDir: process.cwd(), loader: 'tsx' },
      bundle: true,
      write: false,
      platform: 'browser',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: shim
        ? [
            {
              name: 'router-test-seam',
              setup(b) {
                b.onResolve({ filter: /^next\/navigation$/ }, () => ({
                  path: 'navigation',
                  namespace: 'qa',
                }));
                b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({
                  contents: `const router={replace:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/assessments/definitions/synthetic-definition';`,
                }));
              },
            },
          ]
        : [],
    })
  ).outputFiles[0].text;
}
test.beforeAll(async () => {
  css = (
    await Promise.all(
      ['globals', 'workspace', 'directory', 'assessments'].map((name) =>
        readFile(`apps/web/app/${name}.css`, 'utf8'),
      ),
    )
  ).join('\n');
  await mkdir(shots, { recursive: true });
  builder = await bundle(
    `import {mountAssessmentBuilder} from './apps/web/app/components/assessment-builder/builder.js';import {builderMarkup} from './apps/web/app/components/assessment-builder/markup';window.mountBuilder=()=>{const root=document.getElementById('builder');root.innerHTML=builderMarkup;root.dataset.client='synthetic-client';root.dataset.endpoint='/api/assessments/builder';root.querySelector('#builder-csrf').value='inert';window.cleanupBuilder=mountAssessmentBuilder(root,window.fixture);};window.mountBuilder();`,
  );
  review = await bundle(
    `import {createRoot} from 'react-dom/client';import {AssessmentReview} from './apps/web/app/components/assessment-review';const root=createRoot(document.getElementById('review'));window.mountReview=()=>root.render(<AssessmentReview id='synthetic-assignment' client='synthetic-client' csrf='inert' status={window.reviewStatus||'submitted'} complete={()=>{}} onStatus={()=>{}}/>);window.mountReview();`,
  );
  shell = await bundle(
    `import {createRoot} from 'react-dom/client';import {AppShell} from './apps/web/app/components/app-shell';createRoot(document.getElementById('shell')).render(<AppShell><div id='builder' className='assessment-workspace assessment-builder'/></AppShell>);`,
    true,
  );
  responses = await bundle(
    `import {createRoot} from 'react-dom/client';import {ResponseQuestions} from './apps/web/app/components/response-questions';createRoot(document.getElementById('learner')).render(<ResponseQuestions questions={window.fixture.questions.slice(2)} allQuestions={window.fixture.questions} sections={window.fixture.sections} answers={{}} onChange={()=>{}}/>);createRoot(document.getElementById('history')).render(<ResponseQuestions questions={window.fixture.questions} sections={window.fixture.sections} answers={{}}/>);`,
  );
});
async function boot(page: Page, handler?: (route: any) => Promise<boolean>) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    if (handler && (await handler(route))) return;
    const u = route.request().url();
    if (u === origin + '/' || u === origin + '/assessments/definitions/synthetic-copy')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Synthetic isolated component QA</h1><div id="shell"></div><div id="builder" class="assessment-workspace assessment-builder"></div><div id="review"></div><h2>Learner section B</h2><div id="learner"></div><h2>History all questions</h2><div id="history"></div></body></html>',
      });
    throw Error('Unapproved request ' + u);
  });
  await page.goto(origin);
  await page.addStyleTag({ content: css });
  await page.evaluate((v) => {
    (window as any).fixture = v;
  }, initial);
  return errors;
}
async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
}
test('D04 preview discloses scope and uses pinned section references across views', async ({
  page,
}) => {
  const errors = await boot(page);
  await page.addScriptTag({ content: builder });
  await page.locator('[data-section=review]').click();
  await expect(page.locator('#learner-preview')).toContainText('Question 3');
  await expect(page.locator('#learner-preview')).toContainText('Saved revision 1');
  await page.locator('[name=preview-B1][value=yes]').check();
  await page.locator('[data-section=details]').click();
  await page.locator('#assessment-title').fill('Unsaved local title');
  await page.locator('[data-section=review]').click();
  await expect(page.locator('[name=preview-B1][value=yes]')).not.toBeChecked();
  await expect(page.locator('#learner-preview')).toContainText('Unsaved local title');
  await expect(page.locator('#learner-preview')).toContainText(
    'Content preview — responses are not saved',
  );
  await expect(page.locator('#learner-preview')).toContainText('Current unsaved local edits');
  await page.addScriptTag({ content: responses });
  await expect(page.locator('#learner h3').first()).toHaveText('Section B — Question 3');
  await expect(page.locator('#history h3').nth(2)).toHaveText('Section B — Question 3');
  await expect(page.locator('#learner-preview')).toContainText('Section B — Question 3');
  await screenshot(page, 'D04-section-preview-history');
  expect(errors).toEqual([]);
});
for (const outcome of ['published', 'draft', 'unavailable', 'denied'])
  test('D03 lost publication reconciles exact definition: ' + outcome, async ({ page }) => {
    const posts: any[] = [];
    const reads: string[] = [];
    const errors = await boot(page, async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname === '/api/assessments/definitions') {
        reads.push(u.searchParams.get('id')!);
        if (outcome === 'unavailable') await route.abort('failed');
        else if (outcome === 'denied')
          await route.fulfill({ status: 403, json: { message: 'Access denied' } });
        else
          await route.fulfill({
            json: { ...initial, status: outcome, version: outcome === 'published' ? 2 : 1 },
          });
        return true;
      }
      if (u.pathname !== '/api/assessments/builder') return false;
      posts.push(route.request().postDataJSON());
      await route.abort('failed');
      return true;
    });
    await page.addScriptTag({ content: builder });
    await page.locator('[data-section=review]').click();
    page.on('dialog', (d) => d.accept());
    await page.locator('#publish-definition').click();
    await expect.poll(() => reads.length).toBe(1);
    expect(reads).toEqual(['synthetic-definition']);
    expect(posts).toHaveLength(1);
    if (outcome === 'published') {
      await expect(page.locator('#save-status')).toContainText('Publication confirmed');
      await expect(page.locator('#publish-definition')).toBeDisabled();
    } else if (outcome === 'draft') {
      await expect(page.locator('#save-status')).toContainText('still a draft');
      await expect(page.locator('#publish-definition')).toBeEnabled();
    } else {
      await expect(page.locator('#save-status')).toContainText('unknown');
      await expect(page.locator('#publish-definition')).toBeDisabled();
      await expect(page.locator('#save-definition')).toBeDisabled();
    }
    await screenshot(page, 'D03-reconciled-' + outcome);
    expect(errors).toEqual([]);
  });
test('D03 stale save stops writes and offers authorized structured comparison', async ({
  page,
}) => {
  const posts: any[] = [];
  const errors = await boot(page, async (route) => {
    if (route.request().url().includes('/api/assessments/definitions?')) {
      await route.fulfill({ json: { ...initial, title: 'Concurrent server title', version: 2 } });
      return true;
    }
    if (!route.request().url().endsWith('/api/assessments/builder')) return false;
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { message: 'Stale version' } });
    return true;
  });
  await page.addScriptTag({ content: builder });
  await page.locator('#assessment-title').fill('Local conflict title');
  await page.locator('#save-definition').click();
  await expect(page.locator('#builder-errors')).toContainText('Writes are stopped');
  await expect(page.locator('#assessment-title')).toHaveValue('Local conflict title');
  await expect(page.locator('#save-definition')).toBeDisabled();
  await page.getByRole('button', { name: 'Compare with saved definition' }).click();
  await page.getByText('Private structured comparison', { exact: true }).click();
  await expect(page.locator('#definition-comparison')).toContainText('Concurrent server title');
  await expect(page.locator('#definition-comparison')).toContainText('Local conflict title');
  await expect(page.locator('#definition-comparison')).toContainText('B2');
  expect(posts).toHaveLength(1);
  await screenshot(page, 'D03-conflict-retry');
  expect(errors).toEqual([]);
});
test('D03 unknown save replays exact operation before newer typing', async ({ page }) => {
  const posts: any[] = [];
  await boot(page, async (route) => {
    if (!route.request().url().endsWith('/api/assessments/builder')) return false;
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) await route.abort('failed');
    else
      await route.fulfill({
        json: { id: initial.id, version: posts.length, status: 'draft', readiness: {} },
      });
    return true;
  });
  await page.addScriptTag({ content: builder });
  await page.locator('#assessment-title').fill('First mutation');
  await page.locator('#save-definition').click();
  await expect(page.locator('#save-status')).toContainText('Save failed');
  await page.locator('#assessment-title').fill('Newer typing');
  await page.locator('#save-definition').click();
  await expect(page.locator('#save-status')).toContainText('Previous changes saved');
  expect(posts[1]).toEqual(posts[0]);
  await expect(page.locator('#assessment-title')).toHaveValue('Newer typing');
  await page.locator('#save-definition').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  expect(posts[2].expected_version).toBe(2);
  expect(posts[2].title).toBe('Newer typing');
  expect(posts[2].save_token).not.toBe(posts[0].save_token);
});

test('D06 exact published handoff and D08 durable copy provenance', async ({ page }) => {
  const errors = await boot(page, async (route) => {
    if (!route.request().url().endsWith('/api/assessments/builder')) return false;
    await route.fulfill({
      json: {
        id: 'synthetic-copy',
        version: 1,
        revision: 2,
        source_definition_id: initial.id,
        source_revision: 1,
        status: 'draft',
        readiness: {},
      },
    });
    return true;
  });
  await page.evaluate(() => {
    (window as any).fixture.status = 'published';
    (window as any).fixture.version = 2;
  });
  await page.addScriptTag({ content: builder });
  await expect(page.locator('#assign-definition')).toBeVisible();
  await expect(page.locator('#assign-definition')).toHaveAttribute(
    'href',
    '/assessments/definitions/synthetic-definition/assign',
  );
  await screenshot(page, 'D06-existing-assignment-handoff');
  await page.locator('#assessment-title').fill('Synthetic revised copy');
  await expect(page.locator('#assign-definition')).toBeHidden();
  await page.locator('#save-definition').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved. Not published.');
  await expect(page).toHaveURL(origin + '/assessments/definitions/synthetic-copy');
  await expect(page.locator('#definition-provenance')).toContainText(
    'Source definition synthetic-definition · revision 1',
  );
  await expect(page.locator('#definition-provenance')).toContainText(
    'Draft synthetic-copy · revision 2 · edit version 1',
  );
  await expect(page.locator('#definition-provenance')).toContainText(
    'Existing assignments and team rules remain pinned',
  );
  await page.reload();
  await page.addStyleTag({ content: css });
  await page.evaluate((v) => {
    (window as any).fixture = {
      ...v,
      id: 'synthetic-copy',
      status: 'draft',
      revision: 2,
      version: 1,
      source_definition_id: v.id,
      source_revision: 1,
    };
  }, initial);
  await page.addScriptTag({ content: builder });
  await expect(page.locator('#definition-provenance')).toContainText(
    'Source definition synthetic-definition · revision 1',
  );
  await page.locator('[data-section=review]').click();
  await expect(page.locator('#learner-preview')).toContainText('Saved revision 2');
  await screenshot(page, 'D08-copy-provenance');
  await page.setViewportSize({ width: 375, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screenshot(page, 'D08-copy-provenance-narrow');
  expect(errors).toEqual([]);
});
test('D01 literal link cancellation preserves author edits; clean navigation proceeds', async ({
  page,
}) => {
  await boot(page, async (route) => {
    if (!route.request().url().endsWith('/destination')) return false;
    await route.fulfill({ contentType: 'text/html', body: '<h1>Destination</h1>' });
    return true;
  });
  await page.addScriptTag({ content: builder });
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/destination';
    a.textContent = 'Leave fixture';
    document.body.append(a);
  });
  await page.locator('#assessment-title').fill('Retain on link cancel');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.getByRole('link', { name: 'Leave fixture' }).click();
  expect(dialogs).toEqual(['confirm']);
  await expect(page.locator('#assessment-title')).toHaveValue('Retain on link cancel');
  await page.evaluate(() => {
    (window as any).cleanupBuilder();
  });
  await page.getByRole('link', { name: 'Leave fixture' }).click();
  await expect(page.getByRole('heading', { name: 'Destination' })).toBeVisible();
  expect(dialogs).toHaveLength(1);
});

test('D01 same-document Back and Forward cancellation retains author work', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    history.replaceState({}, '', '/prior');
    history.pushState({}, '', '/current');
    history.pushState({}, '', '/next');
    history.back();
  });
  await expect(page).toHaveURL(origin + '/current');
  await page.addScriptTag({ content: builder });
  await page.locator('#assessment-title').fill('Retain on history cancel');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.evaluate(() => history.back());
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(page).toHaveURL(origin + '/current');
  await page.evaluate(() => history.forward());
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(page).toHaveURL(origin + '/current');
  await expect(page.locator('#assessment-title')).toHaveValue('Retain on history cancel');
});

test('D07 rejection requires separate member-safe feedback and transmits it separately', async ({
  page,
}) => {
  const posts: any[] = [];
  await boot(page, async (route) => {
    if (!route.request().url().includes('/api/assessments/reviews/')) return false;
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    } else await route.fulfill({ json: reviewData });
    return true;
  });
  await page.addScriptTag({ content: review });
  await page.getByLabel('Private decision rationale').fill('PRIVATE rationale');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reject and allow resubmission' }).click();
  await expect(
    page.getByText('Enter member-safe return feedback between 8 and 4,000 characters.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(posts).toHaveLength(0);
  await page
    .getByLabel('Member-safe return feedback', { exact: true })
    .fill('PUBLIC: Add a worked example.');
  await page.getByRole('button', { name: 'Reject and allow resubmission' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].return_feedback).toBe('PUBLIC: Add a worked example.');
  expect(posts[0].reason).toBe('PRIVATE rationale');
  page.removeAllListeners('dialog');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.reload({ timeout: 2000 }).catch(() => {});
  expect(dialogs).toEqual([]);
});
test('D07 learner sees returned guidance without a released grade or private reason', async ({
  page,
}) => {
  await boot(page, async (route) => {
    if (!route.request().url().includes('/api/assessments/reviews/')) return false;
    await route.fulfill({
      json: {
        ...reviewData,
        member: true,
        canReview: false,
        files: [],
        evidence: [],
        rubric: null,
        returned: { attemptId: 'attempt-current', feedback: 'PUBLIC: Add a worked example.' },
      },
    });
    return true;
  });
  await page.addScriptTag({ content: review });
  await expect(page.getByRole('heading', { name: 'Changes requested' })).toBeVisible();
  await expect(page.getByText('PUBLIC: Add a worked example.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approved result' })).toHaveCount(0);
  await screenshot(page, 'D07-member-return-guidance');
});
const reviewData = {
  status: 'submitted',
  canAnalyze: false,
  files: [{ id: 'synthetic-file', name: 'synthetic.txt', status: 'clean', extraction: null }],
  version: 3,
  member: false,
  canReview: true,
  attemptId: 'attempt-current',
  definitionId: 'synthetic-definition',
  revision: 1,
  rubricApplicable: true,
  objective: null,
  appeal: null,
  approved: null,
  reviews: [],
  rubric: {
    threshold: 70,
    criteria: [
      { id: 'c', category: 'Practice', label: 'Evidence', guidance: 'Use evidence', weight: 1 },
    ],
  },
  evidence: [{ id: 'attempt-current:q', text: 'Synthetic evidence' }],
};
test('D04 reordered current references do not renumber historical pinned content', async ({
  page,
}) => {
  const errors = await boot(page);
  await page.evaluate(() => {
    const w = window as any;
    w.pinned = structuredClone(w.fixture);
    w.fixture.questions.reverse();
    w.fixture.sections.reverse();
  });
  await page.addScriptTag({ content: builder });
  await page.locator('[data-section=review]').click();
  await expect(page.locator('#learner-preview')).toContainText('Section B — Question 1');
  const pinned = await bundle(
    `import {createRoot} from 'react-dom/client';import {ResponseQuestions} from './apps/web/app/components/response-questions';createRoot(document.getElementById('learner')).render(<ResponseQuestions questions={window.fixture.questions.slice(0,2)} allQuestions={window.fixture.questions} sections={window.fixture.sections} answers={{}}/>);createRoot(document.getElementById('history')).render(<ResponseQuestions questions={window.pinned.questions} sections={window.pinned.sections} answers={{}}/>);`,
  );
  await page.addScriptTag({ content: pinned });
  await expect(page.locator('#learner')).toContainText('Section B — Question 1');
  await expect(page.locator('#history')).toContainText('Section B — Question 3');
  await expect(page.locator('#history')).toContainText('Section A — Question 1');
  expect(errors).toEqual([]);
});
test('D01 reviewer canceled reload preserves score feedback rationale and verified file text', async ({
  page,
}) => {
  const errors = await boot(page, async (route) => {
    if (!route.request().url().includes('/api/assessments/reviews/')) return false;
    await route.fulfill({ json: reviewData });
    return true;
  });
  await page.addScriptTag({ content: review });
  await page.getByLabel('Score for Evidence', { exact: true }).fill('83');
  await page.getByLabel('Feedback for Evidence', { exact: true }).fill('Synthetic member feedback');
  await page.getByLabel('Private decision rationale').fill('Synthetic private rationale');
  await page.getByText('Verify synthetic.txt', { exact: true }).click();
  await page.getByLabel('Verified evidence text 1').fill('Synthetic verified text');
  await page.getByLabel('Confirmation reason 1').fill('Synthetic comparison');
  await screenshot(page, 'D01-reviewer-dirty');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.reload({ timeout: 2000 }).catch(() => {});
  expect(dialogs).toEqual(['beforeunload']);
  await expect(page.getByLabel('Private decision rationale')).toHaveValue(
    'Synthetic private rationale',
  );
  await expect(page.getByLabel('Score for Evidence', { exact: true })).toHaveValue('83');
  await expect(page.getByLabel('Feedback for Evidence', { exact: true })).toHaveValue(
    'Synthetic member feedback',
  );
  await expect(page.getByLabel('Verified evidence text 1')).toHaveValue('Synthetic verified text');
  await expect(page.getByLabel('Confirmation reason 1')).toHaveValue('Synthetic comparison');
  expect(errors).toEqual([]);
});
test('D01 confirmed file evidence becomes clean without losing an unrelated review draft', async ({
  page,
}) => {
  await boot(page, async (route) => {
    if (!route.request().url().includes('/api/assessments/reviews/')) return false;
    await route.fulfill({ json: route.request().method() === 'POST' ? { ok: true } : reviewData });
    return true;
  });
  await page.addScriptTag({ content: review });
  await page.getByText('Verify synthetic.txt', { exact: true }).click();
  await page.getByLabel('Verified evidence text 1').fill('Checked synthetic text');
  await page.getByLabel('Confirmation reason 1').fill('Checked against original');
  page.on('dialog', (d) => d.accept());
  await page.getByLabel('Score for Evidence', { exact: true }).fill('74');
  await page.getByRole('button', { name: 'Confirm file evidence' }).click();
  await expect(
    page.getByText('File evidence confirmed. Review scores against the updated evidence.'),
  ).toBeVisible();
  page.removeAllListeners('dialog');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.reload({ timeout: 2000 }).catch(() => {});
  expect(dialogs).toEqual(['beforeunload']);
  await expect(page.getByLabel('Score for Evidence', { exact: true })).toHaveValue('74');
  await page.getByLabel('Score for Evidence', { exact: true }).fill('');
  dialogs.length = 0;
  await page.reload({ timeout: 2000 }).catch(() => {});
  expect(dialogs).toEqual([]);
});
test('D01 uncertain reviewer decision stops newer writes and retains fields', async ({ page }) => {
  let posts = 0;
  await boot(page, async (route) => {
    if (!route.request().url().includes('/api/assessments/reviews/')) return false;
    if (route.request().method() === 'POST') {
      posts++;
      await route.abort('failed');
    } else
      await route.fulfill({
        json: {
          ...reviewData,
          attemptId: posts ? 'new-attempt' : reviewData.attemptId,
          version: posts ? 4 : 3,
        },
      });
    return true;
  });
  await page.addScriptTag({ content: review });
  await page.getByLabel('Private decision rationale').fill('Synthetic private rationale');
  await page
    .getByLabel('Member-safe return feedback', { exact: true })
    .fill('Synthetic public return guidance');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Reject and allow resubmission' }).click();
  await expect(page.getByRole('button', { name: 'Reject and allow resubmission' })).toBeDisabled();
  await expect(page.getByLabel('Private decision rationale')).toHaveValue(
    'Synthetic private rationale',
  );
  await page.getByRole('button', { name: 'Refresh review status' }).click();
  await expect(page.getByLabel('Private decision rationale')).toHaveValue(
    'Synthetic private rationale',
  );
  await expect(page.getByRole('button', { name: 'Reject and allow resubmission' })).toBeDisabled();
  expect(posts).toBe(1);
});
for (const action of ['switch', 'logout'])
  test('D01 ' + action + ' canceled guard sends zero context mutations', async ({ page }) => {
    const events: string[] = [];
    const errors = await boot(page, async (route) => {
      const u = new URL(route.request().url());
      if (['/dashboard', '/login'].includes(u.pathname)) {
        await route.fulfill({ contentType: 'text/html', body: '<h1>Synthetic destination</h1>' });
        return true;
      }
      if (u.pathname === '/api/auth/context') {
        await route.fulfill({
          json: {
            csrf: 'inert',
            installed: true,
            user: {
              id: 'synthetic-user',
              name: 'Synthetic coordinator',
              environment: 'test',
              global_admin: false,
            },
            client: { id: 'synthetic-client', name: 'Synthetic A' },
            canCoordinate: true,
          },
        });
        return true;
      }
      if (u.pathname === '/api/clients') {
        await route.fulfill({
          json: [
            { id: 'synthetic-client', name: 'Synthetic A' },
            { id: 'synthetic-b', name: 'Synthetic B' },
          ],
        });
        return true;
      }
      if (u.pathname.startsWith('/api/branding/')) {
        await route.fulfill({
          json: {
            displayName: 'Synthetic',
            appName: 'Synthetic',
            mode: 'white-label',
            selectedTheme: 'light',
            logo: null,
            palettes: {},
            platformPalettes: {},
          },
        });
        return true;
      }
      if (['/api/clients/select', '/api/auth/logout'].includes(u.pathname)) {
        events.push('POST ' + u.pathname);
        await route.fulfill({ json: { ok: true } });
        return true;
      }
      return false;
    });
    await page.locator('#builder').evaluate((e) => e.remove());
    await page.addScriptTag({ content: shell });
    await expect(page.getByRole('button', { name: 'Switch client', exact: true })).toBeEnabled();
    await page.addScriptTag({ content: builder });
    await page.locator('#assessment-title').fill('Dirty synthetic context draft');
    page.on('dialog', async (d) => {
      events.push(d.type());
      await d.dismiss();
    });
    if (action === 'switch') {
      await page.locator('#active-client').selectOption('synthetic-b');
      await page.getByRole('button', { name: 'Switch client', exact: true }).click();
    } else await page.getByRole('button', { name: /sign out/i }).click();
    await expect.poll(() => events.length).toBe(1);
    expect(events).toEqual(['confirm']);
    await expect(page.getByRole('button', { name: 'Switch client', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeEnabled();
    await expect(page.locator('#assessment-title')).toHaveValue('Dirty synthetic context draft');
    await screenshot(page, 'D01-' + action + '-canceled-before-post');
    page.removeAllListeners('dialog');
    events.length = 0;
    page.on('dialog', async (d) => {
      events.push(d.type());
      await d.accept();
    });
    if (action === 'switch')
      await page.getByRole('button', { name: 'Switch client', exact: true }).click();
    else await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('heading', { name: 'Synthetic destination' })).toBeVisible();
    expect(events).toEqual([
      'confirm',
      'POST ' + (action === 'switch' ? '/api/clients/select' : '/api/auth/logout'),
    ]);
    expect(errors).toEqual([]);
  });

for (const savedStatus of ['draft', 'published']) for (const outcome of ['409', 'lost-response']) {
  test(`D03 recovery ${savedStatus} ${outcome} retains complete local draft through denied/unavailable comparison and cancel`, async ({page}) => {
    const savedVersion = savedStatus === 'published' ? 3 : 2;
    let posts=0, access='allowed';
    await boot(page, async route => {
      const u=new URL(route.request().url());
      if(u.pathname==='/api/assessments/builder') {
        posts++;
        if(outcome==='409') await route.fulfill({status:409,json:{message:'Saved version changed'}});
        else await route.abort('failed');
        return true;
      }
      if(u.pathname==='/api/assessments/definitions') {
        if(access==='denied') await route.fulfill({status:403,json:{message:'Not authorized'}});
        else if(access==='unavailable') await route.abort('failed');
        else await route.fulfill({json:{...initial,status:savedStatus,version:savedVersion,title:'Concurrent saved content',questions:initial.questions.map(q=>({...q,prompt:'Other author prompt'}))}});
        return true;
      }
      return false;
    });
    await page.addScriptTag({content:builder});
    await page.locator('[data-section=review]').click();
    page.once('dialog',d=>d.accept());
    await page.locator('#publish-definition').click();
    await expect(page.locator('#save-status')).toContainText('saved version changed');
    await expect(page.locator('#save-status')).not.toContainText('unknown');
    await expect(page.locator('#save-definition')).toBeDisabled();
    await expect(page.locator('#publish-definition')).toBeDisabled();
    const compare=page.getByRole('button',{name:'Compare with saved definition'});
    await expect(compare).toBeVisible();
    await page.evaluate(() => { const a=document.createElement('a'); a.href='/'; a.textContent='Recovery navigation probe'; document.body.append(a); });
    const leaveDialogs:string[]=[];
    const cancelLeave=async (d:any)=>{leaveDialogs.push(d.type());await d.dismiss();};
    page.on('dialog',cancelLeave);
    await page.getByRole('link',{name:'Recovery navigation probe'}).click();
    expect(leaveDialogs).toEqual(['confirm']);
    page.off('dialog',cancelLeave);
    for(access of ['denied','unavailable']) {
      await compare.click();
      await expect(page.locator('#definition-comparison')).toContainText('Comparison unavailable');
      await expect(page.getByRole('button',{name:'Discard local edits and reload'})).toHaveCount(0);
      await expect(page.locator('#assessment-title')).toHaveValue(initial.title);
    }
    access='allowed';
    await compare.click();
    await page.getByText('Private structured comparison',{exact:true}).click();
    const local=JSON.parse(await page.locator('#definition-comparison pre').first().innerText());
    for(const key of Object.keys(initial)) expect(local[key]).toEqual(initial[key as keyof typeof initial]);
    expect(JSON.parse(await page.locator('#definition-comparison pre').last().innerText()).version).toBe(savedVersion);
    page.once('dialog',d=>d.dismiss());
    await page.getByRole('button',{name:'Discard local edits and reload'}).click();
    await expect(page.locator('#assessment-title')).toHaveValue(initial.title);
    await expect(page.locator('#save-definition')).toBeDisabled();
    expect(posts).toBe(1);
    // Close the long comparison disclosure before navigating beneath the sticky header.
    await page.getByText('Private structured comparison',{exact:true}).click();
    await page.locator('[data-section=details]').click();
    await page.locator('[data-section=review]').click();
    await expect(page.locator('#learner-preview')).toContainText('draft · version 1');
    await expect(page.locator('#assign-definition')).toBeHidden();
    await expect(page.locator('#save-status')).not.toContainText('Publication confirmed');
    await compare.click();
    await page.getByText('Private structured comparison',{exact:true}).click();
    expect(JSON.parse(await page.locator('#definition-comparison pre').first().innerText())).toEqual(local);
    await screenshot(page,`D03-${savedStatus}-${outcome}-comparison-cancel`);
    // Explicitly accepted discard reloads the document, never issues another mutation.
    page.once('dialog',d=>d.accept());
    await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Discard local edits and reload'}).click()]);
    expect(posts).toBe(1);
  });
}

// Independent negative case: a confirmed conflict is not an unknown network outcome.
test('QA-D03 changed server draft after publication conflict offers recovery comparison', async ({page}) => {
  let posts=0;
  await boot(page,async route=>{
    const u=new URL(route.request().url());
    if(u.pathname==='/api/assessments/builder') { posts++; await route.fulfill({status:409,json:{message:'Saved version changed',code:'stale_definition'}});return true; }
    if(u.pathname==='/api/assessments/definitions') { await route.fulfill({json:{...initial,version:2,title:'Concurrent saved draft'}});return true; }
    return false;
  });
  await page.addScriptTag({content:builder});
  await page.locator('[data-section=review]').click();
  page.on('dialog',d=>d.accept());
  await page.locator('#publish-definition').click();
  await expect(page.locator('#save-status')).toContainText('saved version changed');
  expect(posts).toBe(1);
  await screenshot(page,'QA-D03-changed-draft-recovery');
  await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
});

for (const outcome of ['409', 'lost-response']) test(`REVIEW-D03 newer published content must not confirm the local saved version ${outcome}`, async ({page}) => {
  let posts=0;
  await boot(page, async route => {
    const u=new URL(route.request().url());
    if(u.pathname==='/api/assessments/builder') {
      posts++; expect(route.request().postDataJSON()).toMatchObject({action:'publish',expected_version:1});
      if(outcome==='409') await route.fulfill({status:409,json:{message:'Definition changed'}});
      else await route.abort('failed');
      return true;
    }
    if(u.pathname==='/api/assessments/definitions') {
      await route.fulfill({json:{...initial,status:'published',version:3,title:'OTHER AUTHOR published content',questions:initial.questions.map(q=>({...q,prompt:'OTHER AUTHOR changed prompt'}))}});return true;
    }
    return false;
  });
  await page.addScriptTag({content:builder});
  await page.locator('[data-section=review]').click();
  page.once('dialog',d=>d.accept());
  await page.locator('#publish-definition').click();
  await expect(page.locator('#save-status')).not.toContainText('Publishing assessment');
  await page.locator('[data-section=details]').click();
  await page.locator('[data-section=review]').click();
  await screenshot(page,`REVIEW-D03-newer-published-${outcome}`);
  expect(posts).toBe(1);
  await expect(page.locator('#save-definition')).toBeDisabled();
  await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
  await expect(page.locator('#definition-provenance')).toContainText('edit version 1');
});

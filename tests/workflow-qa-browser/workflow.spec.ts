import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
const origin = 'https://workflow-qa.invalid';
const shots = 'docs/assessment-workflow-implementation/qa-screenshots';
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
    `import {createRoot} from 'react-dom/client';import {ResponseQuestions} from './apps/web/app/components/response-questions';createRoot(document.getElementById('learner')).render(<ResponseQuestions questions={window.fixture.questions.slice(2)} answers={{}} onChange={()=>{}}/>);createRoot(document.getElementById('history')).render(<ResponseQuestions questions={window.fixture.questions} answers={{}}/>);`,
  );
});
async function boot(page: Page, handler?: (route: any) => Promise<boolean>) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    if (handler && (await handler(route))) return;
    const u = route.request().url();
    if (u === origin + '/')
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
test('D04 observes reset and inconsistent second-section references', async ({ page }) => {
  const errors = await boot(page);
  await page.addScriptTag({ content: builder });
  await page.locator('[data-section=review]').click();
  await expect(page.locator('#learner-preview')).toContainText('Question 3');
  await page.locator('[name=preview-B1][value=yes]').check();
  await page.locator('[data-section=details]').click();
  await page.locator('#assessment-title').fill('Unsaved local title');
  await page.locator('[data-section=review]').click();
  await expect(page.locator('[name=preview-B1][value=yes]')).not.toBeChecked();
  await expect(page.locator('#learner-preview')).toContainText('Unsaved local title');
  await expect(page.locator('#learner-preview')).not.toContainText('responses are not saved');
  await page.addScriptTag({ content: responses });
  await expect(page.locator('#learner h3').first()).toHaveText('Question 1');
  await expect(page.locator('#history h3').nth(2)).toHaveText('Question 3');
  await screenshot(page, 'D04-section-preview-history');
  expect(errors).toEqual([]);
});
test('D03 observes false definitive publication failure then blind version retry', async ({
  page,
}) => {
  const posts: any[] = [];
  let committed = false;
  const errors = await boot(page, async (route) => {
    if (!route.request().url().endsWith('/api/assessments/builder')) return false;
    posts.push(route.request().postDataJSON());
    if (!committed) {
      committed = true;
      await route.abort('failed');
    } else
      await route.fulfill({
        status: 409,
        json: { message: 'This revision is no longer a draft.' },
      });
    return true;
  });
  await page.addScriptTag({ content: builder });
  await page.locator('[data-section=review]').click();
  page.on('dialog', (d) => d.accept());
  await page.locator('#publish-definition').click();
  await expect(page.locator('#save-status')).toContainText(
    'Publication failed. Your saved draft is preserved.',
  );
  await expect(page.locator('#publish-definition')).toBeEnabled();
  await page.locator('#publish-definition').click();
  await expect(page.locator('#save-status')).toContainText('no longer a draft');
  expect(posts).toHaveLength(2);
  expect(posts[1]).toEqual(posts[0]);
  await screenshot(page, 'D03-unknown-publication');
  expect(errors).toEqual([]);
});
test('D03 stale save preserves fields but does not stop another write', async ({ page }) => {
  const posts: any[] = [];
  const errors = await boot(page, async (route) => {
    if (!route.request().url().endsWith('/api/assessments/builder')) return false;
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 409, json: { message: 'Stale version' } });
    return true;
  });
  await page.addScriptTag({ content: builder });
  await page.locator('#assessment-title').fill('Local conflict title');
  await page.locator('#save-definition').click();
  await expect(page.locator('#builder-errors')).toContainText('copy them before reloading');
  await expect(page.locator('#assessment-title')).toHaveValue('Local conflict title');
  await page.locator('#save-definition').click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].expected_version).toBe(posts[0].expected_version);
  expect(posts[1].save_token).not.toBe(posts[0].save_token);
  await screenshot(page, 'D03-conflict-retry');
  expect(errors).toEqual([]);
});
test('D06 existing published handoff targets exact ID; D08 saved copy lacks provenance', async ({
  page,
}) => {
  const errors = await boot(page, async (route) => {
    if (!route.request().url().endsWith('/api/assessments/builder')) return false;
    await route.fulfill({
      json: { id: 'synthetic-copy', version: 1, status: 'draft', readiness: {} },
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
  await expect(page.locator('#builder')).not.toContainText('synthetic-definition');
  await screenshot(page, 'D08-copy-provenance');
  expect(errors).toEqual([]);
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
test('D01 reviewer reload loses score feedback rationale and verified file text without warning', async ({
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
  await page.reload();
  await page.addScriptTag({ content: review });
  await expect(page.getByLabel('Private decision rationale')).toHaveValue('');
  await expect(page.getByLabel('Score for Evidence', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Feedback for Evidence', { exact: true })).toHaveValue('');
  await page.getByText('Verify synthetic.txt', { exact: true }).click();
  await expect(page.getByLabel('Verified evidence text 1')).toHaveValue('');
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
});
for (const action of ['switch', 'logout'])
  test('D01 ' + action + ' POST occurs before canceled builder unload', async ({ page }) => {
    const events: string[] = [];
    const errors = await boot(page, async (route) => {
      const u = new URL(route.request().url());
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
    await expect.poll(() => events.length).toBe(2);
    expect(events).toEqual([
      'POST ' + (action === 'switch' ? '/api/clients/select' : '/api/auth/logout'),
      'beforeunload',
    ]);
    await expect(page.locator('#assessment-title')).toHaveValue('Dirty synthetic context draft');
    await screenshot(page, 'D01-' + action + '-canceled-after-post');
    expect(errors).toEqual([]);
  });

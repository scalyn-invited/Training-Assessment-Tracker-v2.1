import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';

// Actual production component + styles, synthetic transport only. No app server,
// database, credentials, AI, email, or network listener is used by this harness.
const origin = 'http://d05.invalid';
let bundle: string;
let css: string;
const objective = { percentage: 100, correct: 1, total: 1 };
const result = {
  criteria: [],
  categories: {},
  total: 90,
  threshold: 70,
  success: true,
  rubric_applicable: true,
  objective,
};
function fixture(approvedAttempt: string | null, attemptId = 'attempt-current') {
  return {
    status: approvedAttempt === attemptId ? 'approved' : 'submitted',
    canAnalyze: false,
    files: [],
    version: 3,
    member: false,
    canReview: true,
    attemptId,
    definitionId: 'synthetic-definition',
    revision: 1,
    rubricApplicable: true,
    objective,
    appeal: null,
    approved: approvedAttempt
      ? {
          attempt_id: approvedAttempt,
          approved_at: '2026-01-01T00:00:00Z',
          result,
          criterionLabels: {},
        }
      : null,
    reviews: [],
    rubric: { threshold: 70, criteria: [] },
    evidence: [],
  };
}

test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';
        import {AssessmentReview} from './apps/web/app/components/assessment-review';
        createRoot(document.getElementById('root')).render(<AssessmentReview
          id="synthetic-assignment" client="synthetic-client" csrf="inert-test-value"
          status="approved" complete={()=>{}} onStatus={()=>{}} />);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  bundle = output.outputFiles[0].text;
  css = (
    await Promise.all(
      ['globals', 'workspace', 'directory', 'assessments'].map((name) =>
        readFile(`apps/web/app/${name}.css`, 'utf8'),
      ),
    )
  ).join('\n');
  await mkdir('docs/assessment-workflow-implementation/correction-frontend/screenshots', { recursive: true });
});

for (const scenario of [
  { name: 'current approved attempt', approvedAttempt: 'attempt-current', approved: true },
  { name: 'pending attempt', approvedAttempt: null, approved: false },
  {
    name: 'newer attempt with earlier approval',
    approvedAttempt: 'attempt-earlier',
    approved: false,
  },
])
  test(scenario.name + ' keeps accurate copy and review controls', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error(error.message);
    });
    const data = fixture(scenario.approvedAttempt);
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (url === origin + '/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>D05 synthetic component QA</title></head><body><main><h1>D05 synthetic review</h1><div id="root"></div></main></body></html>',
        });
      if (
        url.startsWith(origin + '/api/assessments/reviews/') &&
        route.request().method() === 'GET'
      )
        return route.fulfill({ json: data });
      throw new Error('Unexpected network request: ' + route.request().method() + ' ' + url);
    });
    await page.goto(origin);
    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: bundle });
    const automatic = page.locator('section.panel').filter({
      has: page.getByRole('heading', { name: 'Automatic multiple-choice score', exact: true }),
    });
    if (scenario.approved) {
      await expect(automatic).toContainText(
        'This automatic score uses the assigned revision. The result above was approved.',
      );
      await expect(automatic).not.toContainText('Human approval is still required.');
    } else {
      await expect(automatic).toContainText(
        'This uses the assigned revision. Human approval is still required.',
      );
      await expect(automatic).not.toContainText('The result above was approved.');
    }
    await expect(
      page.getByRole('button', { name: 'Approve reviewed result', exact: true }),
    ).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Reject and allow resubmission' })).toBeEnabled();
    const approved = page
      .locator('section.panel')
      .filter({ has: page.getByRole('heading', { name: 'Approved result', exact: true }) });
    if (scenario.approvedAttempt) {
      await expect(approved).toContainText('Rubric score: 90');
      await expect(approved).toContainText('Multiple-choice score: 100%');
    } else await expect(approved).toHaveCount(0);
    const slug = scenario.name.replaceAll(' ', '-');
    await page.screenshot({
      path: `docs/assessment-workflow-implementation/correction-frontend/screenshots/D05-${slug}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 667 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `docs/assessment-workflow-implementation/correction-frontend/screenshots/D05-${slug}-mobile.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

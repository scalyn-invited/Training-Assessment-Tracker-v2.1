import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
let script: string;
test.beforeAll(async () => {
  script = (
    await build({
      stdin: {
        contents: `import {createRoot} from 'react-dom/client';import {AssessmentResponse} from './apps/web/app/components/assessment-response';createRoot(document.getElementById('root')).render(<AssessmentResponse id='assignment'/>);`,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      write: false,
      platform: 'browser',
      jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: [
        {
          name: 'router-seam',
          setup(b) {
            b.onResolve({ filter: /^next\/navigation$/ }, () => ({
              path: 'nav',
              namespace: 'test',
            }));
            b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
              contents: `const router={replace:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/assessments/assignments/assignment';`,
            }));
          },
        },
      ],
    })
  ).outputFiles[0].text;
});
test('D01 learner shares pre-context guard and blocks unknown autosave outcome', async ({
  page,
}) => {
  let contextPosts = 0,
    savePosts = 0;
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    let json: unknown;
    if (u.pathname === '/')
      return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
    if (u.pathname === '/api/auth/context')
      json = {
        csrf: 'inert',
        installed: true,
        user: { id: 'member', name: 'Synthetic member', environment: 'test' },
        client: { id: 'client-a', name: 'A' },
      };
    else if (u.pathname === '/api/clients')
      json = [
        { id: 'client-a', name: 'A' },
        { id: 'client-b', name: 'B' },
      ];
    else if (u.pathname.startsWith('/api/branding/'))
      json = {
        displayName: 'Synthetic',
        appName: 'Synthetic',
        mode: 'white-label',
        selectedTheme: 'light',
        logo: null,
        palettes: {},
        platformPalettes: {},
      };
    else if (u.pathname === '/api/assessments/assignments/assignment')
      json = {
        id: 'assignment',
        enrolmentId: 'record',
        title: 'Synthetic response',
        memberName: 'Synthetic member',
        revision: 1,
        version: 1,
        status: 'draft',
        member: true,
        appealOpen: false,
        definition: {
          questions: [
            { id: 'q', type: 'open_response', prompt: 'Explain your evidence', choices: [] },
          ],
          sections: null,
        },
        draft: { responses: {}, context: null, files: [] },
        attempts: [],
      };
    else if (u.pathname === '/api/assessments/reviews/assignment')
      json = {
        files: [],
        reviews: [],
        evidence: [],
        status: 'draft',
        version: 1,
        member: true,
        canReview: false,
        attemptId: null,
        appeal: null,
        approved: null,
      };
    else if (u.pathname === '/api/enrolments/record/files') json = { files: [] };
    else if (u.pathname === '/api/assessments/responses/assignment') {
      savePosts++;
      await route.abort('failed');
      return;
    } else if (u.pathname === '/api/clients/select') {
      contextPosts++;
      json = { ok: true };
    } else throw Error('Unexpected fixture request ' + u.pathname);
    return route.fulfill({ json });
  });
  await page.goto('https://learner-guard.invalid');
  await page.addScriptTag({ content: script });
  await page.getByLabel('Additional context (optional)').fill('Retain learner draft');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.locator('#active-client').selectOption('client-b');
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  expect(contextPosts).toBe(0);
  expect(dialogs).toEqual(['confirm']);
  await expect(page.getByLabel('Additional context (optional)')).toHaveValue(
    'Retain learner draft',
  );
  await expect.poll(() => savePosts).toBe(1);
  dialogs.length = 0;
  await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  expect(contextPosts).toBe(0);
  expect(dialogs).toEqual(['alert']);
});

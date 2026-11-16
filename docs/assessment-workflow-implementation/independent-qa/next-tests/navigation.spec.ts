import { test, expect } from '@playwright/test';
// Real Next renderer/router; every API response is a synthetic transport fixture.
// No server-side authentication/domain/DB claim is made by this test.
test('D01 real Next sidebar and history preserve dirty builder; clean SPA navigation proceeds', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const row = {
    id: 'synthetic-definition',
    title: 'Synthetic saved draft',
    status: 'draft',
    revision: 1,
    version: 1,
    questions: [{ id: 'q', type: 'open_response', prompt: 'Synthetic prompt', choices: [] }],
    sections: null,
    rubric: { criteria: [], threshold: null },
    answer_key: {},
  };
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== 'http://127.0.0.1:3275')
      throw Error('Unexpected external request ' + u.origin);
    if (!u.pathname.startsWith('/api/')) return route.continue();
    let json: unknown;
    switch (u.pathname) {
      case '/api/auth/context':
        json = {
          csrf: 'inert',
          installed: true,
          user: {
            id: 'synthetic',
            name: 'Synthetic author',
            environment: 'test',
            global_admin: false,
          },
          client: { id: 'synthetic-client', name: 'Synthetic A' },
          canCoordinate: true,
        };
        break;
      case '/api/clients':
        json = [{ id: 'synthetic-client', name: 'Synthetic A' }];
        break;
      case '/api/assessments/assignments':
        json = { author: true, assignments: [], total: 0, page: 1 };
        break;
      case '/api/assessments/definitions':
        json = u.searchParams.has('id') ? row : { definitions: [row], total: 1, page: 1 };
        break;
      case '/api/assessments/appeals':
        json = { canRoute: false, cases: [], reviewers: [] };
        break;
      default:
        if (u.pathname.startsWith('/api/branding/'))
          json = {
            displayName: 'Synthetic',
            appName: 'Synthetic',
            mode: 'white-label',
            selectedTheme: 'light',
            logo: null,
            palettes: {},
            platformPalettes: {},
          };
        else throw Error('Unexpected API ' + u.pathname);
    }
    await route.fulfill({ json });
  });
  await page.goto('/assessments');
  await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
  await expect(page.locator('#assessment-title')).toHaveValue(row.title, { timeout: 60000 });
  await page.evaluate(() => {
    (window as any).__sameDocument = 'retained';
  });
  await page.locator('nav a[href="/assessments"]').first().click();
  await expect(page).toHaveURL(/\/assessments$/);
  expect(await page.evaluate(() => (window as any).__sameDocument)).toBe('retained');
  await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
  await page.locator('#assessment-title').fill('Unsaved Next input');
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.type());
    await d.dismiss();
  });
  await page.locator('nav a[href="/assessments"]').first().click();
  await expect(page.locator('#assessment-title')).toHaveValue('Unsaved Next input');
  expect(dialogs).toEqual(['confirm']);
  await page.evaluate(() => history.back());
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(page).toHaveURL(/\/definitions\/synthetic-definition$/);
  await expect(page.locator('#assessment-title')).toHaveValue('Unsaved Next input');
  await page.screenshot({
    path: 'docs/assessment-workflow-implementation/independent-qa/screenshots/D01-next-canceled.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

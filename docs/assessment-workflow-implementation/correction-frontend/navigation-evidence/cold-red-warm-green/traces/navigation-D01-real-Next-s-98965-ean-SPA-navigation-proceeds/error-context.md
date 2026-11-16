# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> D01 real Next sidebar and history preserve dirty builder; clean SPA navigation proceeds
- Location: docs\assessment-workflow-implementation\correction-frontend\next-tests\navigation.spec.ts:4:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: locator('#assessment-title')
Expected: "Synthetic saved draft"
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" locator('#assessment-title') with timeout 60000ms
  - waiting for locator('#assessment-title')

```

```yaml
- link "Skip to content":
  - /url: "#main"
- alert
- complementary "Workspace menu":
  - link "Synthetic Synthetic":
    - /url: /dashboard
    - strong: Synthetic
    - text: Synthetic
  - paragraph: Learning workspace
  - navigation "Main navigation":
    - link "Overview":
      - /url: /dashboard
    - link "Learning plans":
      - /url: /dashboard#learning-plans
    - link "Review queue":
      - /url: /learning-reviews
    - link "Assessments":
      - /url: /assessments
    - link "Updates":
      - /url: /notifications
    - text: Manage
    - link "Appearance":
      - /url: /settings/appearance
  - group: Theme Light
  - status
- banner:
  - form "Active client":
    - text: Active client
    - combobox "Active client":
      - option "Choose client"
      - option "Synthetic A" [selected]
    - button "Switch client"
  - strong: Synthetic author
  - text: Current client access
  - button "Sign out"
- strong: LOCAL SANDBOX
- text: Synthetic people / Local password sign-in / No email delivery
- main:
  - paragraph: Synthetic A
  - heading "Assessments" [level=1]
  - paragraph:
    - link "Workspace":
      - /url: /dashboard
  - paragraph:
    - link "Build an assessment":
      - /url: /assessments/definitions/new
  - heading "Assessment definitions" [level=2]
  - paragraph: 1 revisions
  - table "Assessment definitions":
    - caption: Assessment definitions
    - rowgroup:
      - row "Assessment Revision Status Actions":
        - columnheader "Assessment"
        - columnheader "Revision"
        - columnheader "Status"
        - columnheader "Actions"
    - rowgroup:
      - row "Synthetic saved draft 1 draft Edit draft":
        - cell "Synthetic saved draft"
        - cell "1"
        - cell "draft"
        - cell "Edit draft":
          - link "Edit draft":
            - /url: /assessments/definitions/synthetic-definition
  - navigation "Assessment pages":
    - button "Previous revisions" [disabled]
    - text: Page 1
    - button "Next revisions" [disabled]
  - heading "Assigned assessments" [level=2]
  - table "Assigned assessments":
    - caption: Assigned assessments
    - rowgroup:
      - row "Assessment Member Status Actions":
        - columnheader "Assessment"
        - columnheader "Member"
        - columnheader "Status"
        - columnheader "Actions"
    - rowgroup:
      - row "No assessments are available for your current client and permissions.":
        - cell "No assessments are available for your current client and permissions."
  - navigation "Assignment pages":
    - button "Previous assignments" [disabled]
    - text: Page 1
    - button "Next assignments" [disabled]
- contentinfo: Synthetic Learning with purpose. Progress with evidence.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | // Real Next renderer/router; every API response is a synthetic transport fixture.
  3  | // No server-side authentication/domain/DB claim is made by this test.
  4  | test('D01 real Next sidebar and history preserve dirty builder; clean SPA navigation proceeds', async ({
  5  |   page,
  6  | }) => {
  7  |   const errors: string[] = [];
  8  |   page.on('pageerror', (e) => errors.push(e.message));
  9  |   const row = {
  10 |     id: 'synthetic-definition',
  11 |     title: 'Synthetic saved draft',
  12 |     status: 'draft',
  13 |     revision: 1,
  14 |     version: 1,
  15 |     questions: [{ id: 'q', type: 'open_response', prompt: 'Synthetic prompt', choices: [] }],
  16 |     sections: null,
  17 |     rubric: { criteria: [], threshold: null },
  18 |     answer_key: {},
  19 |   };
  20 |   await page.route('**/*', async (route) => {
  21 |     const u = new URL(route.request().url());
  22 |     if (u.origin !== 'http://127.0.0.1:3275')
  23 |       throw Error('Unexpected external request ' + u.origin);
  24 |     if (!u.pathname.startsWith('/api/')) return route.continue();
  25 |     let json: unknown;
  26 |     switch (u.pathname) {
  27 |       case '/api/auth/context':
  28 |         json = {
  29 |           csrf: 'inert',
  30 |           installed: true,
  31 |           user: {
  32 |             id: 'synthetic',
  33 |             name: 'Synthetic author',
  34 |             environment: 'test',
  35 |             global_admin: false,
  36 |           },
  37 |           client: { id: 'synthetic-client', name: 'Synthetic A' },
  38 |           canCoordinate: true,
  39 |         };
  40 |         break;
  41 |       case '/api/clients':
  42 |         json = [{ id: 'synthetic-client', name: 'Synthetic A' }];
  43 |         break;
  44 |       case '/api/assessments/assignments':
  45 |         json = { author: true, assignments: [], total: 0, page: 1 };
  46 |         break;
  47 |       case '/api/assessments/definitions':
  48 |         json = u.searchParams.has('id') ? row : { definitions: [row], total: 1, page: 1 };
  49 |         break;
  50 |       case '/api/assessments/appeals':
  51 |         json = { canRoute: false, cases: [], reviewers: [] };
  52 |         break;
  53 |       default:
  54 |         if (u.pathname.startsWith('/api/branding/'))
  55 |           json = {
  56 |             displayName: 'Synthetic',
  57 |             appName: 'Synthetic',
  58 |             mode: 'white-label',
  59 |             selectedTheme: 'light',
  60 |             logo: null,
  61 |             palettes: {},
  62 |             platformPalettes: {},
  63 |           };
  64 |         else throw Error('Unexpected API ' + u.pathname);
  65 |     }
  66 |     await route.fulfill({ json });
  67 |   });
  68 |   await page.goto('/assessments');
  69 |   await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
> 70 |   await expect(page.locator('#assessment-title')).toHaveValue(row.title, { timeout: 60000 });
     |                                                   ^ Error: expect(locator).toHaveValue(expected) failed
  71 |   await page.evaluate(() => {
  72 |     (window as any).__sameDocument = 'retained';
  73 |   });
  74 |   await page.locator('nav a[href="/assessments"]').first().click();
  75 |   await expect(page).toHaveURL(/\/assessments$/);
  76 |   expect(await page.evaluate(() => (window as any).__sameDocument)).toBe('retained');
  77 |   await page.getByRole('link', { name: 'Edit draft', exact: true }).click();
  78 |   await page.locator('#assessment-title').fill('Unsaved Next input');
  79 |   const dialogs: string[] = [];
  80 |   page.on('dialog', async (d) => {
  81 |     dialogs.push(d.type());
  82 |     await d.dismiss();
  83 |   });
  84 |   await page.locator('nav a[href="/assessments"]').first().click();
  85 |   await expect(page.locator('#assessment-title')).toHaveValue('Unsaved Next input');
  86 |   expect(dialogs).toEqual(['confirm']);
  87 |   await page.evaluate(() => history.back());
  88 |   await expect.poll(() => dialogs.length).toBe(2);
  89 |   await expect(page).toHaveURL(/\/definitions\/synthetic-definition$/);
  90 |   await expect(page.locator('#assessment-title')).toHaveValue('Unsaved Next input');
  91 |   await page.screenshot({
  92 |     path: 'docs/assessment-workflow-implementation/correction-frontend/screenshots/D01-next-canceled.png',
  93 |     fullPage: true,
  94 |   });
  95 |   expect(errors).toEqual([]);
  96 | });
  97 | 
```
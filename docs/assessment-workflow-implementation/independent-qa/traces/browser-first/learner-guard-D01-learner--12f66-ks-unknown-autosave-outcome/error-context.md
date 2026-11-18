# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: learner-guard.spec.ts >> D01 learner shares pre-context guard and blocks unknown autosave outcome
- Location: docs\assessment-workflow-implementation\independent-qa\browser-tests\learner-guard.spec.ts:34:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Array [
-   "confirm",
+   "alert",
  ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - button "Open navigation" [ref=e4]
    - text: Synthetic
  - complementary "Workspace menu" [ref=e7]:
    - generic [ref=e8]:
      - link [ref=e9] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=e10]:
          - strong [ref=e11]: Synthetic
          - text: Synthetic
      - button "Close navigation" [ref=e12]
    - paragraph [ref=e15]: Learning workspace
    - navigation "Main navigation" [ref=e16]:
      - link "Overview" [ref=e17] [cursor=pointer]:
        - /url: /dashboard
      - link "Learning plans" [ref=e20] [cursor=pointer]:
        - /url: /dashboard#learning-plans
      - link "Assessments" [ref=e23] [cursor=pointer]:
        - /url: /assessments
      - link "Updates" [ref=e27] [cursor=pointer]:
        - /url: /notifications
      - text: Manage
      - link "Appearance" [ref=e30] [cursor=pointer]:
        - /url: /settings/appearance
    - generic [ref=e34]:
      - paragraph [ref=e35]: One step at a timeProgress startswith showing up.
      - generic [ref=e36]:
        - group [ref=e37]:
          - generic "ThemeLight" [ref=e38]
        - status
  - generic [ref=e41]:
    - banner [ref=e42]:
      - form "Active client" [ref=e43]:
        - text: Active client
        - generic [ref=e44]:
          - combobox "Active client" [ref=e45]:
            - option "Choose client"
            - option "A"
            - option "B" [selected]
          - button "Switch client" [active] [ref=e46]
      - generic [ref=e47]:
        - text: S
        - generic [ref=e48]:
          - strong [ref=e49]: Synthetic member
          - text: Current client access
        - button "Sign out" [ref=e50]
    - generic [ref=e53]:
      - strong [ref=e54]: LOCAL SANDBOX
      - generic [ref=e55]: Synthetic people / Local password sign-in / No email delivery
    - main [ref=e56]:
      - paragraph [ref=e57]:
        - link "Back to assessments" [ref=e58] [cursor=pointer]:
          - /url: /assessments
      - paragraph [ref=e59]: A / Revision 1
      - heading "Synthetic response" [level=1] [ref=e60]
      - paragraph [ref=e61]: Synthetic member - draft
      - generic [ref=e62]:
        - heading "Your response" [level=2] [ref=e63]
        - status [ref=e64]: Changes need attention.
        - alert [ref=e65]: The save outcome could not be confirmed. Retry the same request before continuing. Your answers remain here.
        - button "Retry save" [ref=e66]
      - group "Assessment answers" [ref=e67]:
        - generic [ref=e69]:
          - heading "Question 1" [level=3] [ref=e70]
          - paragraph [ref=e71]: Explain your evidence
          - generic [ref=e72]:
            - text: Your answer
            - textbox "Question 1" [ref=e73]
        - generic [ref=e74]:
          - text: Additional context (optional)
          - textbox "Additional context (optional)" [ref=e75]: Retain learner draft
      - generic [ref=e76]:
        - heading "Supporting evidence" [level=2] [ref=e77]
        - paragraph [ref=e78]: Attach up to five clean files. PDF, DOCX, TXT, PNG or JPEG; up to 20 MiB each. Files awaiting scanning cannot be attached.
        - paragraph [ref=e79]: No supporting files uploaded yet.
        - button "Refresh evidence" [ref=e80]
        - generic [ref=e81]:
          - generic [ref=e82]:
            - text: Upload supporting evidence
            - button "Upload supporting evidence" [ref=e83]
          - button "Upload evidence" [ref=e84]
      - generic [ref=e85]:
        - button "Save draft" [disabled] [ref=e86]
        - button "Submit response" [disabled] [ref=e87]
      - region "Assessment review and results"
    - contentinfo [ref=e88]: SyntheticLearning with purpose. Progress with evidence.
```

# Test source

```ts
  21  |             b.onResolve({ filter: /^next\/navigation$/ }, () => ({
  22  |               path: 'nav',
  23  |               namespace: 'test',
  24  |             }));
  25  |             b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
  26  |               contents: `const router={replace:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/assessments/assignments/assignment';`,
  27  |             }));
  28  |           },
  29  |         },
  30  |       ],
  31  |     })
  32  |   ).outputFiles[0].text;
  33  | });
  34  | test('D01 learner shares pre-context guard and blocks unknown autosave outcome', async ({
  35  |   page,
  36  | }) => {
  37  |   let contextPosts = 0,
  38  |     savePosts = 0;
  39  |   await page.route('**/*', async (route) => {
  40  |     const u = new URL(route.request().url());
  41  |     let json: unknown;
  42  |     if (u.pathname === '/')
  43  |       return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
  44  |     if (u.pathname === '/api/auth/context')
  45  |       json = {
  46  |         csrf: 'inert',
  47  |         installed: true,
  48  |         user: { id: 'member', name: 'Synthetic member', environment: 'test' },
  49  |         client: { id: 'client-a', name: 'A' },
  50  |       };
  51  |     else if (u.pathname === '/api/clients')
  52  |       json = [
  53  |         { id: 'client-a', name: 'A' },
  54  |         { id: 'client-b', name: 'B' },
  55  |       ];
  56  |     else if (u.pathname.startsWith('/api/branding/'))
  57  |       json = {
  58  |         displayName: 'Synthetic',
  59  |         appName: 'Synthetic',
  60  |         mode: 'white-label',
  61  |         selectedTheme: 'light',
  62  |         logo: null,
  63  |         palettes: {},
  64  |         platformPalettes: {},
  65  |       };
  66  |     else if (u.pathname === '/api/assessments/assignments/assignment')
  67  |       json = {
  68  |         id: 'assignment',
  69  |         enrolmentId: 'record',
  70  |         title: 'Synthetic response',
  71  |         memberName: 'Synthetic member',
  72  |         revision: 1,
  73  |         version: 1,
  74  |         status: 'draft',
  75  |         member: true,
  76  |         appealOpen: false,
  77  |         definition: {
  78  |           questions: [
  79  |             { id: 'q', type: 'open_response', prompt: 'Explain your evidence', choices: [] },
  80  |           ],
  81  |           sections: null,
  82  |         },
  83  |         draft: { responses: {}, context: null, files: [] },
  84  |         attempts: [],
  85  |       };
  86  |     else if (u.pathname === '/api/assessments/reviews/assignment')
  87  |       json = {
  88  |         files: [],
  89  |         reviews: [],
  90  |         evidence: [],
  91  |         status: 'draft',
  92  |         version: 1,
  93  |         member: true,
  94  |         canReview: false,
  95  |         attemptId: null,
  96  |         appeal: null,
  97  |         approved: null,
  98  |       };
  99  |     else if (u.pathname === '/api/enrolments/record/files') json = { files: [] };
  100 |     else if (u.pathname === '/api/assessments/responses/assignment') {
  101 |       savePosts++;
  102 |       await route.abort('failed');
  103 |       return;
  104 |     } else if (u.pathname === '/api/clients/select') {
  105 |       contextPosts++;
  106 |       json = { ok: true };
  107 |     } else throw Error('Unexpected fixture request ' + u.pathname);
  108 |     return route.fulfill({ json });
  109 |   });
  110 |   await page.goto('https://learner-guard.invalid');
  111 |   await page.addScriptTag({ content: script });
  112 |   await page.getByLabel('Additional context (optional)').fill('Retain learner draft');
  113 |   const dialogs: string[] = [];
  114 |   page.on('dialog', async (d) => {
  115 |     dialogs.push(d.type());
  116 |     await d.dismiss();
  117 |   });
  118 |   await page.locator('#active-client').selectOption('client-b');
  119 |   await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  120 |   expect(contextPosts).toBe(0);
> 121 |   expect(dialogs).toEqual(['confirm']);
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  122 |   await expect(page.getByLabel('Additional context (optional)')).toHaveValue(
  123 |     'Retain learner draft',
  124 |   );
  125 |   await expect.poll(() => savePosts).toBe(1);
  126 |   dialogs.length = 0;
  127 |   await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  128 |   expect(contextPosts).toBe(0);
  129 |   expect(dialogs).toEqual(['alert']);
  130 | });
  131 | 
```
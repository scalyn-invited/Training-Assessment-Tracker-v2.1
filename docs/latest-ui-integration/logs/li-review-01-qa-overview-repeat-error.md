# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: overview.spec.ts >> Overview design uses live scoped data, preserves access, and works on desktop and mobile
- Location: tests\overview-browser\overview.spec.ts:5:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator: getByRole('dialog', { name: 'Personal settings', exact: true }).locator('summary')
Expected: focused
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeFocused" getByRole('dialog', { name: 'Personal settings', exact: true }).locator('summary') with timeout 15000ms
  - waiting for getByRole('dialog', { name: 'Personal settings', exact: true }).locator('summary')

```

```yaml
- link "Skip to content":
  - /url: "#main"
- alert
- complementary "Platform workspace":
  - link "Scalyn — Overview":
    - /url: /platform
    - text: S
  - button "Workspace Platform administration":
    - text: Workspace
    - strong: Platform administration
- banner:
  - text: Local sandbox
  - button "Personal settings": O
  - strong: Overview reviewer
  - text: Global administration
  - button "Sign out"
- main:
  - heading "Platform overview" [level=1]: Overview
  - paragraph: What needs attention across the platform.
  - link "Manage clients":
    - /url: /platform/clients
    - text: Clients
    - strong: "6"
  - link "Review Global Admin access":
    - /url: /platform/admins
    - text: Global admins
    - strong: "1"
  - link "Accounts — active accounts with active sign-in identities":
    - /url: /platform/clients#client-account-access
    - text: Accounts
    - strong: "31"
  - region "Needs attention":
    - heading "Needs attention" [level=2]
    - text: "3"
    - list:
      - listitem:
        - heading "Only one active Global Admin" [level=3]
        - paragraph: Add another trusted administrator to maintain access continuity.
        - link "Review access":
          - /url: /platform/admins
      - listitem:
        - heading "Email delivery is not configured" [level=3]
        - paragraph: Configure the approved mail service and verify a test inbox before enabling delivery.
        - button "View system status"
      - listitem:
        - heading "AI generation is not configured" [level=3]
        - paragraph: Confirm the approved AI provider and verify a sample request before enabling generation.
        - button "View system status"
  - region "Recent administrative activity":
    - heading "Recent administrative activity" [level=2]
    - link "View audit log":
      - /url: /platform/audit
    - list:
      - listitem:
        - time: 2026-11-21 05:35:09 UTC
        - text: Platform client created Overview reviewer
      - listitem:
        - time: 2026-11-21 05:35:08 UTC
        - text: Platform client created Overview reviewer
      - listitem:
        - time: 2026-11-21 05:35:08 UTC
        - text: Platform client created Overview reviewer
- contentinfo: Assessment Training Tracker
- navigation "Mobile platform navigation":
  - link "Overview":
    - /url: /platform
  - link "Clients":
    - /url: /platform/clients
  - link "People & access":
    - /url: /platform/people
    - text: People
  - link "Audit log":
    - /url: /platform/audit
    - text: Audit
  - link "Settings":
    - /url: /platform/settings
- dialog "Personal settings":
  - heading "Personal settings" [level=2]
  - button "Close"
  - navigation "Account settings":
    - link "Platform appearance":
      - /url: /platform/settings
    - link "Global admins":
      - /url: /platform/admins
    - link "Manage account access":
      - /url: /accounts
    - link "Account security":
      - /url: /account/security
  - button "Theme Dark"
  - status
```

# Test source

```ts
  106 |         .violations,
  107 |     ).toEqual([]);
  108 |   }
  109 |   await accessibility();
  110 |   await page.screenshot({ path: `${screenshotDir}/overview-light-desktop.png`, fullPage: true });
  111 |   await page.getByRole('button', { name: /^Theme(?: |$)/ }).first().click();
  112 |   await page.getByRole('button', { name: 'Dark', exact: true }).click();
  113 |   await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  114 |   await accessibility();
  115 |   await page.screenshot({ path: `${screenshotDir}/overview-dark-desktop.png`, fullPage: true });
  116 | 
  117 |   // All exported assets must load at their intrinsic Figma dimensions.
  118 |   const assetErrors = await page.locator('img[src^="/images/overview/"]').evaluateAll((images) =>
  119 |     images.flatMap((node) => {
  120 |       const image = node as HTMLImageElement;
  121 |       if (!image.getClientRects().length) return [];
  122 |       const box = image.getBoundingClientRect();
  123 |       return image.complete &&
  124 |         image.naturalWidth > 0 &&
  125 |         box.width === image.naturalWidth &&
  126 |         box.height === image.naturalHeight
  127 |         ? []
  128 |         : [image.src];
  129 |     }),
  130 |   );
  131 |   expect(assetErrors).toEqual([]);
  132 | 
  133 |   const status = page.getByRole('button', { name: 'View system status' }).first();
  134 |   await status.click();
  135 |   const system = page.getByRole('dialog', { name: 'System overview' });
  136 |   await expect(system.getByText('Password sign-in', { exact: true })).toBeVisible();
  137 |   await accessibility();
  138 |   await page.keyboard.press('Escape');
  139 |   await expect(status).toBeFocused();
  140 |   await main.getByRole('link', { name: 'Review access', exact: true }).click();
  141 |   await expect(page).toHaveURL(/\/platform\/admins$/);
  142 |   await expect(page.getByRole('heading', { name: 'Global admins', exact: true })).toBeVisible();
  143 |   await page.goto('/platform');
  144 |   await page
  145 |     .getByRole('navigation', { name: 'Main navigation', exact: true })
  146 |     .getByRole('link', { name: 'People & access' })
  147 |     .click();
  148 |   await expect(page).toHaveURL(/\/platform\/people$/);
  149 |   await expect(page.getByRole('heading', { name: 'People & access' })).toBeVisible();
  150 |   await page.goto('/platform');
  151 | 
  152 |   // One section failing does not remove working metrics, and retry restores real data.
  153 |   await page.route('**/api/platform/audit', (route) =>
  154 |     route.fulfill({ status: 503, json: { message: 'Activity temporarily unavailable.' } }),
  155 |   );
  156 |   await page.route('**/api/platform/client-accounts', (route) =>
  157 |     route.fulfill({ status: 503, json: { message: 'Account count temporarily unavailable.' } }),
  158 |   );
  159 |   await page.reload();
  160 |   await expect(page.getByText('Activity temporarily unavailable.')).toBeVisible();
  161 |   await expect(page.getByText('Account count temporarily unavailable.')).toBeVisible();
  162 |   await expect(
  163 |     main.getByRole('link', { name: 'Manage clients', exact: true }).locator('strong'),
  164 |   ).toHaveText(String(expected.clients));
  165 |   await page.unroute('**/api/platform/audit');
  166 |   await page.unroute('**/api/platform/client-accounts');
  167 |   await page.getByRole('button', { name: 'Retry recent activity' }).click();
  168 |   await page.getByRole('button', { name: 'Retry account count' }).click();
  169 |   await expect(activity.getByRole('listitem')).toHaveCount(3);
  170 |   await expect(main.getByRole('link', { name: /^Accounts —/ }).locator('strong')).toHaveText(
  171 |     String(accounts.total),
  172 |   );
  173 | 
  174 |   // Explicit response fixtures exercise empty states without altering the saved installation.
  175 |   await page.route('**/api/platform/overview', (route) =>
  176 |     route.fulfill({
  177 |       json: { ...expected, clients: 0, activeAdmins: 2, emailConfigured: true, aiConfigured: true },
  178 |     }),
  179 |   );
  180 |   await page.route('**/api/platform/audit', (route) => route.fulfill({ json: { events: [] } }));
  181 |   await page.reload();
  182 |   await expect(page.getByRole('link', { name: 'Create first client' })).toBeVisible();
  183 |   await expect(page.getByText('No administrative activity recorded yet.')).toBeVisible();
  184 |   await expect(page.getByText('No configuration notices.', { exact: false })).toBeVisible();
  185 |   await page.getByRole('button', { name: 'View system status' }).click();
  186 |   await expect(system.getByText('Configured; delivery not verified here')).toBeVisible();
  187 |   await page.keyboard.press('Escape');
  188 |   await page.unroute('**/api/platform/overview');
  189 |   await page.unroute('**/api/platform/audit');
  190 |   await page.reload();
  191 | 
  192 |   await page.setViewportSize({ width: 390, height: 844 });
  193 |   const mobile = page.getByRole('navigation', { name: 'Mobile platform navigation' });
  194 |   await expect(mobile).toBeVisible();
  195 |   await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toBeHidden();
  196 |   await accessibility();
  197 |   await page.setViewportSize({ width: 390, height: 1458 });
  198 |   await page.screenshot({ path: `${screenshotDir}/overview-dark-mobile.png`, fullPage: true });
  199 |   await page.setViewportSize({ width: 390, height: 844 });
  200 |   await page.getByRole('button', { name: 'Personal settings' }).click();
  201 |   const settings = page.getByRole('dialog', { name: 'Personal settings', exact: true });
  202 |   await expect(settings.getByRole('link', { name: 'Account security', exact: true })).toBeVisible();
  203 |   await expect(settings.getByRole('link', { name: 'Global admins', exact: true })).toBeVisible();
  204 |   await settings.getByRole('button', { name: 'Close', exact: true }).focus();
  205 |   await page.keyboard.press('Shift+Tab');
> 206 |   await expect(settings.locator('summary')).toBeFocused();
      |                                             ^ Error: expect(locator).toBeFocused() failed
  207 |   await page.keyboard.press('Tab');
  208 |   await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  209 |   await settings.locator('summary').click();
  210 |   await settings.getByRole('button', { name: 'Light', exact: true }).click();
  211 |   await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  212 |   // Exercise the shared dialog's field boundary with an isolated DOM fixture. The old
  213 |   // button-only focus list skipped fields at either edge of a form dialog.
  214 |   await settings.evaluate((dialog) => {
  215 |     const field = document.createElement('input');
  216 |     field.setAttribute('aria-label', 'Dialog keyboard fixture');
  217 |     field.dataset.keyboardFixture = 'true';
  218 |     dialog.append(field);
  219 |     const disabled = document.createElement('fieldset');
  220 |     disabled.disabled = true;
  221 |     disabled.dataset.keyboardFixture = 'true';
  222 |     disabled.append(document.createElement('input'));
  223 |     dialog.append(disabled);
  224 |   });
  225 |   const fixture = settings.getByRole('textbox', { name: 'Dialog keyboard fixture' });
  226 |   await settings.getByRole('button', { name: 'Close', exact: true }).focus();
  227 |   await page.keyboard.press('Shift+Tab');
  228 |   await expect(fixture).toBeFocused();
  229 |   await page.keyboard.press('Tab');
  230 |   await expect(settings.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  231 |   await settings
  232 |     .locator('[data-keyboard-fixture]')
  233 |     .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
  234 |   await page.keyboard.press('Escape');
  235 |   await expect(page.getByRole('button', { name: 'Personal settings' })).toBeFocused();
  236 |   await page.reload();
  237 |   await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  238 |   await accessibility();
  239 |   await page.setViewportSize({ width: 390, height: 1458 });
  240 |   await page.screenshot({ path: `${screenshotDir}/overview-light-mobile.png`, fullPage: true });
  241 |   for (const width of [320, 768, 1024]) {
  242 |     await page.setViewportSize({ width, height: 900 });
  243 |     await accessibility();
  244 |   }
  245 |   const touchContext = await browser.newContext({
  246 |     storageState: await page.context().storageState(),
  247 |     viewport: { width: 390, height: 844 },
  248 |     isMobile: true,
  249 |     hasTouch: true,
  250 |   });
  251 |   try {
  252 |     const touch = await touchContext.newPage();
  253 |     await touch.goto(origin + '/platform');
  254 |     await expect(touch.getByRole('heading', { name: 'Needs attention' })).toBeVisible();
  255 |     expect(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
  256 |     for (const action of await touch.getByRole('button', { name: 'View system status' }).all()) {
  257 |       expect((await action.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  258 |     }
  259 |     expect(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
  260 |       true,
  261 |     );
  262 |     expect(
  263 |       (await new AxeBuilder({ page: touch }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
  264 |         .violations,
  265 |     ).toEqual([]);
  266 |     await touch.getByRole('button', { name: 'Personal settings' }).tap();
  267 |     await expect(
  268 |       touch.getByRole('dialog', { name: 'Personal settings', exact: true }),
  269 |     ).toBeVisible();
  270 |     await touch
  271 |       .getByRole('dialog', { name: 'Personal settings', exact: true })
  272 |       .getByRole('button', { name: 'Close', exact: true })
  273 |       .tap();
  274 |     await touch.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  275 |     const footer = await touch.locator('footer').boundingBox();
  276 |     const bottomNav = await touch
  277 |       .getByRole('navigation', { name: 'Mobile platform navigation' })
  278 |       .boundingBox();
  279 |     expect(footer!.y + footer!.height).toBeLessThanOrEqual(bottomNav!.y);
  280 |     await touch.screenshot({ path: `${screenshotDir}/overview-touch-mobile.png` });
  281 |   } finally {
  282 |     await touchContext.close();
  283 |   }
  284 |   await page.setViewportSize({ width: 390, height: 844 });
  285 |   await page.getByRole('button', { name: /^Workspace / }).click();
  286 |   await page.getByRole('link', { name: 'Choose your client' }).click();
  287 |   await page.getByRole('button', { name: 'Demo Client 1', exact: true }).click();
  288 |   await expect(page).toHaveURL(/\/dashboard$/);
  289 |   await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  290 |   const drawer = page.getByRole('dialog', { name: 'Workspace menu' });
  291 |   await expect(drawer).toBeVisible();
  292 |   await page.keyboard.press('Escape');
  293 |   await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
  294 |   await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  295 |   await expect(page).toHaveURL(/\/login$/);
  296 |   await page.getByLabel('Email', { exact: true }).fill('demo.1.3@example.invalid');
  297 |   await page.getByLabel('Password', { exact: true }).fill(demoPassword);
  298 |   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  299 |   await expect(page).toHaveURL(/\/clients$/);
  300 |   await page.goto('/platform');
  301 |   await expect(page.getByRole('heading', { name: 'Global Admin access required' })).toBeVisible();
  302 |   expect((await page.request.get('/api/platform/overview')).status()).toBe(403);
  303 |   expect((await page.request.get('/api/platform/audit')).status()).toBe(403);
  304 |   expect((await page.request.get('/api/platform/client-accounts')).status()).toBe(403);
  305 |   expect(errors).toEqual([]);
  306 | });
```
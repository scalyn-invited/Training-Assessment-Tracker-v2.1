# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> QA-D03 changed server draft after publication conflict offers recovery comparison
- Location: docs\assessment-workflow-implementation\independent-qa\browser-tests\workflow.spec.ts:654:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: 'Compare with saved definition' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('button', { name: 'Compare with saved definition' }) with timeout 5000ms
  - waiting for getByRole('button', { name: 'Compare with saved definition' })

```

```yaml
- heading "Synthetic isolated component QA" [level=1]
- link "Back to assessments":
  - /url: /assessments
- banner:
  - paragraph: ASSESSMENT BUILDER
  - heading "Build an assessment" [level=1]
  - paragraph: Draft synthetic-definition · revision 1 · edit version 1
  - paragraph: No direct copy source is recorded for this revision.
  - paragraph: Existing assignments and team rules remain pinned to their original published revision. Saving a published definition creates a separate draft; it does not migrate assignments.
  - status: "Publication outcome unknown: the saved version changed. Local edits are retained; reload only after comparing the current definition."
  - button "Check publication status"
  - button "Save draft" [disabled]
- paragraph: Build at your pace. Save incomplete work, then review before publishing. Existing assignments keep their published revision.
- navigation "Assessment sections":
  - button "1 Details"
  - button "2 Questions"
  - button "3 Rubric"
  - button "4 Review"
- region "Review assessment":
  - heading "Review assessment" [level=2]
  - heading "Readiness checklist" [level=3]
  - paragraph: Ready for publication checks. The server verifies the saved revision before publishing.
  - paragraph: Publishing freezes this revision for assignment. Existing assignments remain unchanged.
  - button "Publish assessment" [disabled]
  - region "Learner preview":
    - heading "Learner preview" [level=3]
    - paragraph: Answer keys and the author rubric are excluded from this preview.
    - heading "Synthetic two-section assessment" [level=4]
    - paragraph: Content preview — responses are not saved
    - paragraph: Saved revision 1 · draft · version 1
    - paragraph: "Content only: save, submission, permissions and file scanning are not simulated. Author rubric is separate; answer keys are not shown."
    - heading "Section A" [level=4]
    - paragraph: First section
    - article:
      - heading "Section A — Question 1" [level=4]
      - paragraph: Synthetic prompt A1
      - group "Choose one answer":
        - text: Choose one answer
        - radio "Yes"
        - text: "Yes"
        - radio "No"
        - text: "No"
    - article:
      - heading "Section A — Question 2" [level=4]
      - paragraph: Synthetic prompt A2
      - group "Choose one answer":
        - text: Choose one answer
        - radio "Yes"
        - text: "Yes"
        - radio "No"
        - text: "No"
    - heading "Section B" [level=4]
    - paragraph: Second section
    - article:
      - heading "Section B — Question 3" [level=4]
      - paragraph: Synthetic prompt B1
      - group "Choose one answer":
        - text: Choose one answer
        - radio "Yes"
        - text: "Yes"
        - radio "No"
        - text: "No"
    - article:
      - heading "Section B — Question 4" [level=4]
      - paragraph: Synthetic prompt B2
      - group "Choose one answer":
        - text: Choose one answer
        - radio "Yes"
        - text: "Yes"
        - radio "No"
        - text: "No"
  - heading "Author rubric summary" [level=3]
  - paragraph: No rubric criteria.
- heading "Learner section B" [level=2]
- heading "History all questions" [level=2]
```

# Test source

```ts
  569 |       }
  570 |       if (u.pathname === '/api/auth/context') {
  571 |         await route.fulfill({
  572 |           json: {
  573 |             csrf: 'inert',
  574 |             installed: true,
  575 |             user: {
  576 |               id: 'synthetic-user',
  577 |               name: 'Synthetic coordinator',
  578 |               environment: 'test',
  579 |               global_admin: false,
  580 |             },
  581 |             client: { id: 'synthetic-client', name: 'Synthetic A' },
  582 |             canCoordinate: true,
  583 |           },
  584 |         });
  585 |         return true;
  586 |       }
  587 |       if (u.pathname === '/api/clients') {
  588 |         await route.fulfill({
  589 |           json: [
  590 |             { id: 'synthetic-client', name: 'Synthetic A' },
  591 |             { id: 'synthetic-b', name: 'Synthetic B' },
  592 |           ],
  593 |         });
  594 |         return true;
  595 |       }
  596 |       if (u.pathname.startsWith('/api/branding/')) {
  597 |         await route.fulfill({
  598 |           json: {
  599 |             displayName: 'Synthetic',
  600 |             appName: 'Synthetic',
  601 |             mode: 'white-label',
  602 |             selectedTheme: 'light',
  603 |             logo: null,
  604 |             palettes: {},
  605 |             platformPalettes: {},
  606 |           },
  607 |         });
  608 |         return true;
  609 |       }
  610 |       if (['/api/clients/select', '/api/auth/logout'].includes(u.pathname)) {
  611 |         events.push('POST ' + u.pathname);
  612 |         await route.fulfill({ json: { ok: true } });
  613 |         return true;
  614 |       }
  615 |       return false;
  616 |     });
  617 |     await page.locator('#builder').evaluate((e) => e.remove());
  618 |     await page.addScriptTag({ content: shell });
  619 |     await expect(page.getByRole('button', { name: 'Switch client', exact: true })).toBeEnabled();
  620 |     await page.addScriptTag({ content: builder });
  621 |     await page.locator('#assessment-title').fill('Dirty synthetic context draft');
  622 |     page.on('dialog', async (d) => {
  623 |       events.push(d.type());
  624 |       await d.dismiss();
  625 |     });
  626 |     if (action === 'switch') {
  627 |       await page.locator('#active-client').selectOption('synthetic-b');
  628 |       await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  629 |     } else await page.getByRole('button', { name: /sign out/i }).click();
  630 |     await expect.poll(() => events.length).toBe(1);
  631 |     expect(events).toEqual(['confirm']);
  632 |     await expect(page.getByRole('button', { name: 'Switch client', exact: true })).toBeEnabled();
  633 |     await expect(page.getByRole('button', { name: /sign out/i })).toBeEnabled();
  634 |     await expect(page.locator('#assessment-title')).toHaveValue('Dirty synthetic context draft');
  635 |     await screenshot(page, 'D01-' + action + '-canceled-before-post');
  636 |     page.removeAllListeners('dialog');
  637 |     events.length = 0;
  638 |     page.on('dialog', async (d) => {
  639 |       events.push(d.type());
  640 |       await d.accept();
  641 |     });
  642 |     if (action === 'switch')
  643 |       await page.getByRole('button', { name: 'Switch client', exact: true }).click();
  644 |     else await page.getByRole('button', { name: /sign out/i }).click();
  645 |     await expect(page.getByRole('heading', { name: 'Synthetic destination' })).toBeVisible();
  646 |     expect(events).toEqual([
  647 |       'confirm',
  648 |       'POST ' + (action === 'switch' ? '/api/clients/select' : '/api/auth/logout'),
  649 |     ]);
  650 |     expect(errors).toEqual([]);
  651 |   });
  652 | 
  653 | // Independent negative case: a confirmed conflict is not an unknown network outcome.
  654 | test('QA-D03 changed server draft after publication conflict offers recovery comparison', async ({page}) => {
  655 |   let posts=0;
  656 |   await boot(page,async route=>{
  657 |     const u=new URL(route.request().url());
  658 |     if(u.pathname==='/api/assessments/builder') { posts++; await route.fulfill({status:409,json:{message:'Saved version changed',code:'stale_definition'}});return true; }
  659 |     if(u.pathname==='/api/assessments/definitions') { await route.fulfill({json:{...initial,version:2,title:'Concurrent saved draft'}});return true; }
  660 |     return false;
  661 |   });
  662 |   await page.addScriptTag({content:builder});
  663 |   await page.locator('[data-section=review]').click();
  664 |   page.on('dialog',d=>d.accept());
  665 |   await page.locator('#publish-definition').click();
  666 |   await expect(page.locator('#save-status')).toContainText('saved version changed');
  667 |   expect(posts).toBe(1);
  668 |   await screenshot(page,'QA-D03-changed-draft-recovery');
> 669 |   await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
      |                                                                                 ^ Error: expect(locator).toBeVisible() failed
  670 | });
  671 | 
  672 | 
```
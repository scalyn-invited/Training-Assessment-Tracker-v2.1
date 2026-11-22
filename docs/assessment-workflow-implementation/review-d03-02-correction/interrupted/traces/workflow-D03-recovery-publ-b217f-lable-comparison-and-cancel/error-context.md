# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> D03 recovery published 409 retains complete local draft through denied/unavailable comparison and cancel
- Location: docs\assessment-workflow-implementation\review-d03-02-correction\browser-tests\workflow.spec.ts:654:3

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: locator.click: Test timeout of 90000ms exceeded.
Call log:
  - waiting for locator('[data-section=details]')
    - locator resolved to <button type="button" data-section="details">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <pre>{↵  "id": "synthetic-definition",↵  "version": 3,…</pre> from <header class="builder-header">…</header> subtree intercepts pointer events
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <pre>{↵  "id": "synthetic-definition",↵  "version": 3,…</pre> from <header class="builder-header">…</header> subtree intercepts pointer events
    - retrying click action
      - waiting 100ms
    164 × waiting for element to be visible, enabled and stable
        - element is visible, enabled and stable
        - scrolling into view if needed
        - done scrolling
        - <pre>{↵  "id": "synthetic-definition",↵  "version": 3,…</pre> from <header class="builder-header">…</header> subtree intercepts pointer events
      - retrying click action
        - waiting 500ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - heading "Synthetic isolated component QA" [level=1] [ref=e2]
  - generic [ref=e3]:
    - link "Back to assessments" [ref=e4] [cursor=pointer]:
      - /url: /assessments
    - banner [ref=e5]:
      - generic [ref=e6]:
        - paragraph [ref=e7]: ASSESSMENT BUILDER
        - heading "Build an assessment" [level=1] [ref=e8]
        - generic [ref=e9]:
          - paragraph [ref=e10]: Draft synthetic-definition · revision 1 · edit version 1
          - paragraph [ref=e11]: No direct copy source is recorded for this revision.
          - paragraph [ref=e12]: Existing assignments and team rules remain pinned to their original published revision. Saving a published definition creates a separate draft; it does not migrate assignments.
        - status [ref=e13]: "Publication conflict: the saved version changed and a newer version was published. Writes are stopped. Your complete local draft remains here; compare before deciding to discard and reload."
        - button "Compare with saved definition" [ref=e14] [cursor=pointer]
        - generic [ref=e15]:
          - group [ref=e16]:
            - generic "Private structured comparison" [ref=e17] [cursor=pointer]
            - paragraph [ref=e18]: Author-only snapshot at comparison time. Includes answer keys. Nothing is exported or merged; neither version is overwritten.
            - heading "Local draft" [level=3] [ref=e19]
            - generic [ref=e20]: "{ \"id\": \"synthetic-definition\", \"version\": 1, \"revision\": 1, \"status\": \"draft\", \"title\": \"Synthetic two-section assessment\", \"threshold\": null, \"criteria\": [], \"questions\": [ { \"id\": \"A1\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt A1\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"A2\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt A2\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B1\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt B1\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B2\", \"type\": \"multiple_choice\", \"prompt\": \"Synthetic prompt B2\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] } ], \"answer_key\": { \"A1\": \"yes\", \"A2\": \"yes\", \"B1\": \"yes\", \"B2\": \"yes\" }, \"sections\": [ { \"id\": \"a\", \"title\": \"Section A\", \"instructions\": \"First section\", \"question_ids\": [ \"A1\", \"A2\" ] }, { \"id\": \"b\", \"title\": \"Section B\", \"instructions\": \"Second section\", \"question_ids\": [ \"B1\", \"B2\" ] } ] }"
            - heading "Saved definition" [level=3] [ref=e21]
            - generic [ref=e22]: "{ \"id\": \"synthetic-definition\", \"version\": 3, \"revision\": 1, \"status\": \"published\", \"title\": \"Concurrent saved content\", \"threshold\": null, \"criteria\": [], \"questions\": [ { \"id\": \"A1\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"A2\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B1\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] }, { \"id\": \"B2\", \"type\": \"multiple_choice\", \"prompt\": \"Other author prompt\", \"choices\": [ { \"id\": \"yes\", \"text\": \"Yes\" }, { \"id\": \"no\", \"text\": \"No\" } ] } ], \"answer_key\": { \"A1\": \"yes\", \"A2\": \"yes\", \"B1\": \"yes\", \"B2\": \"yes\" }, \"sections\": [ { \"id\": \"a\", \"title\": \"Section A\", \"instructions\": \"First section\", \"question_ids\": [ \"A1\", \"A2\" ] }, { \"id\": \"b\", \"title\": \"Section B\", \"instructions\": \"Second section\", \"question_ids\": [ \"B1\", \"B2\" ] } ] }"
          - button "Discard local edits and reload" [active] [ref=e23] [cursor=pointer]
      - button "Save draft" [disabled] [ref=e25]
    - paragraph [ref=e26]: Build at your pace. Save incomplete work, then review before publishing. Existing assignments keep their published revision.
    - navigation "Assessment sections" [ref=e27]:
      - button "1 Details" [ref=e28] [cursor=pointer]
      - button "2 Questions" [ref=e29] [cursor=pointer]
      - button "3 Rubric" [ref=e30] [cursor=pointer]
      - button "4 Review" [ref=e31] [cursor=pointer]
    - region "Review assessment" [ref=e32]:
      - heading "Review assessment" [level=2] [ref=e33]
      - generic [ref=e34]:
        - heading "Readiness checklist" [level=3] [ref=e35]
        - paragraph [ref=e37]: Ready for publication checks. The server verifies the saved revision before publishing.
        - paragraph [ref=e38]: Publishing freezes this revision for assignment. Existing assignments remain unchanged.
        - button "Publish assessment" [disabled] [ref=e39]
      - region "Learner preview" [ref=e40]:
        - heading "Learner preview" [level=3] [ref=e41]
        - paragraph [ref=e42]: Answer keys and the author rubric are excluded from this preview.
        - generic [ref=e43]:
          - heading "Synthetic two-section assessment" [level=4] [ref=e44]
          - paragraph [ref=e45]: Content preview — responses are not saved
          - paragraph [ref=e46]: Saved revision 1 · draft · version 1
          - paragraph [ref=e47]: "Content only: save, submission, permissions and file scanning are not simulated. Author rubric is separate; answer keys are not shown."
          - heading "Section A" [level=4] [ref=e48]
          - paragraph [ref=e49]: First section
          - article [ref=e50]:
            - heading "Section A — Question 1" [level=4] [ref=e51]
            - paragraph [ref=e53]: Synthetic prompt A1
            - group "Choose one answer" [ref=e54]:
              - generic [ref=e56]:
                - radio "Yes" [ref=e57]
                - text: "Yes"
              - generic [ref=e58]:
                - radio "No" [ref=e59]
                - text: "No"
          - article [ref=e60]:
            - heading "Section A — Question 2" [level=4] [ref=e61]
            - paragraph [ref=e63]: Synthetic prompt A2
            - group "Choose one answer" [ref=e64]:
              - generic [ref=e66]:
                - radio "Yes" [ref=e67]
                - text: "Yes"
              - generic [ref=e68]:
                - radio "No" [ref=e69]
                - text: "No"
          - heading "Section B" [level=4] [ref=e70]
          - paragraph [ref=e71]: Second section
          - article [ref=e72]:
            - heading "Section B — Question 3" [level=4] [ref=e73]
            - paragraph [ref=e75]: Synthetic prompt B1
            - group "Choose one answer" [ref=e76]:
              - generic [ref=e78]:
                - radio "Yes" [ref=e79]
                - text: "Yes"
              - generic [ref=e80]:
                - radio "No" [ref=e81]
                - text: "No"
          - article [ref=e82]:
            - heading "Section B — Question 4" [level=4] [ref=e83]
            - paragraph [ref=e85]: Synthetic prompt B2
            - group "Choose one answer" [ref=e86]:
              - generic [ref=e88]:
                - radio "Yes" [ref=e89]
                - text: "Yes"
              - generic [ref=e90]:
                - radio "No" [ref=e91]
                - text: "No"
      - generic [ref=e92]:
        - heading "Author rubric summary" [level=3] [ref=e93]
        - paragraph [ref=e95]: No rubric criteria.
  - heading "Learner section B" [level=2] [ref=e96]
  - heading "History all questions" [level=2] [ref=e97]
  - link "Recovery navigation probe" [ref=e98] [cursor=pointer]:
    - /url: /
```

# Test source

```ts
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
  653 | for (const savedStatus of ['draft', 'published']) for (const outcome of ['409', 'lost-response']) {
  654 |   test(`D03 recovery ${savedStatus} ${outcome} retains complete local draft through denied/unavailable comparison and cancel`, async ({page}) => {
  655 |     const savedVersion = savedStatus === 'published' ? 3 : 2;
  656 |     let posts=0, access='allowed';
  657 |     await boot(page, async route => {
  658 |       const u=new URL(route.request().url());
  659 |       if(u.pathname==='/api/assessments/builder') {
  660 |         posts++;
  661 |         if(outcome==='409') await route.fulfill({status:409,json:{message:'Saved version changed'}});
  662 |         else await route.abort('failed');
  663 |         return true;
  664 |       }
  665 |       if(u.pathname==='/api/assessments/definitions') {
  666 |         if(access==='denied') await route.fulfill({status:403,json:{message:'Not authorized'}});
  667 |         else if(access==='unavailable') await route.abort('failed');
  668 |         else await route.fulfill({json:{...initial,status:savedStatus,version:savedVersion,title:'Concurrent saved content',questions:initial.questions.map(q=>({...q,prompt:'Other author prompt'}))}});
  669 |         return true;
  670 |       }
  671 |       return false;
  672 |     });
  673 |     await page.addScriptTag({content:builder});
  674 |     await page.locator('[data-section=review]').click();
  675 |     page.once('dialog',d=>d.accept());
  676 |     await page.locator('#publish-definition').click();
  677 |     await expect(page.locator('#save-status')).toContainText('saved version changed');
  678 |     await expect(page.locator('#save-status')).not.toContainText('unknown');
  679 |     await expect(page.locator('#save-definition')).toBeDisabled();
  680 |     await expect(page.locator('#publish-definition')).toBeDisabled();
  681 |     const compare=page.getByRole('button',{name:'Compare with saved definition'});
  682 |     await expect(compare).toBeVisible();
  683 |     await page.evaluate(() => { const a=document.createElement('a'); a.href='/'; a.textContent='Recovery navigation probe'; document.body.append(a); });
  684 |     const leaveDialogs:string[]=[];
  685 |     const cancelLeave=async (d:any)=>{leaveDialogs.push(d.type());await d.dismiss();};
  686 |     page.on('dialog',cancelLeave);
  687 |     await page.getByRole('link',{name:'Recovery navigation probe'}).click();
  688 |     expect(leaveDialogs).toEqual(['confirm']);
  689 |     page.off('dialog',cancelLeave);
  690 |     for(access of ['denied','unavailable']) {
  691 |       await compare.click();
  692 |       await expect(page.locator('#definition-comparison')).toContainText('Comparison unavailable');
  693 |       await expect(page.getByRole('button',{name:'Discard local edits and reload'})).toHaveCount(0);
  694 |       await expect(page.locator('#assessment-title')).toHaveValue(initial.title);
  695 |     }
  696 |     access='allowed';
  697 |     await compare.click();
  698 |     await page.getByText('Private structured comparison',{exact:true}).click();
  699 |     const local=JSON.parse(await page.locator('#definition-comparison pre').first().innerText());
  700 |     for(const key of Object.keys(initial)) expect(local[key]).toEqual(initial[key as keyof typeof initial]);
  701 |     expect(JSON.parse(await page.locator('#definition-comparison pre').last().innerText()).version).toBe(savedVersion);
  702 |     page.once('dialog',d=>d.dismiss());
  703 |     await page.getByRole('button',{name:'Discard local edits and reload'}).click();
  704 |     await expect(page.locator('#assessment-title')).toHaveValue(initial.title);
  705 |     await expect(page.locator('#save-definition')).toBeDisabled();
  706 |     expect(posts).toBe(1);
> 707 |     await page.locator('[data-section=details]').click();
      |                                                  ^ Error: locator.click: Test timeout of 90000ms exceeded.
  708 |     await page.locator('[data-section=review]').click();
  709 |     await expect(page.locator('#learner-preview')).toContainText('draft · version 1');
  710 |     await expect(page.locator('#assign-definition')).toBeHidden();
  711 |     await expect(page.locator('#save-status')).not.toContainText('Publication confirmed');
  712 |     await compare.click();
  713 |     await page.getByText('Private structured comparison',{exact:true}).click();
  714 |     expect(JSON.parse(await page.locator('#definition-comparison pre').first().innerText())).toEqual(local);
  715 |     await screenshot(page,`D03-${savedStatus}-${outcome}-comparison-cancel`);
  716 |     // Explicitly accepted discard reloads the document, never issues another mutation.
  717 |     page.once('dialog',d=>d.accept());
  718 |     await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Discard local edits and reload'}).click()]);
  719 |     expect(posts).toBe(1);
  720 |   });
  721 | }
  722 | 
  723 | // Independent negative case: a confirmed conflict is not an unknown network outcome.
  724 | test('QA-D03 changed server draft after publication conflict offers recovery comparison', async ({page}) => {
  725 |   let posts=0;
  726 |   await boot(page,async route=>{
  727 |     const u=new URL(route.request().url());
  728 |     if(u.pathname==='/api/assessments/builder') { posts++; await route.fulfill({status:409,json:{message:'Saved version changed',code:'stale_definition'}});return true; }
  729 |     if(u.pathname==='/api/assessments/definitions') { await route.fulfill({json:{...initial,version:2,title:'Concurrent saved draft'}});return true; }
  730 |     return false;
  731 |   });
  732 |   await page.addScriptTag({content:builder});
  733 |   await page.locator('[data-section=review]').click();
  734 |   page.on('dialog',d=>d.accept());
  735 |   await page.locator('#publish-definition').click();
  736 |   await expect(page.locator('#save-status')).toContainText('saved version changed');
  737 |   expect(posts).toBe(1);
  738 |   await screenshot(page,'QA-D03-changed-draft-recovery');
  739 |   await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
  740 | });
  741 | 
  742 | for (const outcome of ['409', 'lost-response']) test(`REVIEW-D03 newer published content must not confirm the local saved version ${outcome}`, async ({page}) => {
  743 |   let posts=0;
  744 |   await boot(page, async route => {
  745 |     const u=new URL(route.request().url());
  746 |     if(u.pathname==='/api/assessments/builder') {
  747 |       posts++; expect(route.request().postDataJSON()).toMatchObject({action:'publish',expected_version:1});
  748 |       if(outcome==='409') await route.fulfill({status:409,json:{message:'Definition changed'}});
  749 |       else await route.abort('failed');
  750 |       return true;
  751 |     }
  752 |     if(u.pathname==='/api/assessments/definitions') {
  753 |       await route.fulfill({json:{...initial,status:'published',version:3,title:'OTHER AUTHOR published content',questions:initial.questions.map(q=>({...q,prompt:'OTHER AUTHOR changed prompt'}))}});return true;
  754 |     }
  755 |     return false;
  756 |   });
  757 |   await page.addScriptTag({content:builder});
  758 |   await page.locator('[data-section=review]').click();
  759 |   page.once('dialog',d=>d.accept());
  760 |   await page.locator('#publish-definition').click();
  761 |   await expect(page.locator('#save-status')).not.toContainText('Publishing assessment');
  762 |   await page.locator('[data-section=details]').click();
  763 |   await page.locator('[data-section=review]').click();
  764 |   await screenshot(page,`REVIEW-D03-newer-published-${outcome}`);
  765 |   expect(posts).toBe(1);
  766 |   await expect(page.locator('#save-definition')).toBeDisabled();
  767 |   await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
  768 |   await expect(page.locator('#definition-provenance')).toContainText('edit version 1');
  769 | });
  770 | 
```
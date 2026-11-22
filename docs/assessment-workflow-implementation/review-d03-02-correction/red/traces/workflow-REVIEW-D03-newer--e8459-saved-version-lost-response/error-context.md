# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workflow.spec.ts >> REVIEW-D03 newer published content must not confirm the local saved version lost-response
- Location: docs\assessment-workflow-implementation\review-d03-02-correction\browser-tests\workflow.spec.ts:733:49

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator:  locator('#save-definition')
Expected: disabled
Received: enabled
Timeout:  5000ms

Call log:
  - Expect "toBeDisabled" locator('#save-definition') with timeout 5000ms
  - waiting for locator('#save-definition')
    13 × locator resolved to <button type="button" class="primary" id="save-definition">Save draft</button>
       - unexpected value "enabled"

```

```yaml
- button "Save draft"
```

# Test source

```ts
  657 |       const u=new URL(route.request().url());
  658 |       if(u.pathname==='/api/assessments/builder') {
  659 |         posts++;
  660 |         if(outcome==='409') await route.fulfill({status:409,json:{message:'Saved version changed'}});
  661 |         else await route.abort('failed');
  662 |         return true;
  663 |       }
  664 |       if(u.pathname==='/api/assessments/definitions') {
  665 |         if(access==='denied') await route.fulfill({status:403,json:{message:'Not authorized'}});
  666 |         else if(access==='unavailable') await route.abort('failed');
  667 |         else await route.fulfill({json:{...initial,version:2,title:'Concurrent saved draft'}});
  668 |         return true;
  669 |       }
  670 |       return false;
  671 |     });
  672 |     await page.addScriptTag({content:builder});
  673 |     await page.locator('[data-section=review]').click();
  674 |     page.once('dialog',d=>d.accept());
  675 |     await page.locator('#publish-definition').click();
  676 |     await expect(page.locator('#save-status')).toContainText('saved version changed');
  677 |     await expect(page.locator('#save-status')).not.toContainText('unknown');
  678 |     await expect(page.locator('#save-definition')).toBeDisabled();
  679 |     await expect(page.locator('#publish-definition')).toBeDisabled();
  680 |     const compare=page.getByRole('button',{name:'Compare with saved definition'});
  681 |     await expect(compare).toBeVisible();
  682 |     await page.evaluate(() => { const a=document.createElement('a'); a.href='/'; a.textContent='Recovery navigation probe'; document.body.append(a); });
  683 |     const leaveDialogs:string[]=[];
  684 |     const cancelLeave=async (d:any)=>{leaveDialogs.push(d.type());await d.dismiss();};
  685 |     page.on('dialog',cancelLeave);
  686 |     await page.getByRole('link',{name:'Recovery navigation probe'}).click();
  687 |     expect(leaveDialogs).toEqual(['confirm']);
  688 |     page.off('dialog',cancelLeave);
  689 |     for(access of ['denied','unavailable']) {
  690 |       await compare.click();
  691 |       await expect(page.locator('#definition-comparison')).toContainText('Comparison unavailable');
  692 |       await expect(page.getByRole('button',{name:'Discard local edits and reload'})).toHaveCount(0);
  693 |       await expect(page.locator('#assessment-title')).toHaveValue(initial.title);
  694 |     }
  695 |     access='allowed';
  696 |     await compare.click();
  697 |     await page.getByText('Private structured comparison',{exact:true}).click();
  698 |     const local=JSON.parse(await page.locator('#definition-comparison pre').first().innerText());
  699 |     for(const key of ['id','version','title','questions','sections','criteria','answer_key']) expect(local[key]).toEqual(initial[key as keyof typeof initial]);
  700 |     expect(JSON.parse(await page.locator('#definition-comparison pre').last().innerText()).version).toBe(2);
  701 |     page.once('dialog',d=>d.dismiss());
  702 |     await page.getByRole('button',{name:'Discard local edits and reload'}).click();
  703 |     await expect(page.locator('#assessment-title')).toHaveValue(initial.title);
  704 |     await expect(page.locator('#save-definition')).toBeDisabled();
  705 |     expect(posts).toBe(1);
  706 |     await screenshot(page,`D03-${outcome}-comparison-cancel`);
  707 |     // Explicitly accepted discard reloads the document, never issues another mutation.
  708 |     page.once('dialog',d=>d.accept());
  709 |     await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'Discard local edits and reload'}).click()]);
  710 |     expect(posts).toBe(1);
  711 |   });
  712 | }
  713 | 
  714 | // Independent negative case: a confirmed conflict is not an unknown network outcome.
  715 | test('QA-D03 changed server draft after publication conflict offers recovery comparison', async ({page}) => {
  716 |   let posts=0;
  717 |   await boot(page,async route=>{
  718 |     const u=new URL(route.request().url());
  719 |     if(u.pathname==='/api/assessments/builder') { posts++; await route.fulfill({status:409,json:{message:'Saved version changed',code:'stale_definition'}});return true; }
  720 |     if(u.pathname==='/api/assessments/definitions') { await route.fulfill({json:{...initial,version:2,title:'Concurrent saved draft'}});return true; }
  721 |     return false;
  722 |   });
  723 |   await page.addScriptTag({content:builder});
  724 |   await page.locator('[data-section=review]').click();
  725 |   page.on('dialog',d=>d.accept());
  726 |   await page.locator('#publish-definition').click();
  727 |   await expect(page.locator('#save-status')).toContainText('saved version changed');
  728 |   expect(posts).toBe(1);
  729 |   await screenshot(page,'QA-D03-changed-draft-recovery');
  730 |   await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
  731 | });
  732 | 
  733 | for (const outcome of ['409', 'lost-response']) test(`REVIEW-D03 newer published content must not confirm the local saved version ${outcome}`, async ({page}) => {
  734 |   let posts=0;
  735 |   await boot(page, async route => {
  736 |     const u=new URL(route.request().url());
  737 |     if(u.pathname==='/api/assessments/builder') {
  738 |       posts++; expect(route.request().postDataJSON()).toMatchObject({action:'publish',expected_version:1});
  739 |       if(outcome==='409') await route.fulfill({status:409,json:{message:'Definition changed'}});
  740 |       else await route.abort('failed');
  741 |       return true;
  742 |     }
  743 |     if(u.pathname==='/api/assessments/definitions') {
  744 |       await route.fulfill({json:{...initial,status:'published',version:3,title:'OTHER AUTHOR published content',questions:initial.questions.map(q=>({...q,prompt:'OTHER AUTHOR changed prompt'}))}});return true;
  745 |     }
  746 |     return false;
  747 |   });
  748 |   await page.addScriptTag({content:builder});
  749 |   await page.locator('[data-section=review]').click();
  750 |   page.once('dialog',d=>d.accept());
  751 |   await page.locator('#publish-definition').click();
  752 |   await expect(page.locator('#save-status')).not.toContainText('Publishing assessment');
  753 |   await page.locator('[data-section=details]').click();
  754 |   await page.locator('[data-section=review]').click();
  755 |   await screenshot(page,`REVIEW-D03-newer-published-${outcome}`);
  756 |   expect(posts).toBe(1);
> 757 |   await expect(page.locator('#save-definition')).toBeDisabled();
      |                                                  ^ Error: expect(locator).toBeDisabled() failed
  758 |   await expect(page.getByRole('button',{name:'Compare with saved definition'})).toBeVisible();
  759 |   await expect(page.locator('#definition-provenance')).toContainText('edit version 1');
  760 | });
  761 | 
```
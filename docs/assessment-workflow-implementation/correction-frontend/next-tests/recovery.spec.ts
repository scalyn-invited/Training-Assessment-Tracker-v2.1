import {test,expect} from '@playwright/test';
// Real Next document reload + router; synthetic authorized API transport only.
for (const outcome of ['409','lost-response']) test(`D03 real Next ${outcome} authorized recovery reloads newer draft only after discard`,async ({page})=>{
 const original={id:'synthetic-definition',title:'Original private draft',status:'draft',revision:1,version:1,
 questions:[{id:'q',type:'multiple_choice',prompt:'Synthetic question',choices:[{id:'yes',text:'Yes'},{id:'no',text:'No'}]}],
 sections:[{id:'s',title:'Synthetic section',instructions:'Retained instruction',question_ids:['q']}],rubric:{criteria:[],threshold:null},answer_key:{q:'yes'}};
 let row={...original},access='allowed',posts=0;
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:3275')throw Error('External request '+u.origin);
  if(!u.pathname.startsWith('/api/'))return route.continue();
  if(u.pathname==='/api/assessments/builder'){
   expect(route.request().postDataJSON()).toMatchObject({action:'publish',id:original.id,expected_version:1});posts++;
   row={...original,version:2,title:'Authorized newer draft'};
   if(outcome==='409')return route.fulfill({status:409,json:{message:'Saved version changed'}});
   return route.abort('failed');
  }
  if(u.pathname==='/api/assessments/definitions'){
   if(access==='denied')return route.fulfill({status:403,json:{message:'Not authorized'}});
   if(access==='unavailable')return route.abort('failed');
   return route.fulfill({json:row});
  }
  if(u.pathname==='/api/auth/context')return route.fulfill({json:{csrf:'inert',installed:true,user:{id:'synthetic',name:'Synthetic author',environment:'test',global_admin:false},client:{id:'synthetic-client',name:'Synthetic'},canCoordinate:true}});
  if(u.pathname==='/api/clients')return route.fulfill({json:[{id:'synthetic-client',name:'Synthetic'}]});
  if(u.pathname.startsWith('/api/branding/'))return route.fulfill({json:{displayName:'Synthetic',appName:'Synthetic',mode:'white-label',selectedTheme:'light',logo:null,palettes:{},platformPalettes:{}}});
  throw Error('Unexpected API '+u.pathname);
 });
 if(outcome==='lost-response')await page.setViewportSize({width:375,height:812});
 await page.goto('/assessments/definitions/'+original.id);
 await expect(page.locator('#assessment-title')).toHaveValue(original.title);
 await page.locator('[data-section=review]').click();
 page.once('dialog',d=>d.accept());await page.locator('#publish-definition').click();
 await expect(page.locator('#save-status')).toContainText('Publication conflict');
 await expect(page.locator('#publish-definition')).toBeDisabled();
 const compare=page.getByRole('button',{name:'Compare with saved definition'});
 for(access of ['denied','unavailable']){
  await compare.click();await expect(page.locator('#definition-comparison')).toContainText('Comparison unavailable');
  await expect(page.getByRole('button',{name:'Discard local edits and reload'})).toHaveCount(0);
 }
 access='allowed';await compare.click();
 await page.getByText('Private structured comparison',{exact:true}).click();
 const local=JSON.parse(await page.locator('#definition-comparison pre').first().innerText());
 expect(local).toMatchObject({id:original.id,version:1,title:original.title,questions:original.questions,sections:original.sections,answer_key:original.answer_key,criteria:[]});
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Discard local edits and reload'}).click();
 await expect(page.locator('#assessment-title')).toHaveValue(original.title);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`docs/assessment-workflow-implementation/correction-frontend/screenshots/D03-next-${outcome}-cancel.png`,fullPage:true});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Discard local edits and reload'}).click();
 await expect(page.locator('#assessment-title')).toHaveValue(row.title);
 await expect(page.locator('#definition-provenance')).toContainText('edit version 2');
 await expect(page.locator('#save-definition')).toBeEnabled();
 expect(posts).toBe(1);expect(errors).toEqual([]);
 await page.screenshot({path:`docs/assessment-workflow-implementation/correction-frontend/screenshots/D03-next-${outcome}-recovered.png`,fullPage:true});
});

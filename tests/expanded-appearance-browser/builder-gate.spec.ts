import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
test('FOUC-QA-05 builder mounts after delayed appearance authority',async({page})=>{
 test.setTimeout(90000);
 const out='evidence/final-scope/builder-gate'; await mkdir(out,{recursive:true});
 const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
 async function post(path:string,data:Record<string,unknown>){
  const c=await(await page.request.get('/api/auth/context')).json();
  const r=await page.request.post('/api'+path,{headers:{Origin:'http://127.0.0.1:3110'},data:{...data,csrf:c.csrf}});
  expect(r.ok(),await r.text()).toBe(true);return r.json();
 }
 await post('/auth/setup',{name:'QA Gate',email:'gate@example.invalid',password:'Isolated gate administrator',demoPassword:'Isolated gate demonstration'});
 await post('/auth/login',{email:'demo.1.2@example.invalid',password:'Isolated gate demonstration'});
 const clients=await(await page.request.get('/api/clients')).json();
 await post('/clients/select',{clientId:clients.find((c:{name:string})=>c.name==='Demo Client 1').id});
 let release!:()=>void;const held=new Promise<void>(r=>release=r);let requested=false;
 await page.route('**/api/branding/current?*',async route=>{requested=true;await held;await route.continue();});
 await page.goto('/assessments/definitions/new');
 await expect.poll(()=>requested).toBe(true);
 await expect(page.getByText('Opening workspace',{exact:true})).toBeVisible();
 // Ensure independent definition data has resolved while the host is gated.
 await expect.poll(async()=> (await page.request.get('/api/assessments/definitions?clientId='+clients.find((c:{name:string})=>c.name==='Demo Client 1').id)).ok()).toBe(true);
 await page.screenshot({path:out+'/pending.png'});
 release();
 await expect(page.locator('[data-application-shell]')).toHaveCount(1);
 try {await expect(page.getByRole('heading',{name:'Build an assessment',exact:true})).toBeVisible();}
 finally {
  await page.screenshot({path:out+'/settled.png'});
  await writeFile(out+'/state.json',JSON.stringify(await page.evaluate(()=>({url:location.pathname,theme:document.documentElement.dataset.theme,host:document.getElementById('assessment-builder')?.outerHTML,main:document.querySelector('main')?.innerText})),null,2));
  await writeFile(out+'/errors.json',JSON.stringify(errors));
 }
});

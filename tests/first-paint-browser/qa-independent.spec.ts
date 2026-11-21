import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('QA baseline reload matrix and route continuity',async({page,context},info)=>{
 test.setTimeout(240000);
 const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error' && /hydration|did not match/i.test(m.text()))errors.push(m.text());});
 await page.addInitScript(()=>{
 const w=window as any;w.framesQA=[];w.shiftsQA=[];
 new PerformanceObserver(list=>{for(const e of list.getEntries())w.shiftsQA.push(JSON.parse(JSON.stringify(e)));}).observe({type:'layout-shift',buffered:true});
 const sample=()=>{if(document.body && document.querySelector('main'))w.framesQA.push({at:performance.now(),visibility:document.visibilityState,theme:document.documentElement.dataset.theme,canvas:getComputedStyle(document.body).backgroundColor,header:document.querySelector('header')?.getBoundingClientRect().toJSON()});requestAnimationFrame(sample);};requestAnimationFrame(sample);
 });
 await page.goto('/login');await page.bringToFront();
 await page.getByRole('button',{name:/^Theme /}).click();await page.getByRole('button',{name:'Dark',exact:true}).click();
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');
 const results=[];
 for(const [name,hard,cold,slow] of [['normal-warm',false,false,false],['hard-warm',true,false,false],['normal-cold',false,true,false],['hard-cold-800ms',true,true,true]] as const){
 if(cold)await cdp.send('Network.clearBrowserCache');
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:slow?800:0,downloadThroughput:slow?200000:-1,uploadThroughput:slow?100000:-1});
 const nav=page.waitForEvent('domcontentloaded');await cdp.send('Page.reload',{ignoreCache:hard});await nav;
 await page.screenshot({path:info.outputPath(name+'-intermediate.png')});
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();await expect(page.locator('.theme-current')).toHaveText('Dark');
 await page.screenshot({path:info.outputPath(name+'-settled.png')});
 const result=await page.evaluate(()=>({frames:(window as any).framesQA,shifts:(window as any).shiftsQA,preference:localStorage.getItem('training.v21.appearance.platform.guest')}));
 results.push({name,...result});
 expect(result.frames.length).toBeGreaterThan(0);expect([...new Set(result.frames.map((f:any)=>f.theme))]).toEqual(['dark']);expect([...new Set(result.frames.map((f:any)=>f.canvas))]).toEqual(['rgb(7, 11, 22)']);expect(result.preference).toBe('dark');
 }
 await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 for(const route of ['/account/link','/dashboard','/assessments','/qa-no-such-route']){await page.goto(route);await expect(page.locator('main')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');results.push({route,...await page.evaluate(()=>({frames:(window as any).framesQA,shifts:(window as any).shiftsQA}))});}
 await writeFile(info.outputPath('matrix.json'),JSON.stringify({browser:context.browser()?.version(),results,errors},null,2));expect(errors).toEqual([]);
});

test('QA generated preference outage exposes incorrect initial theme',async({page,context},info)=>{
 await context.addCookies([{name:'brand-failure',value:'1',url:'http://127.0.0.1:3280'}]);
 await page.addInitScript(()=>localStorage.setItem('training.v21.appearance.platform.guest','platform-dark'));
 await page.goto('/login');await expect(page.getByRole('button',{name:'Retry appearance',exact:true})).toBeVisible();
 const before=await page.locator('html').getAttribute('data-theme');await page.screenshot({path:info.outputPath('outage.png')});
 await context.clearCookies();await page.getByRole('button',{name:'Retry appearance',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','platform-dark');await page.screenshot({path:info.outputPath('recovered.png')});
 await writeFile(info.outputPath('outage.json'),JSON.stringify({before,after:await page.locator('html').getAttribute('data-theme')}));
 expect(before,'Saved generated Dark must not show Light on failure').toBe('platform-dark');
});

test('QA built-in readability keyboard reduced motion and retained input',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');
 const findings=[];
 for(const theme of ['Dark','Light','Neon Cyan','Neon Emerald','Neon Amber']){
 await page.getByRole('button',{name:/^Theme /}).click();await page.getByRole('button',{name:theme,exact:true}).click();
 await expect(page.getByLabel('Email',{exact:true})).toHaveValue('synthetic@example.invalid');
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();findings.push({theme,violations:axe.violations});
 await page.getByLabel('Email',{exact:true}).focus();await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('INPUT');
 }
 await writeFile(info.outputPath('accessibility.json'),JSON.stringify(findings,null,2));expect(findings.flatMap(f=>f.violations)).toEqual([]);
});

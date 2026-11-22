import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { themes } from '../../packages/domain/src/theme.js';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

// Production shell, picker and CSS; isolated synthetic transport, no app/database.
let bundle: string, css: string;
test.beforeAll(async () => {
  const output = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';
        import {useState,useEffect} from 'react';
        import {ApplicationShell} from './apps/web/app/components/application-shell';
        import {themes} from './packages/domain/src/theme';
        function Fixture(){
          const [selected,setSelected]=useState(localStorage.getItem('theme-test')||'light');
          useEffect(()=>{const refresh=()=>setSelected(localStorage.getItem('theme-test')||'light');window.addEventListener('brandingchanged',refresh);return()=>window.removeEventListener('brandingchanged',refresh)},[]);
          useEffect(()=>{document.documentElement.dataset.theme=selected},[selected]);
          return <ApplicationShell themeClientId={location.search.includes('client')?'synthetic-client':undefined} context={{user:{global_admin:!location.search.includes('member')},canAdmin:location.search.includes('admin'),csrf:'synthetic'}} pathname='/platform' platform activePage='overview' navigationBusy={false} name='Synthetic user' brand={{displayName:'Scalyn',appName:'Assessment Training Tracker',mode:location.search.includes('white')?'white-label':'cerebru',selectedTheme:selected,logo:null,palettes:{},platformPalettes:{},themes}} storageKey='theme-test' reload={()=>{}} logout={()=>{}} signingOut={false}><h1>Theme picker fixture</h1><button>Outside action</button></ApplicationShell>
        }createRoot(document.getElementById('root')).render(<Fixture/>);`,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    outdir: '.runtime/theme-picker-bundle',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
  });
  bundle = output.outputFiles.find((file) => file.path.endsWith('.js'))!.text;
  css = await readFile('apps/web/app/globals.css', 'utf8');
  css += output.outputFiles
    .filter((file) => file.path.endsWith('.css'))
    .map((file) => file.text)
    .join('\n');
});
async function mount(page: Page, query = '') {
  await page.route('http://theme.invalid/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Theme fixture</title></head><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto('http://theme.invalid/' + query);
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
}

for (const size of [{width:1280,height:600},{width:1280,height:300},{width:320,height:300},{width:390,height:420},{width:800,height:300}]) {
 test(`independent combined geometry ${size.width}x${size.height}`,async({page},info)=>{
 await page.setViewportSize(size);await mount(page);
 const sidebar=page.getByRole('complementary');
 const workspace=sidebar.getByRole('button',{name:/^Workspace /});
 const geom=()=>sidebar.evaluate(el=>({h:el.scrollHeight,w:el.scrollWidth,nav:Array.from(document.querySelectorAll('nav')).filter(e=>e.getAttribute('aria-label')!=='Choose workspace').map(e=>{const r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label'),x:r.x,y:r.y,w:r.width,h:r.height}})}));
 await workspace.scrollIntoViewIfNeeded();const before=await geom();await workspace.click();
 const wp=page.getByRole('navigation',{name:'Choose workspace'});await expect(wp).toBeVisible();expect(await wp.evaluate(el=>el.matches(':popover-open'))).toBe(true);expect(await geom()).toEqual(before);
 const dimensions=await wp.evaluate(el=>({h:el.clientHeight,sh:el.scrollHeight,w:el.clientWidth,sw:el.scrollWidth}));expect(dimensions.sw).toBe(dimensions.w);
 await page.keyboard.press('Escape');expect(await geom()).toEqual(before);
 const mobile=size.width<=800;if(mobile)await page.getByRole('button',{name:'Personal settings'}).click();
 const owner=mobile?page.getByRole('dialog',{name:'Personal settings'}):sidebar;
 const theme=owner.getByRole('button',{name:/^Theme(?: |$)/});await theme.scrollIntoViewIfNeeded();const closed=await geom();const ownerBefore=await owner.evaluate(el=>({h:el.scrollHeight,w:el.scrollWidth}));
 await theme.click();const panel=page.getByRole('group',{name:'Colour theme'});await expect(panel).toBeVisible();expect(await geom()).toEqual(closed);expect(await owner.evaluate(el=>({h:el.scrollHeight,w:el.scrollWidth}))).toEqual(ownerBefore);
 const box=await panel.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(size.width);expect(box!.y+box!.height).toBeLessThanOrEqual(size.height);
 expect((await new AxeBuilder({page}).include('.theme-options').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
 await page.screenshot({path:info.outputPath('theme.png')});await page.keyboard.press('Escape');expect(await geom()).toEqual(closed);expect(await owner.evaluate(el=>({h:el.scrollHeight,w:el.scrollWidth}))).toEqual(ownerBefore);await expect(theme).toBeFocused();
 console.log(JSON.stringify({size,workspace:before,workspacePanel:dimensions,theme:closed,owner:ownerBefore}));
 });
}

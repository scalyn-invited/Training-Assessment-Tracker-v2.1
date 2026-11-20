const fs=require('node:fs'),path=require('node:path');
const dir='docs/assessment-workflow-implementation/independent-qa';
for(const [source,target] of [['tests/workflow-qa-browser','browser-tests'],['tests/workflow-next-browser','next-tests']]) {
 fs.mkdirSync(path.join(dir,target),{recursive:true});
 for(const n of fs.readdirSync(source).filter(n=>n.endsWith('.spec.ts'))) {
 let s=fs.readFileSync(path.join(source,n),'utf8');
 s=s.replaceAll('docs/assessment-workflow-implementation/implementation-screenshots',dir+'/screenshots').replaceAll('docs/assessment-workflow-implementation/D01-next-canceled.png',dir+'/screenshots/D01-next-canceled.png');
 fs.writeFileSync(path.join(dir,target,n),s);
 }
}
for(const mode of ['browser','next']) fs.writeFileSync(path.join(dir,mode+'.config.ts'),`import path from 'node:path';import {defineConfig} from '@playwright/test';export default defineConfig({testDir:'./${mode}-tests',workers:1,fullyParallel:false,timeout:90000,use:{headless:true,${mode==='next'?"baseURL:'http://127.0.0.1:3275',":''}trace:'retain-on-failure'},reporter:[['list'],['json',{outputFile:path.resolve('${dir}/${mode}.json')}]],outputDir:path.resolve('.runtime/independent-${mode}-results'),${mode==='next'?"webServer:{command:'node tests/workflow-qa-browser/next-server.cjs',cwd:process.cwd(),url:'http://127.0.0.1:3275/assessments',reuseExistingServer:false,timeout:180000},":''}});`);
console.log('Copied parent tests unchanged except separate screenshot output; configs anchored to worktree.');

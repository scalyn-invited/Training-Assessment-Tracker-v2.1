const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root=process.cwd(), out=path.resolve('docs/assessment-workflow-implementation/independent-qa');
const env={};
for(const k of ['PATH','Path','SYSTEMROOT','SystemRoot','COMSPEC','ComSpec','USERPROFILE','LOCALAPPDATA','PATHEXT']) if(process.env[k]) env[k]=process.env[k];
for(const dir of ['.','apps/web']) if(fs.readdirSync(dir).some(n=>/^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(n))) throw Error('Unexpected environment file');
const temp=path.resolve('.runtime/independent-qa-temp'); fs.mkdirSync(temp,{recursive:true});
Object.assign(env,{TEMP:temp,TMP:temp,TMPDIR:temp,NEXT_TELEMETRY_DISABLED:'1',AI_LIVE_ENABLED:'false',SMTP_ENABLED:'false',ACCOUNT_EMAIL_ENABLED:'false',API_INTERNAL_ORIGIN:'http://127.0.0.1:9',DOTENV_CONFIG_PATH:path.resolve('.runtime/no-independent-env'),PLAYWRIGHT_BROWSERS_PATH:path.resolve('.runtime/browsers')});
const mode=process.argv[2];
const tag=process.argv[3]||mode;
let args;
if(mode==='domain') args=['node_modules/vitest/vitest.mjs','run','--hookTimeout=180000','--reporter=default','--reporter=json','--outputFile='+path.join(out,'domain.json')];
else if(mode==='typecheck') args=['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.server.json'];
else if(mode==='web-typecheck') args=['node_modules/typescript/bin/tsc','--noEmit','-p','apps/web/tsconfig.json'];
else if(mode==='build-server') args=['node_modules/typescript/bin/tsc','-p','tsconfig.server.json'];
else if(mode==='build-web') args=['node_modules/next/dist/bin/next','build','apps/web'];
else if(mode==='browser'||mode==='next') args=['node_modules/playwright/cli.js','test','-c',path.join(out,mode+'.config.ts')];
else throw Error('Unknown mode');
if(mode==='domain') {
const check=spawnSync(process.execPath,['docs/assessment-workflow-implementation/qa-port-check.cjs'],{env,encoding:'utf8'});
fs.writeFileSync(path.join(out,mode+'-isolation.log'),check.stdout+check.stderr); if(check.status!==0) process.exit(check.status||1);
}
if(process.argv.length>4) args.push(...process.argv.slice(4));
console.log('Running',mode,'with allowlisted environment, worktree temp, no live adapters');
const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',maxBuffer:32*1024*1024});
fs.writeFileSync(path.join(out,tag+'.log'),result.stdout+result.stderr+'\nEXIT '+result.status+'\n');
console.log(result.stdout,result.stderr,'EXIT',result.status); process.exitCode=result.status??1;

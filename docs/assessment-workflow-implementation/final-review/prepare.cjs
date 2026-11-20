const fs=require('node:fs'),path=require('node:path');
const src='docs/assessment-workflow-implementation/correction-qa',dst='docs/assessment-workflow-implementation/final-review';
for(const sub of ['browser-tests','next-tests']){fs.mkdirSync(path.join(dst,sub),{recursive:true});for(const name of fs.readdirSync(path.join(src,sub))){const p=path.join(dst,sub,name);if(fs.existsSync(p))throw Error('Refuse overwrite');fs.writeFileSync(p,fs.readFileSync(path.join(src,sub,name),'utf8').replaceAll('correction-qa','final-review'));}}
for(const name of ['browser.config.ts','next.config.ts','next-server.cjs','run.cjs','domain-run.cjs']){const p=path.join(dst,name);if(fs.existsSync(p))throw Error('Refuse overwrite');fs.writeFileSync(p,fs.readFileSync(path.join(src,name),'utf8').replaceAll('correction-qa','final-review'));}
console.log('Copied harnesses to reviewer-only outputs; assertions unchanged.');

const fs=require('node:fs'),path=require('node:path');
const src='docs/assessment-workflow-implementation/review-d03-02-qa',dst=__dirname;
for(const name of ['browser-tests','next-tests','browser.config.ts','next.config.ts','next-server.cjs','run.cjs','domain-run.cjs','publication-race.test.ts','probe.config.ts','process-check.py']) {
 const copy=(from,to)=>{if(fs.statSync(from).isDirectory()){fs.mkdirSync(to,{recursive:true});for(const n of fs.readdirSync(from))copy(path.join(from,n),path.join(to,n));}else{if(fs.existsSync(to))throw Error('Refuse overwrite '+to);fs.writeFileSync(to,fs.readFileSync(from,'utf8').replaceAll('review-d03-02-qa','review-d03-02-rereview'));}};
 copy(path.join(src,name),path.join(dst,name));
}
console.log('Copied assertion-identical QA harness to fresh reviewer-only destinations.');

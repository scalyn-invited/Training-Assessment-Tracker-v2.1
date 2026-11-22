const fs=require('node:fs'), path=require('node:path');
const out=__dirname;
const reports=[];
for(const name of fs.readdirSync(out).filter(n=>n.endsWith('.json') && n!=='results-summary.json')) {
 const data=JSON.parse(fs.readFileSync(path.join(out,name),'utf8'));
 if(!data.testResults) continue;
 reports.push({name,passed:data.numPassedTests,failed:data.numFailedTests,pending:data.numPendingTests,files:data.testResults.map(f=>({name:path.basename(f.name),status:f.status,tests:f.assertionResults.map(t=>({name:t.fullName,status:t.status,duration:t.duration}))}))});
}
const timings={};
for(const tag of ['diagnostic-plans','diagnostic-queries','diagnostic-plans-green']) {
 const text=fs.readFileSync(path.join(out,tag+'.log'),'utf8').replace(/\x1b\[[0-9;]*m/g,'');
 const stats=JSON.parse(text.split('QUERY_TIMINGS ')[1].split('\n')[0]);
 timings[tag]={selects:Object.entries(stats).filter(([k])=>k.startsWith('SELECT')).reduce((a,[,v])=>a+v.n,0),queryMs:Object.values(stats).reduce((a,v)=>a+v.ms,0)};
}
fs.writeFileSync(path.join(out,'results-summary.json'),JSON.stringify({reports,timings},null,2)+'\n');
console.log(JSON.stringify({reports:reports.map(({files,...r})=>({...r,files:files.map(f=>f.name)})),timings},null,2));

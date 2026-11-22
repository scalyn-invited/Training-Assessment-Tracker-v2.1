// Read-only diagnostic extraction of exact Next/Playwright trace boundaries.
const fs=require('node:fs'),path=require('node:path');
const out=__dirname;
const rows=fs.readFileSync('apps/web/.next/dev/trace','utf8').trim().split('\n').flatMap(l=>JSON.parse(l));
const summary=rows.filter(r=>/compile|request|render/.test(r.name)).map(r=>({name:r.name,milliseconds:r.duration/1000,tags:r.tags,startTime:r.startTime}));
fs.writeFileSync(path.join(out,'next-server-trace-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary,null,2));

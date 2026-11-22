const fs=require('node:fs');
const text=fs.readFileSync(process.argv[2],'utf8').replace(/\x1b\[[0-9;]*m/g,'');
const stats=JSON.parse(text.split('QUERY_TIMINGS ')[1].split('\n')[0]);
console.log(JSON.stringify(Object.entries(stats).sort((a,b)=>b[1].ms-a[1].ms).slice(0,15),null,2));

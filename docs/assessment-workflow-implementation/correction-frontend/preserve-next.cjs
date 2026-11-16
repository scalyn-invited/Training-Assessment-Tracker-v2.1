const fs=require('node:fs'),path=require('node:path');
const tag=process.argv[2]; if(!/^[a-z-]+$/.test(tag))throw Error('Tag required');
for(const [src,name] of [['.runtime/correction-next-results','traces'],['apps/web/.next/dev/trace','server-trace.jsonl'],[path.join(__dirname,'next.json'),'result.json']]) {if(fs.existsSync(src))fs.cpSync(src,path.join(__dirname,'navigation-evidence',tag,name),{recursive:true,errorOnExist:true,force:false});}
console.log('Preserved navigation evidence '+tag);

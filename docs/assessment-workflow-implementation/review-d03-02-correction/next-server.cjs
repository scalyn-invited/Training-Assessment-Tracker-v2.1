// Built real Next renderer only; compilation is a separate, explicit qualification gate.
// No API process, database, worker, credentials or live adapters.
const net=require('node:net'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
for(const dir of ['.','apps/web']) if(fs.readdirSync(dir).some(n=>/^\.env(?:\.(?:local|development|production|test)(?:\.local)?)?$/.test(n)))throw Error('Unexpected environment file');
if(!fs.existsSync('apps/web/.next/BUILD_ID'))throw Error('Run isolated build-web before navigation qualification');
const probe=net.createServer();probe.on('error',()=>{console.error('Renderer port3275 unavailable');process.exit(1);});
probe.listen(3275,'127.0.0.1',()=>probe.close(()=>{
 const env={};for(const k of ['PATH','Path','SYSTEMROOT','SystemRoot','COMSPEC','ComSpec','USERPROFILE','LOCALAPPDATA','PATHEXT'])if(process.env[k])env[k]=process.env[k];
 const temp=path.resolve('.runtime/review-d03-02-correction-temp');fs.mkdirSync(temp,{recursive:true});
 Object.assign(env,{TEMP:temp,TMP:temp,TMPDIR:temp,NEXT_TELEMETRY_DISABLED:'1',API_INTERNAL_ORIGIN:'http://127.0.0.1:9',AI_LIVE_ENABLED:'false',SMTP_ENABLED:'false',ACCOUNT_EMAIL_ENABLED:'false'});
 const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','apps/web','--hostname','127.0.0.1','--port','3275'],{env,stdio:'inherit'});
 child.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>child.kill());process.on('SIGINT',()=>child.kill());
}));

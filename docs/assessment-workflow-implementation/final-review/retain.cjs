const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const out=__dirname;
for(const mode of ['browser','next'])fs.cpSync(path.resolve('.runtime/final-review-'+mode+'-results'),path.join(out,'traces',mode),{recursive:true,errorOnExist:true,force:false});
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8'));
const b=read('browser.json'),n=read('next.json'),d=read('reviewer-focused.json'),p=read('domain.json');
const summary={candidate:'2652126fe7d69e280c4e3410efd3741d91f68bcd',head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:b.stats,next:n.stats,focusedDomain:{passed:d.numPassedTests,failed:d.numFailedTests,total:d.numTotalTests},raceDomain:{passed:p.numPassedTests,failed:p.numFailedTests,total:p.numTotalTests},productionDiff:cp.execFileSync('git',['diff','2652126','--','apps','packages','tests','scripts'],{encoding:'utf8'}),parentEvidenceDiff:cp.execFileSync('git',['diff','156e383','--','docs/assessment-workflow-implementation/correction-qa','docs/assessment-workflow-implementation/independent-qa','docs/assessment-workflow-implementation/correction-frontend','docs/assessment-workflow-implementation/correction-backend'],{encoding:'utf8'})};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(summary,null,2));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const manifest=walk(out).filter(p=>!p.endsWith('manifest.json')).map(p=>({path:path.relative(out,p).replaceAll('\\','/'),bytes:fs.statSync(p).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}));
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(summary,null,2));console.log('Evidence files hashed:',manifest.length);

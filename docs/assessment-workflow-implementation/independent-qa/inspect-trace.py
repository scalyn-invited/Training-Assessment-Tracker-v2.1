from pathlib import Path
import json, zipfile
p=Path('.runtime/independent-next-results/navigation-D01-real-Next-s-98965-ean-SPA-navigation-proceeds/trace.zip')
out=[]
with zipfile.ZipFile(p) as z:
 for n in z.namelist():
  if n.endswith('.network'):
   for line in z.read(n).decode().splitlines():
    x=json.loads(line);s=x.get('snapshot',{});q=s.get('request',{});r=s.get('response',{})
    out.append({'url':q.get('url'),'status':r.get('status'),'time':s.get('time'),'timings':s.get('timings'),'failure':s.get('_failureText')})
  if n.endswith('.trace'):
   for line in z.read(n).decode().splitlines():
    x=json.loads(line)
    if x.get('type') in ['console','event'] and ('error' in str(x).lower()):out.append(x)
Path('docs/assessment-workflow-implementation/independent-qa/next-trace-summary.json').write_text(json.dumps(out,indent=2))
print(json.dumps(out,indent=2))

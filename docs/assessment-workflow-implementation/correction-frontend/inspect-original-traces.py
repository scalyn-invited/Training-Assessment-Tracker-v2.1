from pathlib import Path
import json, zipfile
base=Path('docs/assessment-workflow-implementation')
output=[]
for root in [base/'independent-qa/traces/next-first',base/'independent-qa/traces/next-serialized']:
 for p in root.rglob('trace.zip'):
  rows=[]
  with zipfile.ZipFile(p) as z:
   for name in z.namelist():
    if name.endswith('.network'):
     for line in z.read(name).decode().splitlines():
      snap=json.loads(line).get('snapshot',{});url=snap.get('request',{}).get('url','')
      if '_rsc=' in url:rows.append({'url':url,'status':snap.get('response',{}).get('status'),'time':snap.get('time')})
  output.append({'trace':str(p),'rsc':rows})
p=base/'correction-frontend/original-trace-readback.json';p.write_text(json.dumps(output,indent=2));print(p.read_text())

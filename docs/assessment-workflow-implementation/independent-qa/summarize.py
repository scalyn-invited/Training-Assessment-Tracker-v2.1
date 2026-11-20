from pathlib import Path
import re,json,shutil,hashlib,zipfile
base=Path('docs/assessment-workflow-implementation/independent-qa')
s=re.sub(r'\x1b\[[0-9;]*m','',(base/'domain.log').read_text(encoding='utf8'))
rows=[]
for line in s.splitlines():
 m=re.search(r'^\s*([✓❯↓]) (tests/\S+\.test\.ts) \((\d+) tests?(?:\s*\|\s*(\d+) (failed|skipped))?\)',line)
 if m: rows.append({'file':m[2],'tests':int(m[3]),'failed':int(m[4]) if m[5]=='failed' else 0,'skipped':int(m[4]) if m[5]=='skipped' else 0})
r={'completed_file_summaries_only':rows,'passed':sum(x['tests']-x['failed']-x['skipped'] for x in rows),'failed':sum(x['failed'] for x in rows),'skipped':sum(x['skipped'] for x in rows),'full_run_complete':False,'exit':15}
(base/'domain-partial-summary.json').write_text(json.dumps(r,indent=2))
print(json.dumps(r,indent=2))
for label,src in [('browser-first','.runtime/independent-browser-results-initial'),('browser-rerun','.runtime/independent-browser-results'),('next-first','.runtime/independent-next-results-initial'),('next-serialized','.runtime/independent-next-results')]:
 for p in Path(src).rglob('*'):
  if p.is_file() and p.name in ['trace.zip','error-context.md']:
   target=base/'traces'/label/p.parent.name/p.name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)

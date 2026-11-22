import psutil,json,time
from pathlib import Path
p=psutil.Process(15056)
cmd=' '.join(p.cmdline())
assert p.ppid()==30440 and 'vitest.mjs run' in cmd and 'tat-assessment-workflow' in cmd and 'independent-qa' in cmd, 'Refuse unrelated process'
children=p.children(recursive=True)
record={'status':'bounded full regression stopped without completed report','runner':p.pid,'command':cmd,'children':[c.pid for c in children]}
Path('docs/assessment-workflow-implementation/independent-qa/domain-stop.json').write_text(json.dumps(record,indent=2))
for c in reversed(children):
 try:c.terminate()
 except psutil.NoSuchProcess:pass
try:p.terminate()
except psutil.NoSuchProcess:pass
psutil.wait_procs(children+[p],timeout=20)
print(json.dumps(record,indent=2))

"""Bounded QA runner: accepted component suites only; no main DB/browser use."""
import datetime, json, os, pathlib, socket, subprocess
import psutil
root = pathlib.Path.cwd().resolve()
assert root.name == 'Training Assessment Tracker V2.1'
out = root / 'docs/loading-animation/qa-runtime-t_7b33ab54'
out.mkdir(exist_ok=True)
tmp = root / '.runtime/qa-t_7b33ab54-temp'
tmp.mkdir(exist_ok=True)
env = os.environ.copy()
for key in ('TEMP','TMP','TMPDIR'):
    env[key] = str(tmp)
ports = [3110,3111,55432,3280,3281,3490,3491,55449]
for port in ports:
    with socket.socket() as s:
        s.bind(('127.0.0.1',port))
summary = {'started':datetime.datetime.now(datetime.timezone.utc).isoformat(),'portsVerifiedFree':ports,'temp':str(tmp),'mainBrowserUsed':False,'databaseFixturesUsed':False,'tests':[],'integrationWorkerPid':39512,'integrationWorkerAlive':psutil.pid_exists(39512)}
commands = [
 ('01-loading',['npx.cmd','--no-install','playwright','test','-c','playwright.loading-animation.config.ts','--output='+str(out/'loading')]),
 ('02-selectors',['npx.cmd','--no-install','playwright','test','-c','playwright.theme-picker.config.ts','--output='+str(out/'selectors')]),
 ('03-builder',['npx.cmd','--no-install','playwright','test','-c','playwright.builder-workflow.config.ts','--output='+str(out/'builder')]),
 ('04-policy',['npx.cmd','--no-install','vitest','run','-c','vitest.appearance.config.ts']),
 ('05-types',['npm.cmd','run','typecheck'])]
for name, command in commands:
    print('Running '+name, flush=True)
    with (out/(name+'.log')).open('w',encoding='utf-8') as log:
        result = subprocess.run(command,env=env,stdout=log,stderr=subprocess.STDOUT)
    summary['tests'].append({'command':command,'exitCode':result.returncode,'log':str(out/(name+'.log'))})
    (out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(name+' exit '+str(result.returncode),flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)
summary['finished']=datetime.datetime.now(datetime.timezone.utc).isoformat()
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))

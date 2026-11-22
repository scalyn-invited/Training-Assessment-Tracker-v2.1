"""Read-only app inventory; writes only the explicitly named new evidence file.
Run from app root: python docs/loading-animation/preflight-t_0ca98965.py OUTPUT.json
Never stops processes, reads secret values, copies runtime, or changes Git refs.
"""
import datetime, hashlib, json, pathlib, subprocess, sys, urllib.request
import psutil
root = pathlib.Path.cwd().resolve()
out = pathlib.Path(sys.argv[1])
if out.exists():
    raise SystemExit('Refusing to overwrite evidence; choose a new output path')
def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args):
    p = subprocess.run(['git', *args], capture_output=True, text=True)
    return {'command': ['git', *args], 'exitCode': p.returncode, 'stdout': p.stdout, 'stderr': p.stderr}
commands = [git('branch','--show-current'), git('rev-parse','HEAD'), git('status','--short','--untracked-files=all'), git('worktree','list','--porcelain'), git('show-ref'), git('diff','--exit-code','HEAD'), git('diff','--check'), git('merge-base','--is-ancestor','ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e','HEAD'), git('log','--format=%H %s','ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e..HEAD'), git('diff','--exit-code','bf3befe015e33d5584dcaec53d372ce5916463b9','HEAD','--','apps','packages'), git('diff','--exit-code','ba5856f4b0566a93803b994c0b9cd3ef0a1b0a2e','HEAD','--','packages','apps/api','apps/worker','scripts/dev.ts','package.json','package-lock.json')]
assert all(c['exitCode']==0 for c in commands)
prior=json.loads((root/'docs/loading-animation/ROLLOUT-VERIFICATION.json').read_text())
processes=[]
for old in prior['processes']:
    p=psutil.Process(old['pid'])
    assert p.create_time()==old['created'] and p.cwd()==old['cwd'] and p.cmdline()==old['command'] and p.ppid()==old['ppid']
    ports=sorted(c.laddr.port for c in p.net_connections() if c.status=='LISTEN')
    assert ports==old['ports']
    # Read only allowlisted non-secret flags and storage paths from the process.
    env=p.environ()
    flags={k:env.get(k) for k in old['disabledFlags']}
    assert all(v=='false' for v in flags.values())
    processes.append({'pid':p.pid,'created':p.create_time(),'ppid':p.ppid(),'cwd':p.cwd(),'command':p.cmdline(),'ports':ports,'disabledFlags':flags,'privateStoragePath':env.get('PRIVATE_STORAGE_PATH','.runtime/private'),'databaseUrlConfigured':bool(env.get('DATABASE_URL'))})
listeners=[{'pid':c.pid,'address':c.laddr.ip,'port':c.laddr.port} for c in psutil.net_connections(kind='tcp') if c.status=='LISTEN' and c.laddr.port in (3100,3101,55431)]
backup=root/'.runtime/loading-backup-t_a9d4c15b'
state=json.loads((backup/'preservation.json').read_text())
assert all(sha(backup/'data'/rel)==h for rel,h in state['backupFiles'].items())
assert all(sha(root/rel)==h for rel,h in state['unchangedFiles'].items())
http=[]
for url in ['http://127.0.0.1:3101/health/live','http://127.0.0.1:3101/health/ready','http://localhost:3100/api/health/ready','http://localhost:3100/login']:
    with urllib.request.urlopen(url,timeout=60) as r:
        b=r.read(); item={'url':url,'status':r.status}
        if '/health/' in url: item['body']=json.loads(b)
        else: item['htmlBytes']=len(b)
        assert r.status==200
        http.append(item)
untracked=git('ls-files','--others','--exclude-standard','--','docs')['stdout'].splitlines()
docHashes={rel:sha(root/rel) for rel in untracked}
tracked=git('ls-files','-z')['stdout'].split('\0')
trackedHashes={rel:sha(root/rel) for rel in tracked if rel and (root/rel).is_file()}
stable={'head':commands[1]['stdout'].strip(),'branch':commands[0]['stdout'].strip(),'trackedContentSha256':hashlib.sha256(json.dumps(trackedHashes,sort_keys=True).encode()).hexdigest(),'untrackedDocs':docHashes,'worktrees':commands[3]['stdout'],'refs':commands[4]['stdout'],'processes':processes,'protectedConfigAggregateSha256':hashlib.sha256(json.dumps(state['unchangedFiles'],sort_keys=True).encode()).hexdigest()}
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'root':str(root),'commands':commands,'fingerprint':stable,'fingerprintSha256':hashlib.sha256(json.dumps(stable,sort_keys=True).encode()).hexdigest(),'listeners':listeners,'backupHashesVerified':len(state['backupFiles']),'protectedConfigAssetHashesVerified':len(state['unchangedFiles']),'http':http,'liveDatabaseBytesHashed':False,'renderedVerified':False,'limitations':['Fingerprint excludes ignored live DB/cache and other worktree file contents.','New evidence/report files change untracked docs on later captures; compare maps and explain differences.','Process identity and on-disk source do not prove in-memory compiled-module equality.']}
out.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['checkedAt','fingerprintSha256','listeners','backupHashesVerified','protectedConfigAssetHashesVerified','http']},indent=2))

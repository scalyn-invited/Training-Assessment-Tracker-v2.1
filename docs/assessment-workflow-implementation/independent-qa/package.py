from pathlib import Path
import hashlib,json,zipfile,subprocess
base=Path('docs/assessment-workflow-implementation/independent-qa')
# All content is synthetic QA; include reports/logs/tests/screenshots/traces, no runtime DB or browser profile.
files=sorted(p for p in base.rglob('*') if p.is_file() and p.name not in ['manifest.json','archive-verification.json'] and '__pycache__' not in p.parts)
manifest={str(p.relative_to(base)).replace('\\','/'):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
(base/'manifest.json').write_text(json.dumps(manifest,indent=2))
archive=base.parent/'independent-qa-evidence.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[base/'manifest.json']: z.write(p,str(p.relative_to(base)))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 for n,v in manifest.items(): assert hashlib.sha256(z.read(n)).hexdigest()==v['sha256']
result={'archive':str(archive.resolve()),'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'payload_files':len(files),'zip_entries':len(files)+1,'crc_and_hashes':'verified'}
assert result['bytes']<25*1024*1024
(base/'archive-verification.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))

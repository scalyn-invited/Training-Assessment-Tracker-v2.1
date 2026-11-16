"""Package only this stage's Git-tracked evidence; never runtime or upstream untracked files."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path.cwd()
evidence = Path('docs/assessment-workflow-implementation')
base = '79f8cee43fea1c5c160a0c94bc202931e8ae031b'
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
paths = subprocess.check_output(['git', 'diff', '--name-only', base, commit, '--', str(evidence)], text=True).splitlines()
paths = sorted(p for p in paths if Path(p).suffix in {'.md', '.log', '.png'})
manifest = {'base': base, 'commit': commit, 'files': []}
archive = root / evidence / 'implementation-evidence.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for name in paths:
        data = (root / name).read_bytes()
        manifest['files'].append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        z.writestr(name, data)
    z.writestr('manifest.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(paths) + 1
    for entry in manifest['files']:
        assert hashlib.sha256(z.read(entry['path'])).hexdigest() == entry['sha256']
print(json.dumps({'archive': str(archive), 'commit': commit, 'payload_files': len(paths), 'entries': len(paths)+1, 'bytes': archive.stat().st_size, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2))

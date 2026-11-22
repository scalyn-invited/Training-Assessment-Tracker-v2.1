"""Package only this task's public synthetic evidence, never runtime/auth files."""
from pathlib import Path
import hashlib
import json
import zipfile
root = Path(__file__).resolve().parent
files = [root / 'QA-prerequisites-handoff.md']
files += sorted(root.glob('QA-*.log'))
files += sorted((root / 'qa-screenshots').glob('*.png'))
assert all(p.is_file() for p in files)
manifest = {'files': [{'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files], 'screenshots': len(list((root / 'qa-screenshots').glob('*.png')))}
manifest_path = root / 'QA-package-manifest.json'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
archive = root / 'QA-prerequisites-evidence.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files + [manifest_path]:
        z.write(p, p.relative_to(root).as_posix())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(files) + 1
    for item in manifest['files']:
        assert hashlib.sha256(z.read(item['path'])).hexdigest() == item['sha256']
print(json.dumps({'archive': str(archive), 'payload_files': len(files), 'screenshots': manifest['screenshots'], 'zip_entries': len(files)+1, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'verified': True}, indent=2))

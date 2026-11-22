"""Compare read-only fingerprints; writes a new evidence report only."""
import json
from pathlib import Path
base = Path('docs/loading-animation')
a = json.loads((base / 'PREFLIGHT-STATE-t_0ca98965.json').read_text())['fingerprint']
b = json.loads((base / 'INTEGRATION-STATE-t_4e1cf4b3.json').read_text())['fingerprint']
keys = [k for k in a if k != 'untrackedDocs']
matched = {k: a[k] == b[k] for k in keys}
removed = sorted(set(a['untrackedDocs']) - set(b['untrackedDocs']))
changed = sorted(k for k in a['untrackedDocs'] if k in b['untrackedDocs'] and a['untrackedDocs'][k] != b['untrackedDocs'][k])
added = sorted(set(b['untrackedDocs']) - set(a['untrackedDocs']))
expected = {'docs/loading-animation/INTEGRATION-ELIGIBILITY.md', 'docs/loading-animation/PREFLIGHT-STATE-t_0ca98965.json', 'docs/loading-animation/PREFLIGHT-SCHEMA-t_0ca98965.json', 'docs/loading-animation/PREFLIGHT-t_0ca98965.md', 'docs/loading-animation/INTEGRATION-POLICY-t_4e1cf4b3.log', 'docs/loading-animation/INTEGRATION-TYPES-t_4e1cf4b3.log'}
result = {'stableFieldsMatch': matched, 'removedDocs': removed, 'changedDocs': changed, 'addedDocs': added, 'unexpectedAdditions': sorted(set(added)-expected), 'explanation': 'Only preflight/lineage evidence and this task concurrent policy/type logs may be added. Live DB/cache and other worktree contents excluded.'}
assert all(matched.values()) and not removed and not changed and not result['unexpectedAdditions'], result
out = base / 'INTEGRATION-COMPARISON-t_4e1cf4b3.json'
with out.open('x') as f:
    json.dump(result, f, indent=2)
    f.write('\n')
print(json.dumps(result, indent=2))

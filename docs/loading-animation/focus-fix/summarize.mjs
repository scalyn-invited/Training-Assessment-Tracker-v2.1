import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('./', import.meta.url);
for (const name of readdirSync(root).filter(n => n.endsWith('.txt')).sort()) {
  const text = readFileSync(new URL(name, root), 'utf8');
  console.log(name, text.split('\n').filter(l => /\d+ (passed|failed)|Tests\s|error TS/.test(l)).join(' | '));
}
for (const name of ['01-red-frames.json', '03-green-frames.json', '17-final-frames.json']) {
  const rows = JSON.parse(readFileSync(new URL(name, root), 'utf8'));
  assert.deepEqual(rows.map(r => r.width), [1440, 820, 390]);
  console.log(name, JSON.stringify(rows.map(r => ({width:r.width, pending:r.pendingFocus, settled:r.settledFocus, neutralFrames:r.frames.filter(f=>f.neutral).length, neutralBodyFrames:r.frames.filter(f=>f.neutral && f.focus==='BODY').length}))));
  if (!name.startsWith('01')) for (const r of rows) {
    assert.equal(r.pendingFocus.tag, 'MAIN');
    assert.equal(r.settledFocus.tag, 'MAIN');
    assert.equal(r.frames.filter(f=>f.neutral && f.focus==='BODY').length, 0);
  }
}

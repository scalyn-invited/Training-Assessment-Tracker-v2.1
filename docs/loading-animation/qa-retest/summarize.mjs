import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
const dir = 'docs/loading-animation/qa-retest';
const rows = JSON.parse(readFileSync(`${dir}/temporal-focus.json`, 'utf8')).map(r => {
 const neutral = r.frames.filter(f => f.neutral);
 const row = {width:r.width, pending:r.pendingFocus, settled:r.settledFocus, neutralFrames:neutral.length, bodyFrames:neutral.filter(f=>f.focus==='BODY').length, privateFrames:neutral.filter(f=>f.heading||f.userVisible).length};
 assert.equal(row.pending.tag,'MAIN'); assert.equal(row.settled.tag,'MAIN'); assert.ok(row.neutralFrames>0); assert.equal(row.bodyFrames,0); assert.equal(row.privateFrames,0); return row;
});
assert.deepEqual(rows.map(r=>r.width),[1440,820,390]);
const result={temp:os.tmpdir(),rows};
writeFileSync(`${dir}/summary.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));

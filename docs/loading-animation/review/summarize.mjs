import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = 'docs/loading-animation/review/';
const records = JSON.parse(await readFile(root + 'temporal-focus.json', 'utf8'));
assert.equal(records.length, 3);
const frames = records.map(r => {
  const neutral = r.frames.filter(f => f.neutral);
  const body = neutral.filter(f => f.focus === 'BODY');
  const leaks = neutral.filter(f => f.heading || f.userVisible);
  assert.ok(neutral.length > 0);
  assert.equal(body.length, 0);
  assert.equal(leaks.length, 0);
  assert.equal(r.pendingFocus.tag, 'MAIN');
  assert.equal(r.settledFocus.tag, 'MAIN');
  return { width: r.width, frames: r.frames.length, neutral: neutral.length, body: body.length, leaks: leaks.length, pendingFocus: r.pendingFocus, settledFocus: r.settledFocus };
});
const logs = {};
for (const name of ['loading','policy','types','build','temporal','scope','builder-gate','navigation','guest','selectors']) {
 const text = await readFile(root + name + '.log', 'utf8');
 logs[name] = text.split(/\r?\n/).filter(line => /passed|failed|Compiled successfully|Finished TypeScript/.test(line));
}
const summary = { frames, logs };
await writeFile(root + 'summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));

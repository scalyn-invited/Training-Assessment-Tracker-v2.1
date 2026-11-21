const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const base = 'bd01bcca8c915b82f118fff528ccf778b54ec84e';
const candidate = '397c6a33672ca01cecceb0087afa41f877719d77';
const expected = { 'tests/overview-browser/overview.spec.ts': 2, 'tests/recovery-ui-browser/recovery.spec.ts': 1 };
const before = "settings.locator('summary')";
const after = "settings.getByRole('button', { name: /^Theme(?: |$)/ })";
const files = git('diff', '--name-only', base, candidate).trim().split('\n');
assert.deepEqual(files.sort(), Object.keys(expected).sort());
let total = 0;
for (const file of files) {
  const oldText = git('show', `${base}:${file}`);
  const newText = git('show', `${candidate}:${file}`);
  const count = oldText.split(before).length - 1;
  assert.equal(count, expected[file]);
  assert.equal(newText, oldText.replaceAll(before, after));
  assert.equal(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), newText);
  total += count;
  console.log(`PASS ${file}: ${count} exact replacements; complete remaining source preserved`);
}
assert.equal(total, 3);
assert.equal(git('diff', base, '--', 'apps', 'packages'), '');
for (const p of ['docs/latest-ui-integration/REVIEW.md', 'docs/latest-ui-integration/logs/review-scope.log', 'docs/latest-ui-integration/logs/li-review-01-qa-overview.log', 'docs/latest-ui-integration/logs/li-review-01-qa-overview-repeat.log']) assert.equal(git('diff', base, '--', p), '');
assert.equal(git('rev-parse', 'ui/global-design-system').trim(), 'ff1d19fb427c054efd9e48bc546c9ec1398ef835');
git('diff', '--check', base, candidate);
console.log('PASS no product edits; main ref and prior review/failure logs unchanged');
const risks = [];
for (const file of git('ls-files', 'tests').trim().split('\n')) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/(personal|queueSettings)\.locator\('summary'\)/.test(line)) {
      risks.push({ file, line: i + 1, context: lines.slice(Math.max(0, i - 2), i + 3) });
    }
  });
}
console.log(`SOURCE-ONLY remaining Personal settings Theme risks: ${risks.length} sites across ${new Set(risks.map(r => r.file)).size} files; not runtime-qualified or modified`);
console.log(JSON.stringify(risks, null, 2));

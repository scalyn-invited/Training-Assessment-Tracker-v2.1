const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const base = '9c50f93912d404c75b0eeb46192edc3603a7bf50';
const candidate = '8e082f0f026ac31692dd5de36fc17f2fbc08c23c';
const expected = {
  'tests/browser/foundation.spec.ts': 3,
  'tests/expanded-appearance-browser/scope-instrumented.spec.ts': 1,
  'tests/expanded-appearance-browser/scope.spec.ts': 1,
  'tests/expanded-appearance-browser/screenshot-calibration.spec.ts': 1,
  'tests/overview-browser/overview.spec.ts': 1,
  'tests/shell-browser/shell.spec.ts': 1,
};
const before = "page.locator('summary').filter({ hasText: 'Workspace' })";
const after = "page.getByRole('button', { name: /^Workspace / })";
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
  console.log(`PASS ${file}: ${count} locator-only replacements; all other bytes preserved`);
}
assert.equal(total, 8);
assert.equal(git('diff', base, '--', 'docs/latest-ui-integration/logs/review-scope.log'), '');
assert(fs.existsSync('output/latest-ui-review-scope-results/scope-real-API-scoped-navi-fddc4-in-the-previous-scope-theme/error-context.md'));
git('diff', '--check', base, candidate);
console.log(`PASS ${total} replacements across ${files.length} files; original assertions, guards, role predicates and timeouts unchanged; diff check clean`);
console.log('PASS original tracked failure log unchanged; original untracked failure context still present (not rewritten by this run)');

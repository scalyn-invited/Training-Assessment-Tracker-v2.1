const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const git = (...a) => cp.execFileSync('git', a, {encoding:'utf8'});
const base = '9c50f93912d404c75b0eeb46192edc3603a7bf50';
const corrected = '8e082f0f026ac31692dd5de36fc17f2fbc08c23c';
const tested = '59a035b6ac9960c22772a9df95109c094a29ecde';
const oldLocator = "page.locator('summary').filter({ hasText: 'Workspace' })";
const newLocator = "page.getByRole('button', { name: /^Workspace / })";
const files = git('diff','--name-only',base,corrected).trim().split('\n');
assert.equal(files.length,6);
let count = 0;
for (const file of files) {
 assert(file.startsWith('tests/'));
 const before = git('show',`${base}:${file}`);
 const after = git('show',`${corrected}:${file}`);
 count += before.split(oldLocator).length-1;
 assert.equal(after.replaceAll(newLocator,oldLocator),before);
 assert.equal(git('show',`${tested}:${file}`),after);
 assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),after);
 console.log('PASS reverse-normalized complete source equality: '+file);
}
assert.equal(count,8);
const evidenceFiles = git('diff','--name-only',corrected,tested).trim().split('\n');
assert(evidenceFiles.every(f=>f.startsWith('docs/latest-ui-integration/')));
console.log('PASS 8 locator replacements; every other byte/assertion/timeout/guard/role predicate preserved; tested HEAD adds only docs/evidence.');
for(const f of ['docs/latest-ui-integration/REVIEW.md','docs/latest-ui-integration/logs/review-scope.log']) {
 assert.equal(git('diff',base,'--',f),'');
 console.log('UNCHANGED '+f+' SHA256 '+crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'));
}
const summary={tested,corrected,checks:{}};
for (const name of ['build','scope','instrumented','calibration','overview','overview-repeat','shell','foundation','selectors','policy','types']) {
 const text=fs.readFileSync(`docs/latest-ui-integration/logs/li-review-01-qa-${name}.log`,'utf8').replace(/\x1b\[[0-9;]*m/g,'');
 const lines=text.split(/\r?\n/).filter(l=>/\d+ passed|\d+ failed|Test Files|Tests\s|toBeFocused|Error:/.test(l));
 summary.checks[name]=lines;
 console.log(name+': '+lines.join(' | '));
}
fs.writeFileSync('docs/latest-ui-integration/logs/li-review-01-qa-summary.json',JSON.stringify(summary,null,2)+'\n');

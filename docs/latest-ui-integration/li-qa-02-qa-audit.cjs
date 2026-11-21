const fs = require('node:fs');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const git = (...args) => execFileSync('git', args, {encoding:'utf8'});
const base='bd01bcca8c915b82f118fff528ccf778b54ec84e';
const tested='46db637ce3a27c2ec5fb3de2487262211a4f4371';
const correction='397c6a33672ca01cecceb0087afa41f877719d77';
const files=['tests/overview-browser/overview.spec.ts','tests/recovery-ui-browser/recovery.spec.ts'];
assert.deepEqual(git('diff','--name-only',base,correction).trim().split('\n').sort(),files);
for(const [i,file] of files.entries()) {
 const old=git('show',`${base}:${file}`), current=git('show',`${tested}:${file}`);
 const target="settings.getByRole('button', { name: /^Theme(?: |$)/ })";
 assert.equal(current.split(target).length-1,[2,1][i]);
 assert.equal(current.replaceAll(target,"settings.locator('summary')"),old);
 assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),current);
 console.log(`PASS reverse-normalized full source ${file}; assertions/actions/timeouts/guards unchanged`);
}
assert.equal(git('diff',correction,tested,'--','apps','packages','tests'),'');
assert.equal(git('diff',base,'--','apps','packages'),'');
for(const file of ['REVIEW.md','logs/review-scope.log','logs/li-review-01-qa-overview.log','logs/li-review-01-qa-overview-repeat.log']) {
 assert.equal(git('diff',base,'--',`docs/latest-ui-integration/${file}`),'');
 console.log(`PASS preserved ${file}`);
}
assert.equal(git('rev-parse','ui/global-design-system').trim(),'ff1d19fb427c054efd9e48bc546c9ec1398ef835');
assert.equal(git('diff',tested,'--','tests'),'');
git('diff','--check',base,correction);
console.log(`PASS no product/test working changes; main preserved; tested ${tested}; correction ${correction}`);
for(const name of ['build','overview','recovery','scope','selectors','policy','types']) {
 const log=fs.readFileSync(`docs/latest-ui-integration/logs/li-qa-02-qa-${name}.log`,'utf8');
 console.log(name+': '+log.split(/\r?\n/).filter(x=>/passed|Compiled successfully|Test Files|Tests |tsc/.test(x)).join('\n'));
}

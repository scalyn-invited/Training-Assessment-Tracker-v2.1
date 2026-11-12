import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const baseline = JSON.parse(
  (await readFile('docs/implementation/source-baseline.json', 'utf8')).replace(/^\uFEFF/, ''),
);
const changed: string[] = [];
for (const file of baseline.files) {
  try {
    const bytes = await readFile(path.join(baseline.source, file.path));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) changed.push(file.path);
  } catch {
    changed.push(file.path);
  }
}
if (changed.length) {
  console.error('Source baseline changed:', changed);
  process.exitCode = 1;
} else console.log('All ' + baseline.files.length + ' captured source hashes unchanged.');

const fs = require('node:fs');
const path = require('node:path');
const root = 'evidence/rework/browser-final';
const summaries = [];
for (const directory of fs.readdirSync(root)) {
 const file = path.join(root, directory, 'geometry.json');
 if (!fs.existsSync(file)) continue;
 const data = JSON.parse(fs.readFileSync(file, 'utf8'));
 if (!Array.isArray(data)) continue;
 for (const row of data) summaries.push({condition:row.name, samples:row.frames.length, pending:row.frames.filter(f=>!f.form).length, rectangles:Object.fromEntries(['intro','footer','theme'].map(key=>[key,[...new Set(row.frames.map(f=>JSON.stringify(f[key])))].map(s=>JSON.parse(s))]))});
}
console.log(JSON.stringify(summaries,null,2));
fs.writeFileSync('evidence/rework/geometry-summary.json',JSON.stringify(summaries,null,2));

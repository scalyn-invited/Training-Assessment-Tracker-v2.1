const fs = require('node:fs');
const path = require('node:path');
const base = 'evidence/expanded/production-repeat';
const transition = JSON.parse(fs.readFileSync(base + '/scope-transition.json', 'utf8'));
const groups = {};
for (const f of transition.frames) {
  const k = f.path + '|' + f.theme + '|' + (f.heading || '');
  groups[k] ??= { count: 0, first: f.t, last: f.t };
  groups[k].count++;
  groups[k].last = f.t;
}
const controls = {};
for (const file of fs.readdirSync(base).filter((f) => f.endsWith('-frames.json'))) {
  const rows = JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'));
  controls[file] = {
    count: rows.length,
    themes: [...new Set(rows.map((f) => f.theme))],
    paths: [...new Set(rows.map((f) => f.path))],
  };
}
const routes = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'page.tsx') routes.push(p.replaceAll('\\', '/'));
  }
}
walk('apps/web/app');
const inventory = fs.readFileSync('evidence/expanded/route-inventory.md', 'utf8');
const rows = [...inventory.matchAll(/^\| \d\d \|/gm)];
const out = {
  candidate: 'b1ec076f72c4650785f5e73997e95a0a31d6d3bd',
  routeCount: routes.length,
  inventoryRows: rows.length,
  pendingTheme: transition.pending.theme,
  groups,
  controls,
  identity: JSON.parse(fs.readFileSync(base + '/identity-summary.json', 'utf8')),
};
fs.writeFileSync('evidence/expanded/summary.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

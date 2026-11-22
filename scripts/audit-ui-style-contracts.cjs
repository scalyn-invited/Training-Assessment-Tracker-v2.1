// Read-only source audit. Optional --report writes JSON to the supplied local path.
// CSS syntax is the repository's current class/functional-:global CSS Modules subset.
// Dynamic lookups and unused-class candidates require review, not automatic deletion.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const postcss = require('postcss');
const parser = require('next/dist/compiled/babel/bundle').parser();

const files = execFileSync('rg', ['--files', 'apps/web/app'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .map((file) => file.replaceAll('\\', '/'));
const sourceFiles = files.filter((file) => /\.[jt]sx?$/.test(file));
const modules = new Map();
const compositions = [];

for (const file of files.filter((file) => file.endsWith('.module.css'))) {
  const root = postcss.parse(fs.readFileSync(file, 'utf8'));
  const names = new Set();
  root.walkRules((rule) => {
    const local = rule.selector.replace(/:global\([^)]*\)/g, '');
    for (const match of local.matchAll(/\.([a-zA-Z_][\w-]*)/g)) names.add(match[1]);
  });
  root.walkDecls('composes', (declaration) => {
    const [names, from] = declaration.value.split(/\s+from\s+/);
    if (from === 'global') return;
    const target = from
      ? path.posix.normalize(path.posix.join(path.posix.dirname(file), from.replace(/['"]/g, '')))
      : file;
    for (const key of names.trim().split(/\s+/)) {
      compositions.push({ file, module: target, key, line: declaration.source.start.line });
    }
  });
  modules.set(file, names);
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  callback(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((child) => visit(child, callback));
    else if (value && typeof value === 'object') visit(value, callback);
  }
}

const imports = [];
const references = [];
const dynamic = [];
const rawDialogs = [];
const importGraph = new Map();
function resolveDependency(file, specifier) {
  if (!specifier?.startsWith('.')) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return [
    base,
    ...['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'].map((suffix) => base + suffix),
  ].find((candidate) => sourceFiles.includes(candidate));
}
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(source, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] });
  const bindings = new Map();
  const dependencies = [];
  for (const node of ast.program.body) {
    if (node.source?.value?.startsWith('.') && node.importKind !== 'type') {
      const dependency = resolveDependency(file, node.source.value);
      if (dependency) dependencies.push(dependency);
    }
    if (node.type !== 'ImportDeclaration' || !node.source.value.endsWith('.module.css')) continue;
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), node.source.value),
    );
    for (const specifier of node.specifiers) bindings.set(specifier.local.name, target);
    imports.push({ file, module: target });
  }
  importGraph.set(file, dependencies);
  visit(ast, (node) => {
    const imported =
      node.type === 'ImportExpression'
        ? node.source
        : node.type === 'CallExpression' && node.callee.type === 'Import'
          ? node.arguments[0]
          : null;
    if (imported?.type === 'StringLiteral') {
      const dependency = resolveDependency(file, imported.value);
      if (dependency) dependencies.push(dependency);
    }
    if (node.type === 'JSXOpeningElement' && node.name.name === 'dialog') {
      rawDialogs.push({ file, line: node.loc.start.line });
    }
    if (
      node.type !== 'MemberExpression' ||
      node.object.type !== 'Identifier' ||
      !bindings.has(node.object.name)
    )
      return;
    const key = !node.computed
      ? node.property.name
      : node.property.type === 'StringLiteral'
        ? node.property.value
        : null;
    const item = {
      file,
      line: node.loc.start.line,
      module: bindings.get(node.object.name),
      key,
      expression: source.slice(node.start, node.end),
    };
    (key === null ? dynamic : references).push(item);
  });
}

const missing = [...references, ...compositions].filter(
  (item) => !modules.get(item.module)?.has(item.key),
);
const orphanModules = [...modules.keys()].filter(
  (module) => ![...imports, ...compositions].some((item) => item.module === module),
);
const unusedClassCandidates = [...modules].flatMap(([module, names]) =>
  [...names]
    .filter(
      (key) =>
        ![...references, ...compositions].some(
          (item) => item.module === module && item.key === key,
        ) && !dynamic.some((item) => item.module === module),
    )
    .map((key) => ({ module, key })),
);
const pageRoutes = files
  .filter((file) => file.endsWith('/page.tsx'))
  .map((file) => file.slice('apps/web/app'.length, -'/page.tsx'.length) || '/')
  .sort();
const inventory = fs.readFileSync('docs/implementation/GLOBAL_UI_ROUTE_INVENTORY.md', 'utf8');
const missingRouteRows = pageRoutes.filter((route) => !inventory.includes('| `' + route + '` |'));
function reaches(file, target, seen = new Set()) {
  if (file === target) return true;
  if (seen.has(file)) return false;
  seen.add(file);
  return (importGraph.get(file) ?? []).some((dependency) => reaches(dependency, target, seen));
}
// Dependency reachability is an audit aid, not proof of every runtime branch.
// AppShell's single ApplicationShell/GuestShell choice is reviewed separately.
const presentationDependencies = files
  .filter((file) => /\/(page|error|not-found)\.tsx$/.test(file))
  .map((file) => ({
    file,
    appShell: reaches(file, 'apps/web/app/components/app-shell.tsx'),
    recoveryFrame: reaches(file, 'apps/web/app/components/recovery-frame.tsx'),
  }));
const unreferencedSourceCandidates = sourceFiles.filter(
  (file) =>
    !/\/(page|layout|error|not-found)\.tsx$/.test(file) &&
    !file.endsWith('.d.ts') &&
    ![...importGraph.values()].some((dependencies) => dependencies.includes(file)),
);
const report = {
  sourceFiles: sourceFiles.length,
  moduleFiles: modules.size,
  staticReferences: references.length,
  compositions: compositions.length,
  missing,
  dynamic,
  orphanModules,
  unusedClassCandidates,
  rawDialogs,
  pageRoutes,
  missingRouteRows,
  presentationDependencies,
  unreferencedSourceCandidates,
  imports,
};
const reportIndex = process.argv.indexOf('--report');
if (reportIndex >= 0) {
  const destination = process.argv[reportIndex + 1];
  if (!destination) throw new Error('--report requires a local output path');
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
}
console.log(
  JSON.stringify(
    {
      ...report,
      imports: undefined,
      presentationDependencies: undefined,
      pageRoutes: pageRoutes.length,
    },
    null,
    2,
  ),
);
if (missing.length || missingRouteRows.length) process.exitCode = 1;

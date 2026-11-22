// Read-only schema receipt compatibility; no runtime config or account rows emitted.
// Run from app root: node docs/loading-animation/preflight-schema-t_0ca98965.mjs
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
// Verified local PGlite socket only; never fall through to a different database.
const client = new pg.Client({host:'127.0.0.1',port:55431,user:'postgres',database:'postgres'});
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const {rows} = await client.query('SELECT name,sha256,tenant_role FROM schema_migrations ORDER BY name');
  const names = (await readdir('packages/database/migrations')).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort();
  const hashes = await Promise.all(names.map(async name=>({name,sha256:createHash('sha256').update(await readFile('packages/database/migrations/'+name)).digest('hex')})));
  const pending = names.filter(n=>!rows.some(r=>r.name===n));
  const unknown = rows.filter(r=>!names.includes(r.name)).map(r=>r.name);
  const mismatched = hashes.filter(h=>rows.some(r=>r.name===h.name && r.sha256!==h.sha256)).map(h=>h.name);
  const roles = [...new Set(rows.map(r=>r.tenant_role))];
  const result={checkedAt:new Date().toISOString(),readOnly:true,sourceMigrations:names.length,receipts:rows.length,pending,unknown,mismatched,defaultTenantRoleMatches:roles.length===1 && roles[0]==='tracker_tenant'};
  console.log(JSON.stringify(result,null,2));
  if(pending.length || unknown.length || mismatched.length || !result.defaultTenantRoleMatches) process.exitCode=1;
} finally {await client.query('ROLLBACK'); await client.end();}

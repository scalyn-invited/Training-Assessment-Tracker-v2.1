import path from 'node:path';
export function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error(name + ' must be a port from 1024 to 65535');
  return value;
}
export function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NODE_ENV === 'production')
    throw new Error('DATABASE_URL is required in production');
  return 'postgresql://postgres:postgres@127.0.0.1:' + port('PGLITE_PORT', 55431) + '/postgres';
}
export function privatePath(): string {
  return path.resolve(process.env.PRIVATE_STORAGE_PATH ?? '.runtime/private');
}
export function databaseMode(): 'postgresql' | 'pglite' {
  return process.env.DATABASE_URL ? 'postgresql' : 'pglite';
}

export function tenantRole(value = process.env.DATABASE_TENANT_ROLE ?? 'tracker_tenant'): string {
  if (!/^tracker_tenant(?:_[a-f0-9]{12})?$/.test(value))
    throw new Error(
      'DATABASE_TENANT_ROLE must be tracker_tenant or an installation-specific tracker_tenant_<12 hex characters> role',
    );
  return value;
}

import pg from 'pg';
import { afterAll } from 'vitest';
const original = pg.Client.prototype.query;
const stats = new Map<string, { n: number; ms: number; max: number }>();
pg.Client.prototype.query = function (this: pg.Client, ...args: any[]) {
  const text = typeof args[0] === 'string' ? args[0] : args[0]?.text || '';
  const label = text.trim().startsWith('SELECT') ? text.replace(/\s+/g, ' ').slice(0, 180) : text.trim().split(/\s+/)[0];
  const start = performance.now();
  const result = (original as any).apply(this, args);
  if (result?.then) return result.finally(() => {
    const ms = performance.now() - start;
    const s = stats.get(label) || { n: 0, ms: 0, max: 0 };
    s.n++; s.ms += ms; s.max = Math.max(s.max, ms); stats.set(label, s);
  });
  return result;
} as any;
afterAll(() => console.log('QUERY_TIMINGS', JSON.stringify(Object.fromEntries(stats))));

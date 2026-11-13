import type { Database, Sql } from '../../database/src/database.js';
import { assertFixtureMode, type DemoMode } from './demo-client.js';
/** Run existing services in one owned fixture-stage transaction. Never used by HTTP requests. */
export async function demoTransaction<T>(
  db: Database,
  work: (bound: Database) => Promise<T>,
  mode: DemoMode = 'local_password',
): Promise<T> {
  assertFixtureMode(mode);
  return db.transaction(async (sql) => {
    // The facade deliberately exposes queries only, not another connection or pool lifecycle.
    const bound = Object.create(db) as Database;
    Object.defineProperty(bound, 'pool', { value: { query: sql.query.bind(sql) } });
    let serial = 0;
    bound.transaction = async <R>(operation: (connection: Sql) => Promise<R>): Promise<R> => {
      const point = 'demo_stage_' + ++serial;
      const role = (await sql.query<{ role: string }>('SELECT current_role AS role')).rows[0].role;
      await sql.query('SAVEPOINT ' + point);
      try {
        const result = await operation(sql);
        await sql.query('SET LOCAL ROLE "' + role.replaceAll('"', '""') + '"');
        await sql.query('RELEASE SAVEPOINT ' + point);
        return result;
      } catch (error) {
        await sql.query('ROLLBACK TO SAVEPOINT ' + point);
        await sql.query('RELEASE SAVEPOINT ' + point);
        throw error;
      }
    };
    bound.close = async () => {
      throw new Error('A fixture stage cannot close its owning connection.');
    };
    return work(bound);
  });
}

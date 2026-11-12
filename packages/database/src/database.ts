import pg from 'pg';
import type { Scope } from '../../contracts/src/index.js';
import { databaseUrl } from './config.js';
export interface Sql {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>>;
}
export class Database {
  readonly pool: pg.Pool;
  constructor(url = databaseUrl()) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
  }
  async transaction<T>(work: (sql: Sql) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  async scoped<T>(scope: Scope, work: (sql: Sql) => Promise<T>): Promise<T> {
    return this.transaction(async (sql) => {
      // Runtime identity comes from the authenticated server session, never a request body.
      await sql.query('SET LOCAL ROLE tracker_tenant');
      await sql.query(
        "SELECT set_config('app.actor_id',$1,true),set_config('app.organisation_id',$2,true),set_config('app.environment',$3,true)",
        [scope.actorId, scope.organisationId, scope.environment],
      );
      return work(sql);
    });
  }
  async close() {
    await this.pool.end();
  }
}

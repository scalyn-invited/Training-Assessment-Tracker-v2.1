import pg from 'pg';
import type { Scope } from '../../contracts/src/index.js';
import { databaseUrl, tenantRole } from './config.js';
export interface Sql {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<T>>;
}
export class Database {
  readonly pool: pg.Pool;
  readonly tenantRole: string;
  constructor(url = databaseUrl(), role = tenantRole()) {
    this.tenantRole = tenantRole(role);
    this.pool = new pg.Pool({
      connectionString: url,
      options: '-c search_path=public',
      // PGlite multiplexes a single backend; serialize each process pool locally.
      // Configured PostgreSQL retains concurrent connections and race qualification.
      max: process.env.DATABASE_URL || process.env.TEST_POSTGRES_URL ? 5 : 1,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
    if (
      !process.env.DATABASE_URL &&
      !process.env.TEST_POSTGRES_URL &&
      process.env.NODE_ENV !== 'production'
    ) {
      // The local socket multiplexer pins a connection only inside a transaction.
      // Reserve it before Parse/Bind so standalone API/worker batches cannot cross.
      // Explicit transactions already use their acquired client and bypass this facade.
      this.pool.query = ((
        query: string,
        values?: unknown[] | ((error: Error | null, result?: unknown) => void),
        done?: (error: Error | null, result?: unknown) => void,
      ) => {
        const callback = typeof values === 'function' ? values : done;
        const pending = this.transaction((sql) =>
          sql.query(query, typeof values === 'function' ? undefined : values),
        );
        if (callback) {
          void pending.then(
            (result) => callback(null, result),
            (error) => callback(error),
          );
          return;
        }
        return pending;
      }) as typeof this.pool.query;
    }
    // pg removes disconnected idle clients. Never dump connection objects or credentials.
    this.pool.on('error', () => {
      console.warn('An idle database connection closed. New requests will reconnect.');
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
      await sql.query('SET LOCAL ROLE ' + this.tenantRole);
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

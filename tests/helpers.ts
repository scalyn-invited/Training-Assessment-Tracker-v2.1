import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
export async function testDatabase() {
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({
    db: pglite,
    host: '127.0.0.1',
    maxConnections: 16,
    port: 55439,
  });
  await server.start();
  const db = new Database('postgresql://postgres:postgres@127.0.0.1:55439/postgres');
  await migrate(db);
  return {
    db,
    close: async () => {
      await db.close();
      await server.stop();
      await pglite.close();
    },
  };
}
export const actor = '10000000-0000-4000-8000-000000000001',
  org = '20000000-0000-4000-8000-000000000001',
  other = '20000000-0000-4000-8000-000000000002';
export async function fixture(db: Database) {
  await db.pool.query("INSERT INTO organisations(id,name) VALUES($1,'Test A'),($2,'Test B')", [
    org,
    other,
  ]);
  await db.pool.query(
    "INSERT INTO users(id,email,name,password_hash,environment) VALUES($1,'fixture@example.invalid','Fixture','not-a-password','test')",
    [actor],
  );
  await db.pool.query(
    "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES('30000000-0000-4000-8000-000000000001',$1,'test',$2),('30000000-0000-4000-8000-000000000002',$3,'test',$2)",
    [org, actor, other],
  );
}

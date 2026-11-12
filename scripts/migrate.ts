import 'dotenv/config';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
const db = new Database(process.env.MIGRATION_DATABASE_URL);
try {
  await migrate(db);
  console.log('Migrations verified.');
} finally {
  await db.close();
}

import { InstallationState } from '../packages/domain/src/installation-state.js';
import { prepareLocalUpgrade } from '../packages/domain/src/local-upgrade.js';
const [flag, origin, ...extra] = process.argv.slice(2);
if (flag !== '--origin' || !origin || extra.length)
  throw new Error('Usage: npm run setup:upgrade:local -- --origin http://localhost:3100');
const token = await prepareLocalUpgrade(new InstallationState(), origin);
console.log(
  'Legacy configuration backed up; encryption key and old database/private files preserved. Choose a separate empty PostgreSQL database in the local setup wizard.',
);
console.log('Private one-time local upgrade token (expires in one hour):');
console.log(token);

import 'dotenv/config';
import { InstallationState } from '../packages/domain/src/installation-state.js';
const [flag, origin, ...extra] = process.argv.slice(2);
if (flag !== '--origin' || !origin || extra.length)
  throw new Error('Usage: npm run setup:prepare -- --origin https://your-application-host');
const store = new InstallationState();
await store.initialize(origin);
console.log('One-time hosted setup token (expires in one hour):');
console.log(await store.issueToken());
console.log(
  'Start the setup API and open ' +
    origin +
    '/setup/hosted. Enter this token only in that secure setup form.',
);

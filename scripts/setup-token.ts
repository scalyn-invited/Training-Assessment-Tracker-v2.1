import { InstallationState } from '../packages/domain/src/installation-state.js';
if (process.argv.slice(2).length) throw new Error('Usage: npm run setup:token');
const store = new InstallationState();
console.log('Private one-time setup token (expires in one hour; replaces the previous owner):');
console.log(await store.issueToken());

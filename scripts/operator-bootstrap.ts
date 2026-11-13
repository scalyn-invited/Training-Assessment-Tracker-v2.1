import { config } from 'dotenv';
config({ quiet: true, path: process.env.DOTENV_CONFIG_PATH });
import { Database } from '../packages/database/src/database.js';
import { Auth } from '../packages/domain/src/auth.js';
import { OperatorBootstrap } from '../packages/domain/src/operator-bootstrap.js';
import { encryptionKey } from '../packages/domain/src/crypto.js';
import { DomainError } from '../packages/domain/src/errors.js';
import { ZodError } from 'zod';
const [command, ...args] = process.argv.slice(2);
const usage =
  'Commands: training:global-admin USER --environment ENV --operator NAME --reason TEXT; training:local-setup USER --operator NAME --reason TEXT; training:initialize-production or training:initialize-local-production --name NAME --email EMAIL --operator NAME --reason TEXT [--json]';
let db: Database | undefined;
try {
  if (args.length === 1 && args[0] === '--help') console.log(usage);
  else {
    const appointment = command === 'global-admin',
      synthetic = command === 'local-setup';
    if (
      !appointment &&
      !synthetic &&
      !['initialize-production', 'initialize-local-production'].includes(command)
    )
      throw new Error(usage);
    const values: Record<string, string> = {};
    let user = '';
    if (appointment || synthetic) user = args.shift() ?? '';
    const allowed = new Set(
      appointment
        ? ['environment', 'operator', 'reason']
        : synthetic
          ? ['operator', 'reason']
          : ['name', 'email', 'operator', 'reason', 'json'],
    );
    for (let i = 0; i < args.length; i++) {
      const name = args[i].startsWith('--') ? args[i].slice(2) : '';
      if (!allowed.has(name) || Object.hasOwn(values, name))
        throw new Error('Unknown or repeated argument. ' + usage);
      if (name === 'json') values[name] = 'true';
      else {
        const value = args[++i];
        if (!value || value.startsWith('--')) throw new Error('Missing argument value. ' + usage);
        values[name] = value;
      }
    }
    for (const name of allowed)
      if (name !== 'json' && !values[name]) throw new Error('Missing --' + name + '. ' + usage);
    if ((appointment || synthetic) && !/^[a-f0-9-]{36}$/i.test(user))
      throw new Error('Supply an existing user UUID.');
    const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3100');
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash
    )
      throw new Error('Invalid application origin.');
    const key = await encryptionKey();
    db = new Database();
    const service = new OperatorBootstrap(new Auth(db, key));
    if (appointment) {
      await service.appoint(user, values.environment, values.operator, values.reason);
      console.log('Global Admin appointment recorded (or already present).');
    } else {
      const result = synthetic
        ? await service.syntheticSetup(user, values.operator, values.reason)
        : await service.initializeProduction(
            command === 'initialize-production' ? 'hosted' : 'local',
            values.name,
            values.email,
            values.operator,
            values.reason,
          );
      const url = new URL(result.path, origin.origin).href;
      if (values.json === 'true') console.log(JSON.stringify({ url }));
      else {
        console.error('Single-use setup link. Share privately; expires in one hour.');
        console.log(url);
      }
    }
  }
} catch (error) {
  console.error(
    error instanceof DomainError
      ? error.message
      : error instanceof ZodError
        ? 'Check the supplied fields and their lengths.'
        : error instanceof Error &&
            (error.message.includes('Commands:') ||
              error.message === 'Supply an existing user UUID.')
          ? error.message
          : 'Operator command failed. Check the explicit configuration and database availability.',
  );
  process.exitCode = 1;
} finally {
  await db?.close();
}

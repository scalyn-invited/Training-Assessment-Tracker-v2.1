import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from 'dotenv';
import { InstallationState, type InstallationStateData } from './installation-state.js';
import { requireCondition } from './errors.js';
/** Explicit PGlite-to-new-workspace preparation. Never reads or migrates legacy database records. */
export async function prepareLocalUpgrade(
  store: InstallationState,
  origin: string,
  external: NodeJS.ProcessEnv = process.env,
) {
  const address = new URL(origin);
  requireCondition(
    ['http:', 'https:'].includes(address.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname) &&
      address.pathname === '/' &&
      !address.search &&
      !address.hash &&
      !address.username &&
      !address.password,
    422,
    'local_origin_required',
    'Use the exact localhost application origin for the local upgrade.',
  );
  await store.locked(async () => {
    requireCondition(
      !(await store.read()),
      409,
      'installation_closed',
      'An installation is already prepared or completed. It cannot be replaced.',
    );
    const file = path.join(store.root, '.env'),
      original = await readFile(file, 'utf8'),
      configuration = parse(original);
    requireCondition(
      configuration.TRAINING_INSTALL_STATE !== 'installed' &&
        !configuration.DATABASE_URL &&
        !configuration.MIGRATION_DATABASE_URL &&
        !external.MIGRATION_DATABASE_URL &&
        !external.DATABASE_URL,
      409,
      'legacy_local_required',
      'Only a legacy local PGlite configuration can enter this upgrade. Existing configuration was preserved.',
    );
    const configuredKey = external.APP_ENCRYPTION_KEY || configuration.APP_ENCRYPTION_KEY;
    requireCondition(
      !external.APP_ENCRYPTION_KEY ||
        !configuration.APP_ENCRYPTION_KEY ||
        external.APP_ENCRYPTION_KEY.toLowerCase() ===
          configuration.APP_ENCRYPTION_KEY.toLowerCase(),
      409,
      'legacy_key_conflict',
      'Resolve conflicting encryption-key settings before preparing an upgrade.',
    );
    let key: string;
    if (configuredKey) {
      requireCondition(
        /^[a-fA-F0-9]{64}$/.test(configuredKey),
        409,
        'legacy_key_invalid',
        'The legacy encryption key is invalid; it was not replaced.',
      );
      key = configuredKey.toLowerCase();
    } else {
      const oldPrivate = path.resolve(
        store.root,
        external.PRIVATE_STORAGE_PATH || configuration.PRIVATE_STORAGE_PATH || '.runtime/private',
      );
      const bytes = await readFile(path.join(oldPrivate, 'encryption.key'));
      requireCondition(
        bytes.length === 32,
        409,
        'legacy_key_invalid',
        'Restore the legacy encryption key before preparing an upgrade.',
      );
      key = bytes.toString('hex');
    }
    const backup = path.join(store.directory, 'environment-before-upgrade.env');
    let previous: string | undefined;
    try {
      previous = await readFile(backup, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    requireCondition(
      previous === undefined || previous === original,
      409,
      'upgrade_backup_exists',
      'A different upgrade backup already exists. It was preserved for operator review.',
    );
    if (previous === undefined) await store.atomic(backup, original);
    const state: InstallationStateData = {
      id: randomUUID(),
      mode: 'local',
      status: 'pending',
      upgrade: true,
      key,
      origin: address.origin,
      createdAt: store.now(),
    };
    await store.write(state);
    const prepared = original.trimEnd() + '\nNODE_ENV="development"\n';
    await store.atomic(file, prepared);
  });
  return store.issueToken();
}

import { LocalDemoFixtures } from './local-demo-fixtures.js';
import type { InstallationDatabaseInput } from './installation-database.js';
import { constants } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile, mkdir, unlink, access } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parse } from 'dotenv';
import { migrate } from '../../database/src/migrate.js';
import type { Sql } from '../../database/src/database.js';
import { passwordHash, validatePassword, digest } from './crypto.js';
import { DomainError, requireCondition } from './errors.js';
import {
  InstallationState,
  type InstallationStateData,
  type SetupSession,
} from './installation-state.js';
import {
  InstallationDatabase,
  installationDatabaseInput,
  installationDatabaseUrl,
  installationRole,
} from './installation-database.js';
export class Installer {
  constructor(
    readonly store: InstallationState,
    readonly database = new InstallationDatabase(),
    readonly external: NodeJS.ProcessEnv = process.env,
    readonly migrations = path.resolve('packages/database/migrations'),
    readonly localDatabase?: InstallationDatabaseInput,
  ) {}
  async requirements() {
    return {
      'Node.js 24': /^24\./.test(process.versions.node),
      'Writable application directory': await access(this.store.root, constants.W_OK).then(
        () => true,
        () => false,
      ),
      'Writable installation storage': await access(this.store.directory, constants.W_OK).then(
        () => true,
        () => false,
      ),
      'Readable SQL migrations': await access(this.migrations, constants.R_OK).then(
        () => true,
        () => false,
      ),
    };
  }
  async prepareDatabase(token: string, csrf: string, input: unknown) {
    return this.store.locked(async () => {
      const session = await this.store.verified(token, csrf);
      const choice = z
        .object({ engine: z.enum(['postgresql', 'pglite']).optional() })
        .passthrough()
        .parse(input);
      let data: InstallationDatabaseInput;
      if (choice.engine === 'pglite') {
        z.object({ engine: z.literal('pglite') })
          .strict()
          .parse(input);
        requireCondition(
          session.state.mode === 'local' && !session.state.upgrade && this.localDatabase,
          409,
          'local_database_unavailable',
          'Use the local development launcher for PGlite, or connect a separate PostgreSQL database.',
        );
        data = { ...this.localDatabase, engine: 'pglite' };
      } else data = installationDatabaseInput.parse(input);
      const details = await this.database.inspect(data, session.state);
      session.value.database = data;
      session.value.step = 'administrator';
      await this.store.saveSession(token, session.value, session.state);
      return { engine: data.engine ?? details.engine, version: details.version };
    });
  }
  async prepareAdministrator(token: string, csrf: string, input: unknown) {
    const data = z
      .object({
        name: z.string().trim().min(1).max(120),
        email: z.email().max(200),
        password: z.string(),
        confirmation: z.string(),
        demoPassword: z.string().optional(),
        demoConfirmation: z.string().optional(),
      })
      .parse(input);
    requireCondition(
      data.password === data.confirmation,
      422,
      'password_confirmation',
      'The passwords must match.',
    );
    validatePassword(data.password);
    data.email = data.email.trim().toLowerCase();
    requireCondition(
      !data.email.endsWith('@example.invalid'),
      422,
      'personal_email_required',
      'Use your own administrator email, not a fictional demo address.',
    );
    return this.store.locked(async () => {
      const session = await this.store.verified(token, csrf);
      requireCondition(
        session.value.database,
        409,
        'database_required',
        'Check the database connection first.',
      );
      if (session.state.mode === 'local') {
        requireCondition(
          data.demoPassword && data.demoPassword === data.demoConfirmation,
          422,
          'demo_password_confirmation',
          'Enter and confirm the separate fictional-account password.',
        );
        validatePassword(data.demoPassword);
        requireCondition(
          data.demoPassword !== data.password,
          422,
          'separate_passwords',
          'Choose a separate password for fictional demo accounts.',
        );
      }
      const fingerprint = createHmac('sha256', Buffer.from(session.state.key, 'hex'))
        .update(
          JSON.stringify([
            data.name,
            data.email,
            data.password,
            session.state.mode === 'local' ? data.demoPassword : null,
          ]),
        )
        .digest('hex');
      session.value.administrator = {
        name: data.name,
        email: data.email,
        passwordHash: await passwordHash(data.password),
        ...(session.state.mode === 'local'
          ? { demoHash: await passwordHash(data.demoPassword!) }
          : {}),
        fingerprint,
      };
      session.value.step = 'review';
      await this.store.saveSession(token, session.value, session.state);
      return { name: data.name, email: data.email };
    });
  }
  values(state: InstallationStateData, session: SetupSession) {
    requireCondition(
      session.database,
      409,
      'database_required',
      'Check the database connection first.',
    );
    return {
      NODE_ENV: state.mode === 'local' ? 'development' : 'production',
      APP_ORIGIN: state.origin,
      APP_ENCRYPTION_KEY: state.key,
      DATABASE_URL:
        session.database.engine === 'pglite' ? '' : installationDatabaseUrl(session.database),
      ...(session.database.engine === 'pglite'
        ? { PGLITE_PORT: String(session.database.port) }
        : {}),
      MIGRATION_DATABASE_URL: '',
      DATABASE_TENANT_ROLE: installationRole(state),
      PRIVATE_STORAGE_PATH: path
        .join(this.store.root, '.runtime', 'installations', state.id, 'private')
        .replaceAll('\\', '/'),
      TRAINING_INSTALL_STATE: 'installed',
      TRAINING_INSTALL_MODE: state.mode,
      TRAINING_ENVIRONMENT: state.mode === 'local' ? 'test' : 'production',
      TRAINING_AUTH_MODE: 'local_password',
      MOCK_IDENTITY_ENABLED: 'false',
      AI_LIVE_ENABLED: 'false',
      AI_ANTHROPIC_ENABLED: 'false',
      AI_GEMINI_ENABLED: 'false',
      SMTP_ENABLED: 'false',
      ACCOUNT_MAIL_ENABLED: 'false',
      RETENTION_APPROVED: 'false',
    };
  }
  assertOverrides(values: Record<string, string>) {
    for (const [key, value] of Object.entries(values))
      requireCondition(
        this.external[key] === undefined || this.external[key] === value,
        409,
        'environment_conflict',
        'A server process override conflicts with ' +
          key +
          '. Align the override, restart setup and resume.',
      );
  }
  async writeEnvironment(state: InstallationStateData, session: SetupSession) {
    const values = this.values(state, session);
    this.assertOverrides(values);
    const file = path.join(this.store.root, '.env');
    let existing: string | null = null;
    try {
      existing = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (existing !== null) {
      const backup = path.join(this.store.directory, 'environment-before-install.env');
      try {
        await readFile(backup);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await this.store.atomic(backup, existing);
      }
    }
    let contents = existing ?? '';
    for (const [key, value] of Object.entries(values)) {
      requireCondition(
        !/[\r\n\x00]/.test(value),
        422,
        'invalid_configuration',
        'Configuration values cannot contain control characters.',
      );
      const line = key + '=' + JSON.stringify(value),
        pattern = new RegExp('^[ \t]*(?:export[ \t]+)?' + key + '[ \t]*=.*$', 'gm');
      contents = pattern.test(contents)
        ? contents.replace(pattern, () => line)
        : contents.trimEnd() + '\n' + line + '\n';
    }
    const parsed = parse(contents);
    requireCondition(
      Object.entries(values).every(([key, value]) => parsed[key] === value),
      409,
      'environment_format',
      'Existing configuration has an ambiguous format. Resolve it before retrying; the original file was preserved.',
    );
    await mkdir(values.PRIVATE_STORAGE_PATH, { recursive: true, mode: 0o700 });
    await this.store.atomic(file, contents);
  }
  async stage(sql: Sql, state: InstallationStateData, stage: string) {
    await sql.query(
      'UPDATE training_installations SET stage=$1,updated_at=now() WHERE installation_id=$2',
      [stage, state.id],
    );
  }
  async advance(token: string, csrf: string) {
    return this.store.locked(async () => {
      const { value: session, state } = await this.store.verified(token, csrf);
      requireCondition(
        session.database && session.administrator,
        409,
        'setup_details_required',
        'Complete database and administrator details before installation.',
      );
      requireCondition(
        Object.values(await this.requirements()).every(Boolean),
        503,
        'installation_requirements',
        'Resolve the installation requirements before continuing.',
      );
      const fingerprint = digest(
        JSON.stringify([
          session.database.engine ?? 'postgresql',
          session.database.host,
          session.database.port,
          session.database.database,
        ]),
      );
      requireCondition(
        !state.databaseFingerprint || state.databaseFingerprint === fingerprint,
        409,
        'database_changed',
        'Resume against the original database. Existing records will not be reset.',
      );
      requireCondition(
        !state.administratorFingerprint ||
          state.administratorFingerprint === session.administrator.fingerprint,
        409,
        'administrator_changed',
        'Resume with the original administrator details and password. Existing credentials will not be replaced.',
      );
      this.assertOverrides(this.values(state, session));
      await this.database.inspect(session.database, state);
      state.databaseFingerprint = fingerprint;
      state.administratorFingerprint = session.administrator.fingerprint;
      state.status = 'installing';
      await this.store.write(state);
      const db = this.database.connect(session.database, state);
      try {
        let stage = await this.database.claim(db, state);
        if (stage === 'claimed') {
          await migrate(db, this.migrations);
          await this.stage(db.pool, state, 'migrated');
          stage = 'migrated';
        } else if (stage === 'migrated') {
          if (state.mode === 'local') {
            requireCondition(
              session.administrator.demoHash,
              409,
              'demo_password_required',
              'Confirm the separate fictional-account password before resuming.',
            );
            const progress = await new LocalDemoFixtures(
              db,
              Buffer.from(state.key, 'hex'),
              this.values(state, session).PRIVATE_STORAGE_PATH,
            ).advance(state.id, session.administrator.demoHash);
            session.fixtureProgress = progress.next;
          }
          if (state.mode === 'hosted' || session.fixtureProgress === LocalDemoFixtures.steps) {
            await this.stage(db.pool, state, 'seeded');
            stage = 'seeded';
          }
        } else if (stage === 'seeded') {
          await db.transaction(async (sql) => {
            await sql.query(
              'SELECT installation_id FROM training_installations WHERE installation_id=$1 FOR UPDATE',
              [state.id],
            );
            const existing = (
              await sql.query<{ id: string; is_synthetic: boolean; environment: string }>(
                'SELECT id,is_synthetic,environment FROM users',
              )
            ).rows;
            const receipt = (
              await sql.query<{
                fixture_state: { next: number; clients: { users: string[] }[] } | null;
              }>('SELECT fixture_state FROM training_installations WHERE installation_id=$1', [
                state.id,
              ])
            ).rows[0];
            const fixtureUsers = receipt.fixture_state?.clients.flatMap((c) => c.users) ?? [];
            requireCondition(
              state.mode === 'hosted'
                ? existing.length === 0
                : receipt.fixture_state?.next === 25 &&
                    existing.length === 30 &&
                    fixtureUsers.length === 30 &&
                    existing.every(
                      (u) =>
                        u.is_synthetic && u.environment === 'test' && fixtureUsers.includes(u.id),
                    ),
              409,
              'accounts_exist',
              'Existing accounts require operator review. Their credentials were preserved.',
            );
            const admin = session.administrator!,
              id = randomUUID();
            await sql.query(
              'INSERT INTO users(id,email,name,password_hash,environment,is_synthetic,global_admin) VALUES($1,$2,$3,$4,$5,false,true)',
              [
                id,
                admin.email,
                admin.name,
                admin.passwordHash,
                state.mode === 'local' ? 'test' : 'production',
              ],
            );
            await sql.query(
              "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
              [randomUUID(), id],
            );
            await sql.query(
              "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin',$3,'platform','platform',$2,'First-install administrator setup')",
              [randomUUID(), id, state.mode === 'local' ? 'test' : 'production'],
            );
            await sql.query('INSERT INTO installation(admin_id) VALUES($1)', [id]);
            await sql.query(
              "INSERT INTO account_audit(id,user_id,action) VALUES($1,$2,'installation.completed')",
              [randomUUID(), id],
            );
            await this.stage(sql, state, 'administrator');
          });
          stage = 'administrator';
        } else if (stage === 'administrator' || stage === 'complete') {
          await this.stage(db.pool, state, 'complete');
          await this.writeEnvironment(state, session);
          state.status = 'installed';
          state.completedAt = this.store.now();
          delete state.ownerHash;
          delete state.tokenHash;
          delete state.tokenExpires;
          await this.store.write(state);
          stage = 'complete';
        } else
          throw new DomainError(
            409,
            'installation_stage_invalid',
            'Inspect the installation receipt before continuing.',
          );
        session.stage = stage;
        session.step = stage === 'complete' ? 'complete' : 'progress';
        if (stage === 'complete') await unlink(this.store.sessionPath(token)).catch(() => {});
        else await this.store.saveSession(token, session, state);
        return {
          stage,
          complete: stage === 'complete',
          ...(state.mode === 'local' ? { fixtureProgress: session.fixtureProgress ?? 0 } : {}),
        };
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError(
          503,
          'installation_stage_failed',
          'Setup could not complete this stage. Check database privileges and storage permissions, then retry. Existing records were not reset.',
        );
      } finally {
        await db.close();
      }
    });
  }
}

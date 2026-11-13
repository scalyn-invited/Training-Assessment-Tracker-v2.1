import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { parse } from 'dotenv';
import { digest, encrypt, decrypt, secret } from './crypto.js';
import { DomainError, requireCondition } from './errors.js';

const stateSchema = z.object({
  id: z.uuid(),
  mode: z.enum(['hosted', 'local']),
  upgrade: z.boolean().optional(),
  status: z.enum(['pending', 'installing', 'installed']),
  key: z.string().regex(/^[a-f0-9]{64}$/),
  origin: z.url(),
  createdAt: z.number(),
  tokenHash: z.string().optional(),
  tokenExpires: z.number().optional(),
  ownerHash: z.string().optional(),
  databaseFingerprint: z.string().optional(),
  administratorFingerprint: z.string().optional(),
  completedAt: z.number().optional(),
});
export type InstallationStateData = z.infer<typeof stateSchema>;
export type SetupSession = {
  csrf: string;
  expiresAt: number;
  owner?: string;
  step:
    'token' | 'requirements' | 'database' | 'administrator' | 'review' | 'progress' | 'complete';
  database?: {
    engine?: 'postgresql' | 'pglite';
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
  };
  administrator?: {
    name: string;
    email: string;
    passwordHash: string;
    fingerprint: string;
    demoHash?: string;
  };
  fixtureProgress?: number;
  stage?: string;
};
function same(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class InstallationState {
  readonly directory: string;
  constructor(
    readonly root = process.cwd(),
    readonly now = () => Date.now(),
  ) {
    this.directory = path.join(path.resolve(root), '.runtime', 'installation');
  }
  async read(): Promise<InstallationStateData | null> {
    let bytes: string;
    try {
      bytes = await readFile(path.join(this.directory, 'state.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    try {
      return stateSchema.parse(JSON.parse(bytes));
    } catch {
      throw new DomainError(
        503,
        'installation_state_invalid',
        'Installation state is damaged. Restore the installation backup.',
      );
    }
  }
  async atomic(file: string, contents: string) {
    const temporary = file + '.' + randomUUID() + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(contents);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  async write(state: InstallationStateData) {
    await this.atomic(
      path.join(this.directory, 'state.json'),
      JSON.stringify(stateSchema.parse(state)),
    );
  }
  async locked<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lock = path.join(this.directory, 'installation.lock');
    const owner = { pid: process.pid, nonce: randomUUID() };
    let handle;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        handle = await open(lock, 'wx', 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let previous: string;
        try {
          previous = await readFile(lock, 'utf8');
          const value = JSON.parse(previous);
          requireCondition(
            Number.isSafeInteger(value.pid) && value.pid > 0,
            409,
            'installation_locked',
            'Another installation request may be running. Ask the operator to inspect the lock.',
          );
          let alive = true;
          try {
            process.kill(value.pid, 0);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false;
          }
          if (!alive && (await readFile(lock, 'utf8')) === previous) {
            await unlink(lock);
            continue;
          }
        } catch (error) {
          if (error instanceof DomainError) throw error;
        }
        throw new DomainError(
          409,
          'installation_locked',
          'Another installation request is running. Wait, then retry.',
        );
      }
    }
    requireCondition(
      handle,
      409,
      'installation_locked',
      'Another installation request is running. Wait, then retry.',
    );
    await handle.writeFile(JSON.stringify(owner));
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(lock).catch(() => {});
    }
  }
  async initialize(
    origin: string,
    external: NodeJS.ProcessEnv = process.env,
    mode: 'hosted' | 'local' = 'hosted',
  ) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new DomainError(
        422,
        'https_origin_required',
        'Configure the exact HTTPS application origin.',
      );
    }
    requireCondition(
      (mode === 'hosted'
        ? url.protocol === 'https:'
        : ['http:', 'https:'].includes(url.protocol) &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
          external.NODE_ENV !== 'production') &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash,
      422,
      'https_origin_required',
      'Configure the exact HTTPS application origin.',
    );
    return this.locked(async () => {
      const old = await this.read();
      if (old) {
        requireCondition(
          old.status !== 'installed' && old.origin === url.origin && old.mode === mode,
          409,
          'installation_closed',
          'Setup is completed or belongs to another application origin.',
        );
        return old;
      }
      let environment = '';
      try {
        environment = await readFile(path.join(this.root, '.env'), 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      requireCondition(
        !external.APP_ENCRYPTION_KEY && !parse(environment).APP_ENCRYPTION_KEY,
        409,
        'existing_workspace',
        'Existing encryption configuration requires operator review. Setup cannot reopen.',
      );
      requireCondition(
        !environment || parse(environment).TRAINING_INSTALL_STATE === 'pending',
        409,
        'existing_workspace',
        'Existing configuration requires explicit pending-installation review.',
      );
      for (const directory of [
        path.join(this.root, '.runtime', 'private'),
        path.join(this.root, '.runtime', 'installations'),
        path.join(this.directory, 'sessions'),
      ]) {
        const entries = await readdir(directory).catch((error) => {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
          throw error;
        });
        requireCondition(
          !entries.length,
          409,
          'existing_workspace',
          'Existing private workspace files require operator review. Setup cannot reopen.',
        );
      }
      const state: InstallationStateData = {
        id: randomUUID(),
        mode,
        status: 'pending',
        key: randomBytes(32).toString('hex'),
        origin: url.origin,
        createdAt: this.now(),
      };
      await this.write(state);
      return state;
    });
  }
  async issueToken() {
    return this.locked(async () => {
      const state = await this.read();
      requireCondition(
        state && state.status !== 'installed',
        409,
        'installation_closed',
        'There is no pending installation.',
      );
      const token = secret();
      state.tokenHash = digest(token);
      state.tokenExpires = this.now() + 3600000;
      delete state.ownerHash;
      await this.write(state);
      return token;
    });
  }
  async session(token?: string) {
    const state = await this.read();
    requireCondition(
      state && state.status !== 'installed',
      404,
      'installation_closed',
      'Setup is not available.',
    );
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      try {
        const value = JSON.parse(
          decrypt(await readFile(this.sessionPath(token), 'utf8'), Buffer.from(state.key, 'hex')),
        ) as SetupSession;
        if (typeof value.csrf === 'string' && value.expiresAt > this.now())
          return { token, value, state };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof Error))
          throw error;
      }
    }
    const fresh = secret(),
      value: SetupSession = {
        csrf: secret(),
        expiresAt: this.now() + 3600000,
        step: state.mode === 'local' && !state.upgrade ? 'requirements' : 'token',
      };
    await this.saveSession(fresh, value, state);
    return { token: fresh, value, state };
  }
  sessionPath(token: string) {
    requireCondition(
      /^[a-f0-9]{64}$/.test(token),
      401,
      'setup_session_invalid',
      'Reload setup to establish a new session.',
    );
    return path.join(this.directory, 'sessions', digest(token) + '.json');
  }
  async saveSession(token: string, value: SetupSession, state: InstallationStateData) {
    await mkdir(path.join(this.directory, 'sessions'), { recursive: true, mode: 0o700 });
    await this.atomic(
      this.sessionPath(token),
      encrypt(JSON.stringify(value), Buffer.from(state.key, 'hex')),
    );
  }
  async verified(token: string, csrf?: string, owner = true) {
    const result = await this.session(token);
    requireCondition(
      result.token === token,
      401,
      'setup_session_invalid',
      'Reload setup to establish a new session.',
    );
    requireCondition(
      csrf === undefined || same(result.value.csrf, csrf),
      403,
      'csrf_invalid',
      'Reload setup and try again.',
    );
    requireCondition(
      !owner ||
        (result.state.mode === 'local' && !result.state.upgrade) ||
        (result.value.owner &&
          result.state.ownerHash &&
          same(digest(result.value.owner), result.state.ownerHash)),
      403,
      'setup_owner_required',
      'Enter the current console-issued setup token.',
    );
    return result;
  }
  async exchange(token: string, csrf: string, operatorToken: string) {
    return this.locked(async () => {
      const { value, state } = await this.verified(token, csrf, false);
      requireCondition(
        state.tokenHash &&
          state.tokenExpires &&
          state.tokenExpires > this.now() &&
          same(state.tokenHash, digest(operatorToken)),
        403,
        'setup_token_invalid',
        'The setup token is invalid or expired. Generate a new token from the server console.',
      );
      const fresh = secret();
      value.csrf = secret();
      value.owner = secret();
      value.step = 'requirements';
      state.ownerHash = digest(value.owner);
      delete state.tokenHash;
      delete state.tokenExpires;
      await this.saveSession(fresh, value, state);
      await this.write(state);
      await unlink(this.sessionPath(token)).catch(() => {});
      return { token: fresh, csrf: value.csrf };
    });
  }
}

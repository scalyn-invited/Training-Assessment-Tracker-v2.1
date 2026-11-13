import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Database } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Tenancy } from './tenancy.js';
import {
  assertLocalFixtures,
  seedDemoClient,
  demoIds,
  type DemoClient,
  type DemoMode,
} from './demo-client.js';
import { fixtureSession } from './demo-session.js';
import { demoClients } from './demo-catalogue.js';
import { seedDemoScenario, type DemoScenario } from './demo-scenario.js';
import { demoTransaction } from './demo-transaction.js';
import { digest } from './crypto.js';
import { requireCondition } from './errors.js';
export type DemoProgress = {
  next: number;
  reference: string;
  clients: DemoClient[];
  scenarios: DemoScenario[];
  files: Record<string, string>;
};
export class LocalDemoFixtures {
  static readonly version = 'v2.1-local-password-demo-v1';
  static readonly steps = 25;
  constructor(
    readonly db: Database,
    readonly key: Buffer,
    readonly privateDirectory: string,
    readonly now = () => new Date(),
  ) {}
  async advance(installation: string, passwordHash: string): Promise<DemoProgress> {
    assertLocalFixtures();
    z.uuid().parse(installation);
    return demoTransaction(this.db, async (db) => {
      const row = (
        await db.pool.query<{
          stage: string;
          fixture_version: string | null;
          fixture_state: DemoProgress | null;
        }>(
          'SELECT stage,fixture_version,fixture_state FROM training_installations WHERE installation_id=$1 FOR UPDATE',
          [installation],
        )
      ).rows[0];
      requireCondition(
        row?.stage === 'migrated',
        409,
        'fixture_installation',
        'Demo fixtures require the owned migrated installation.',
      );
      requireCondition(
        !row.fixture_version || row.fixture_version === LocalDemoFixtures.version,
        409,
        'fixture_version',
        'Resume with the matching fixture code; existing records were preserved.',
      );
      const date = this.now();
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) - 42);
      const progress: DemoProgress = row.fixture_state ?? {
        next: 0,
        reference: date.toISOString(),
        clients: [],
        scenarios: [],
        files: {},
      };
      requireCondition(
        Number.isInteger(progress.next) &&
          progress.next >= 0 &&
          progress.next <= 25 &&
          Array.isArray(progress.clients) &&
          Array.isArray(progress.scenarios) &&
          typeof progress.files === 'object',
        409,
        'fixture_progress',
        'The saved fixture progress needs operator review.',
      );
      if (progress.next === 25) return progress;
      if (progress.next === 0)
        requireCondition(
          !(await db.pool.query('SELECT id FROM users UNION ALL SELECT id FROM organisations'))
            .rowCount,
          409,
          'fixture_nonempty',
          'Initial demo seeding requires an empty owned workspace.',
        );
      const step = progress.next;
      if (step < 3)
        progress.clients.push(
          await seedDemoClient(db.pool, installation, step, passwordHash, progress.reference),
        );
      else if (step < 24) {
        const client = Math.floor((step - 3) / 7),
          scenario = (step - 3) % 7,
          saved = progress.clients[client];
        requireCondition(saved, 409, 'fixture_progress', 'The saved client fixture is missing.');
        const created = await seedDemoScenario(
          db,
          this.key,
          saved,
          client,
          scenario,
          progress.reference,
        );
        const files = await this.evidence(
          db,
          installation,
          step,
          saved,
          client,
          scenario,
          created.enrolment,
          progress.reference,
        );
        progress.scenarios.push(created);
        Object.assign(progress.files, files);
      } else await this.finalize(db, installation, progress);
      progress.next++;
      await db.pool.query(
        'UPDATE training_installations SET fixture_version=$1,fixture_state=$2,updated_at=now() WHERE installation_id=$3',
        [LocalDemoFixtures.version, JSON.stringify(progress), installation],
      );
      return progress;
    });
  }
  async evidence(
    db: Database,
    installation: string,
    step: number,
    saved: DemoClient,
    client: number,
    scenario: number,
    enrolment: string,
    reference: string,
  ) {
    const next = demoIds(installation, 100 + step),
      files: Record<string, string> = {},
      directory = path.join(this.privateDirectory, 'evidence');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const originals = [
      {
        name: 'synthetic-case-notes.txt',
        body:
          'SYNTHETIC DEMO EVIDENCE \u2014 no real customer or employee information.\n' +
          demoClients[client].example +
          '\nChecklist: impact recorded; safe steps checked; next owner named.\n',
        purpose: 'evidence',
        sensitive: false,
        actor: saved.users[scenario + 3],
      },
      {
        name: 'synthetic-reviewer-notes.txt',
        body: 'Synthetic private reviewer note. Coaching observation only: check attribution and escalation owner.\n',
        purpose: 'assessment',
        sensitive: true,
        actor: saved.users[0],
      },
    ];
    for (const original of originals) {
      const id = next(),
        storage = next(),
        bytes = Buffer.from(original.body, 'utf8'),
        hash = digest(bytes);
      try {
        await writeFile(path.join(directory, storage), bytes, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        requireCondition(
          digest(await readFile(path.join(directory, storage))) === hash,
          409,
          'fixture_file_changed',
          'An existing fictional evidence object changed. Restore or inspect the owned fixture; it was not overwritten.',
        );
      }
      await db.pool.query(
        "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,scan_status,sensitive,purpose,created_at) VALUES($1,$2,'test',$3,$4,$5,$6,'text/plain',$7,$8,'clean',$9,$10,$11)",
        [
          id,
          saved.org,
          enrolment,
          original.actor,
          storage,
          original.name,
          bytes.length,
          hash,
          original.sensitive,
          original.purpose,
          reference,
        ],
      );
      files[storage] = hash;
    }
    return files;
  }
  async finalize(
    db: Database,
    installation: string,
    progress: DemoProgress,
    mode: DemoMode = 'local_password',
  ) {
    const auth = new Auth(db, this.key),
      tenancy = new Tenancy(auth),
      tokens: string[] = [];
    async function admin(client: DemoClient) {
      const user = (
        await db.pool.query<AuthUser>('SELECT * FROM users WHERE id=$1', [client.users[0]])
      ).rows[0];
      const session = await fixtureSession(auth, user, mode);
      tokens.push(session.token);
      await tenancy.select(session.token, session.csrf, client.org);
      return session;
    }
    try {
      for (const client of progress.clients) {
        const actor = await admin(client),
          grant = (
            await db.pool.query('SELECT allocation_id FROM client_sensitive_grants WHERE id=$1', [
              client.grants[6],
            ])
          ).rows[0];
        requireCondition(
          grant,
          409,
          'fixture_progress',
          'A saved sensitive fixture grant is missing.',
        );
        await tenancy.sensitive(
          actor.token,
          actor.csrf,
          client.org,
          grant.allocation_id,
          false,
          'Synthetic sensitive access revocation demonstration',
        );
      }
      const target = progress.clients[1],
        actor = await admin(target),
        shared = progress.clients[0].users[3],
        next = demoIds(installation, 24),
        membership = next();
      await db.pool.query(
        "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
        [membership, target.org, shared],
      );
      await db.pool.query(
        "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'member',$3,'test',$4,'client',$5,$6,'Synthetic existing-account client membership')",
        [next(), shared, target.org, membership, 'client:' + target.org, target.users[0]],
      );
      await tenancy.allocate(
        actor.token,
        actor.csrf,
        target.org,
        membership,
        target.memberships[1],
        'primary',
        'Synthetic teamless multi-client member allocation',
      );
      const departing = progress.clients[2],
        owner = await admin(departing),
        version = Number(
          (
            await db.pool.query('SELECT version FROM client_memberships WHERE id=$1', [
              departing.memberships[3],
            ])
          ).rows[0].version,
        );
      await tenancy.leave(
        owner.token,
        owner.csrf,
        departing.org,
        departing.memberships[3],
        version,
        'Synthetic client departure with history retained',
      );
    } finally {
      if (tokens.length)
        await db.pool.query('DELETE FROM sessions WHERE token_hash=ANY($1::text[])', [
          tokens.map(digest),
        ]);
    }
  }
}

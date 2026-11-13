import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import { demoClients } from './demo-catalogue.js';
import { MockIdentity } from './mock-identity.js';
import { requireCondition } from './errors.js';
export type DemoClient = {
  org: string;
  users: string[];
  memberships: string[];
  teams: string[];
  cohort: string;
  grants: Record<number, string>;
};
// Match source UUIDv5 naming without overriding the process-wide UUID generator.
export function demoIds(installation: string, step: number) {
  z.uuid().parse(installation);
  let counter = 0;
  return () => {
    const bytes = createHash('sha1')
      .update(Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex'))
      .update(installation + ':demo:' + step + ':' + ++counter)
      .digest()
      .subarray(0, 16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const value = bytes.toString('hex');
    return (
      value.slice(0, 8) +
      '-' +
      value.slice(8, 12) +
      '-' +
      value.slice(12, 16) +
      '-' +
      value.slice(16, 20) +
      '-' +
      value.slice(20)
    );
  };
}
export function assertLocalFixtures() {
  requireCondition(
    process.env.NODE_ENV !== 'production' &&
      (process.env.TRAINING_ENVIRONMENT ?? 'test') === 'test' &&
      (process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password' &&
      ![
        'AI_LIVE_ENABLED',
        'AI_ANTHROPIC_ENABLED',
        'AI_GEMINI_ENABLED',
        'SMTP_ENABLED',
        'ACCOUNT_MAIL_ENABLED',
        'MOCK_IDENTITY_ENABLED',
      ].some((name) => process.env[name] === 'true'),
    403,
    'demo_disabled',
    'Fictional fixtures require a local test workspace with live services and mock identity disabled.',
  );
}
export type DemoMode = 'local_password' | 'mock';
export function assertFixtureMode(mode: DemoMode = 'local_password') {
  if (mode === 'local_password') return assertLocalFixtures();
  new MockIdentity(Buffer.alloc(32)).assertEnabled();
  requireCondition(
    mode === 'mock' &&
      process.env.TRAINING_DEMO_ENABLED === 'true' &&
      ![
        'AI_LIVE_ENABLED',
        'AI_ANTHROPIC_ENABLED',
        'AI_GEMINI_ENABLED',
        'SMTP_ENABLED',
        'ACCOUNT_MAIL_ENABLED',
        'RETENTION_APPROVED',
      ].some((name) => process.env[name] === 'true'),
    403,
    'demo_disabled',
    'Mock fixtures require explicit isolated demo configuration with external services disabled.',
  );
}
/** Internal fixture writer. The caller owns the installation receipt lock and transaction. */
export async function seedDemoClient(
  sql: Sql,
  installation: string,
  index: number,
  passwordHash: string,
  reference: string,
  mode: DemoMode = 'local_password',
): Promise<DemoClient> {
  assertFixtureMode(mode);
  z.number().int().min(0).max(2).parse(index);
  z.string()
    .regex(/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/)
    .parse(passwordHash);
  z.iso.datetime().parse(reference);
  const next = demoIds(installation, index),
    spec = demoClients[index];
  const saved: DemoClient = {
    org: next(),
    users: [],
    memberships: [],
    teams: [],
    cohort: '',
    grants: {},
  };
  await sql.query('INSERT INTO organisations(id,name,created_at) VALUES($1,$2,$3)', [
    saved.org,
    spec.name + ' (fictional)',
    reference,
  ]);
  await sql.query(
    "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test')",
    [saved.org],
  );
  for (let person = 0; person < 10; person++) {
    const id = next(),
      membership = next(),
      role = person === 0 ? 'admin' : person < 3 ? 'coordinator' : 'member';
    saved.users.push(id);
    saved.memberships.push(membership);
    await sql.query(
      "INSERT INTO users(id,email,name,password_hash,environment,is_synthetic,created_at) VALUES($1,$2,$3,$4,'test',true,$5)",
      [
        id,
        `demo.${index + 1}.${person}@example.invalid`,
        spec.people[person] + ' \u00b7 ' + spec.name + ' \u00b7 ' + role,
        passwordHash,
        reference,
      ],
    );
    await sql.query('INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2,$3,$4)', [
      next(),
      id,
      mode === 'mock'
        ? (process.env.MOCK_IDENTITY_ISSUER ?? 'https://identity.example.invalid/mock')
        : 'urn:training:local',
      mode === 'mock' ? `demo-${index + 1}-${person}` : id,
    ]);
    await sql.query(
      "INSERT INTO client_memberships(id,organisation_id,environment,user_id,joined_at) VALUES($1,$2,'test',$3,$4)",
      [membership, saved.org, id, reference],
    );
    if (person === 0 || person >= 3)
      await sql.query(
        "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason,starts_at) VALUES($1,$2,$3,$4,'test',$5,'client',$6,$7,'Synthetic local fixture role',$8)",
        [next(), id, role, saved.org, membership, 'client:' + saved.org, saved.users[0], reference],
      );
  }
  for (const name of spec.teams) {
    const id = next();
    saved.teams.push(id);
    await sql.query(
      "INSERT INTO groups(id,organisation_id,environment,name,kind,created_at) VALUES($1,$2,'test',$3,'team',$4)",
      [id, saved.org, name, reference],
    );
  }
  saved.cohort = next();
  await sql.query(
    "INSERT INTO groups(id,organisation_id,environment,name,kind,created_at) VALUES($1,$2,'test','New specialists \u2014 September 2026','cohort',$3)",
    [saved.cohort, saved.org, reference],
  );
  for (const person of [1, 2])
    for (const team of saved.teams) {
      await sql.query(
        "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,group_id,scope_type,scope_key,granted_by,reason,starts_at) VALUES($1,$2,'coordinator',$3,'test',$4,$5,'team',$6,$7,'Synthetic second-team coordinator assignment',$8)",
        [
          next(),
          saved.users[person],
          saved.org,
          saved.memberships[person],
          team,
          'team:' + team,
          saved.users[0],
          reference,
        ],
      );
    }
  for (let person = 3; person < 10; person++) {
    // Cohort membership is directory data. Access.team explicitly rejects cohort authority.
    const groups = new Set([saved.cohort]);
    if (person !== 3) groups.add(saved.teams[(person - 3) % 2]);
    if (person === 4) groups.add(saved.teams[0]);
    for (const group of groups)
      await sql.query(
        "INSERT INTO client_team_memberships(id,organisation_id,environment,client_membership_id,group_id,starts_at) VALUES($1,$2,'test',$3,$4,$5)",
        [next(), saved.org, saved.memberships[person], group, reference],
      );
    const primary = person % 2 ? 1 : 2,
      allocation = next();
    await sql.query(
      "INSERT INTO coordinator_allocations(id,organisation_id,environment,member_membership_id,coordinator_membership_id,kind,assigned_by,reason,starts_at) VALUES($1,$2,'test',$3,$4,'primary',$5,'Synthetic accountable coordinator assignment',$6)",
      [
        allocation,
        saved.org,
        saved.memberships[person],
        saved.memberships[primary],
        saved.users[0],
        reference,
      ],
    );
    if (person === 5)
      await sql.query(
        "INSERT INTO coordinator_allocations(id,organisation_id,environment,member_membership_id,coordinator_membership_id,kind,assigned_by,reason,starts_at) VALUES($1,$2,'test',$3,$4,'backup',$5,'Synthetic backup assignment without management authority',$6)",
        [
          next(),
          saved.org,
          saved.memberships[person],
          saved.memberships[3 - primary],
          saved.users[0],
          reference,
        ],
      );
    saved.grants[person] = next();
    await sql.query(
      "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason,starts_at) VALUES($1,$2,'test',$3,$4,'Synthetic explicit assessment access from a different Client Admin',$5)",
      [saved.grants[person], saved.org, allocation, saved.users[0], reference],
    );
  }
  await sql.query(
    "INSERT INTO client_brandings(organisation_id,environment,mode,client_name,app_name,accent,default_theme) VALUES($1,'test','white-label',$2,'Skills Academy',$3,$4)",
    [saved.org, spec.name, spec.colour, index === 1 ? 'client-dark' : 'client-light'],
  );
  await sql.query(
    "INSERT INTO client_theme_preferences(organisation_id,environment,user_id,theme) VALUES($1,'test',$2,'neon-cyan')",
    [saved.org, saved.users[4]],
  );
  return saved;
}

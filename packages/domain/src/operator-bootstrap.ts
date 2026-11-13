import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Access, effective, globalAdmin } from './access.js';
import { Platform } from './platform.js';
import { Accounts } from './accounts.js';
import { secret } from './crypto.js';
import { productionBootstrapProfile } from './production-profile.js';
import { invalidate } from './tenancy.js';
import { requireCondition } from './errors.js';

/** Operator entry points are CLI-only; never expose these methods as unauthenticated HTTP actions. */
export class OperatorBootstrap {
  readonly access = new Access();
  readonly platform: Platform;
  constructor(readonly auth: Auth) {
    this.platform = new Platform(auth);
  }
  environment() {
    return process.env.NODE_ENV === 'production' ? 'production' : 'test';
  }
  attribution(operator: string, reason: string) {
    z.string().trim().min(1).max(160).parse(operator);
    this.platform.reason(reason);
  }
  async appoint(userId: string, environment: string, operator: string, reason: string) {
    z.uuid().parse(userId);
    this.attribution(operator, reason);
    requireCondition(
      environment === this.environment(),
      403,
      'bootstrap_environment',
      'Explicit environment must match the configured environment.',
    );
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE', [
        environment,
      ]);
      return this.firstAdministrator(sql, userId, environment, operator, reason);
    });
  }
  async syntheticSetup(userId: string, operator: string, reason: string) {
    this.auth.assertLocalPassword();
    z.uuid().parse(userId);
    this.attribution(operator, reason);
    const environment = this.environment(),
      accounts = new Accounts(this.auth);
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE', [
        environment,
      ]);
      const user = (
        await sql.query<
          AuthUser & {
            password_hash: string;
            password_enabled: boolean;
            is_synthetic: boolean;
            origin: string;
            sync_policy: string;
          }
        >('SELECT * FROM users WHERE id=$1 FOR UPDATE', [userId])
      ).rows[0];
      requireCondition(
        user && (await this.access.active(sql, userId, environment)),
        404,
        'account_unavailable',
        'This account is unavailable.',
      );
      requireCondition(
        user.is_synthetic &&
          !user.password_enabled &&
          (await globalAdmin(sql, userId, environment)),
        403,
        'bootstrap_setup_unavailable',
        'Initial setup is restricted to a synthetic Global Admin without an enabled password.',
      );
      requireCondition(
        user.origin === 'manual' && user.sync_policy === 'local_only',
        422,
        'identity_review',
        'External accounts require separate identity review.',
      );
      await sql.query(
        "INSERT INTO identities(id,user_id,issuer,subject,active) VALUES($1,$2::uuid,'urn:training:local',$2::text,true) ON CONFLICT(issuer,subject) DO NOTHING",
        [randomUUID(), userId],
      );
      requireCondition(
        await accounts.identity(sql, userId),
        403,
        'identity_review',
        'The local identity is unavailable.',
      );
      return accounts.issue(
        sql,
        user,
        user,
        'setup',
        null,
        reason + ' Operator: ' + operator,
        true,
      );
    });
  }
  async initializeProduction(
    profile: 'hosted' | 'local',
    name: string,
    email: string,
    operator: string,
    reason: string,
  ) {
    productionBootstrapProfile(profile);
    this.auth.assertLocalPassword();
    this.attribution(operator, reason);
    name = z.string().trim().min(1).max(120).parse(name);
    email = z.email().max(200).parse(email.trim().toLowerCase());
    const accounts = new Accounts(this.auth);
    return this.auth.db.transaction(async (sql) => {
      await sql.query(
        "SELECT environment FROM platform_settings WHERE environment='production' FOR UPDATE",
      );
      const marker = (
        await sql.query<{ target_id: string }>(
          "SELECT target_id FROM platform_audit_events WHERE environment='production' AND action='local.production.initialized' ORDER BY created_at LIMIT 1",
        )
      ).rows[0];
      let id: string;
      if (marker) {
        id = marker.target_id;
        const user = (
          await sql.query<{ name: string; email: string; password_enabled: boolean }>(
            'SELECT name,email,password_enabled FROM users WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        const count = (
          await sql.query<{ n: number }>(
            "SELECT count(*)::int n FROM role_assignments WHERE environment='production' AND scope_type='platform' AND role='admin' AND " +
              effective,
          )
        ).rows[0].n;
        requireCondition(
          user &&
            user.name === name &&
            user.email === email &&
            !user.password_enabled &&
            count === 1 &&
            (await globalAdmin(sql, id, 'production')) &&
            (await this.access.active(sql, id, 'production')),
          409,
          'production_setup_closed',
          'Initial setup is no longer available.',
        );
      } else {
        const occupied = await sql.query(
          'SELECT id FROM users UNION ALL SELECT id FROM role_assignments UNION ALL SELECT id FROM organisations LIMIT 1',
        );
        requireCondition(
          !occupied.rowCount,
          409,
          'production_database_not_empty',
          'Initial setup requires an empty database.',
        );
        id = randomUUID();
        await sql.query(
          "INSERT INTO users(id,email,name,password_hash,password_enabled,environment,is_synthetic,origin,sync_policy) VALUES($1,$2,$3,$4,false,'production',false,'manual','local_only')",
          [id, email, name, secret()],
        );
        await sql.query(
          "INSERT INTO identities(id,user_id,issuer,subject,active) VALUES($1,$2::uuid,'urn:training:local',$2::text,true)",
          [randomUUID(), id],
        );
        await this.firstAdministrator(sql, id, 'production', operator, reason);
        await sql.query(
          "INSERT INTO platform_audit_events(id,environment,operator_reference,action,target_id,reason) VALUES($1,'production',$2,'local.production.initialized',$3,$4)",
          [randomUUID(), operator, id, reason],
        );
      }
      const user = (
        await sql.query<
          AuthUser & {
            password_hash: string;
            password_enabled: boolean;
            origin: string;
            sync_policy: string;
          }
        >('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      requireCondition(
        user.origin === 'manual' &&
          user.sync_policy === 'local_only' &&
          (await accounts.identity(sql, id)),
        403,
        'identity_review',
        'The local identity is unavailable.',
      );
      return accounts.issue(
        sql,
        user,
        user,
        'setup',
        null,
        reason + ' Operator: ' + operator,
        true,
      );
    });
  }
  private async firstAdministrator(
    sql: Sql,
    userId: string,
    environment: string,
    operator: string,
    reason: string,
  ) {
    this.attribution(operator, reason);
    await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
    requireCondition(
      await this.access.active(sql, userId, environment),
      404,
      'account_unavailable',
      'This account is unavailable.',
    );
    const grants = (
      await sql.query<{ id: string; user_id: string }>(
        "SELECT id,user_id FROM role_assignments WHERE environment=$1 AND scope_type='platform' AND role='admin' AND " +
          effective,
        [environment],
      )
    ).rows;
    const existing = grants.find((row) => row.user_id === userId);
    if (existing) return { id: existing.id, created: false };
    requireCondition(
      !grants.length,
      409,
      'bootstrap_admin_exists',
      'A Global Admin already exists. Use platform administration.',
    );
    const id = randomUUID();
    await sql.query(
      "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin',$3,'platform','platform',$2,$4)",
      [id, userId, environment, reason],
    );
    await invalidate(sql, [userId]);
    await sql.query(
      'INSERT INTO installation(singleton,admin_id) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING',
      [userId],
    );
    await sql.query(
      'INSERT INTO platform_audit_events(id,environment,actor_id,operator_reference,action,target_id,reason,changes) VALUES($1,$2,NULL,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        environment,
        operator,
        'platform.admin.appointed',
        userId,
        reason,
        { grant_id: id },
      ],
    );
    return { id, created: true };
  }
}

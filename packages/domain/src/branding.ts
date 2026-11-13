import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Auth } from './auth.js';
import { Platform } from './platform.js';
import { Access, globalAdmin } from './access.js';
import { DomainError, requireCondition } from './errors.js';
import { privatePath } from '../../database/src/config.js';
import { generate, themes } from './theme.js';
import type { Sql } from '../../database/src/database.js';
export type BrandInput = {
  version: number;
  displayName: string;
  appName: string;
  accent: string;
  theme: string;
  mode: 'cerebru' | 'co-branded' | 'white-label';
  reason: string;
  logo?: string;
  removeLogo?: boolean;
};
export class Branding {
  readonly access = new Access();
  readonly platform: Platform;
  constructor(readonly auth: Auth) {
    this.platform = new Platform(auth);
  }
  async current(token: string, shared = false) {
    try {
      const client = await this.auth.db.transaction(async (sql) => {
        const { session } = await this.auth.verified(sql, token);
        return shared ? null : session.organisation_id;
      });
      return await this.read(token, client);
    } catch (error) {
      if (!(error instanceof DomainError) || error.status !== 401) throw error;
      const environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
      const row = (
        await this.auth.db.pool.query(
          'SELECT display_name,app_name,accent,default_theme,logo_path,version FROM platform_settings WHERE environment=$1',
          [environment],
        )
      ).rows[0];
      const accent = row?.accent ?? '#1d4668';
      return {
        displayName: row?.display_name ?? 'Scalyn',
        appName: row?.app_name ?? 'Assessment Training Tracker',
        mode: 'white-label',
        selectedTheme: row?.default_theme ?? 'light',
        palettes: generate(accent),
        platformPalettes: generate(accent),
        logo: row?.logo_path
          ? '/api/branding/logo?v=' + row.version
          : '/images/scalyn-opc-logo.png',
      };
    }
  }
  async context(sql: Sql, token: string, client: string | null, csrf?: string) {
    const { user, session } = await this.auth.verified(sql, token, csrf);
    if (client)
      requireCondition(
        session.organisation_id === client &&
          (await this.access.available(sql, client, user!.environment)) &&
          ((await globalAdmin(sql, user!.id, user!.environment)) ||
            (await this.access.membership(sql, user!.id, client, user!.environment))),
        403,
        'client_unavailable',
        'Select an available client first.',
      );
    return user!;
  }
  async read(token: string, client: string | null) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.context(sql, token, client);
      const platform = (
        await sql.query('SELECT * FROM platform_settings WHERE environment=$1', [actor.environment])
      ).rows[0];
      const saved = client
        ? (
            await sql.query(
              'SELECT * FROM client_brandings WHERE organisation_id=$1 AND environment=$2',
              [client, actor.environment],
            )
          ).rows[0]
        : platform;
      const preference = client
        ? (
            await sql.query(
              'SELECT theme,version FROM client_theme_preferences WHERE organisation_id=$1 AND environment=$2 AND user_id=$3',
              [client, actor.environment, actor.id],
            )
          ).rows[0]
        : null;
      const available = {
        ...themes,
        ...(client && saved
          ? { 'client-light': 'Client Light', 'client-dark': 'Client Dark' }
          : {}),
      };
      const defaultTheme = saved?.default_theme ?? platform.default_theme ?? 'light';
      const accent = saved?.accent ?? platform.accent ?? '#1d4668';
      return {
        version: saved?.version ?? 0,
        displayName: saved?.client_name ?? saved?.display_name ?? platform.display_name ?? 'Scalyn',
        appName: saved?.app_name ?? platform.app_name ?? 'Assessment Training Tracker',
        mode: saved?.mode ?? 'white-label',
        accent,
        theme: defaultTheme,
        savedTheme: client ? (saved?.default_theme ?? '') : defaultTheme,
        customLogo: Boolean(saved?.logo_path),
        selectedTheme: preference?.theme ?? defaultTheme,
        preference: preference?.theme ?? null,
        preferenceVersion: preference?.version ?? 0,
        themes: available,
        palettes: generate(accent),
        platformPalettes: generate(platform.accent ?? '#1d4668'),
        logo: saved?.logo_path
          ? '/api/branding/logo' +
            (client ? '?clientId=' + client : '?shared=1') +
            '&v=' +
            (saved.version ?? 0)
          : platform.logo_path
            ? '/api/branding/logo?v=' + platform.version
            : '/images/scalyn-opc-logo.png',
        canEdit: client
          ? await this.access.administer(sql, actor, client)
          : await globalAdmin(sql, actor.id, actor.environment),
      };
    });
  }
  async authorize(sql: Sql, token: string, client: string | null, csrf: string) {
    const actor = await this.context(sql, token, client, csrf);
    requireCondition(
      client
        ? await this.access.administer(sql, actor, client)
        : await globalAdmin(sql, actor.id, actor.environment),
      403,
      'branding_forbidden',
      'Branding administration permission is required.',
    );
    return actor;
  }
  async save(token: string, csrf: string, client: string | null, input: BrandInput) {
    requireCondition(
      Number.isInteger(input.version) &&
        input.version >= 0 &&
        [input.displayName, input.appName].every((v) => v.trim().length > 0 && v.length <= 120) &&
        /^#[0-9a-f]{6}$/i.test(input.accent) &&
        ['cerebru', 'co-branded', 'white-label'].includes(input.mode),
      422,
      'invalid_branding',
      'Check the names, colour and branding mode.',
    );
    const allowed = client
      ? ['light', 'dark', 'neon-cyan', 'neon-emerald', 'neon-amber', 'client-light', 'client-dark']
      : Object.keys(themes);
    requireCondition(
      (allowed.includes(input.theme) || (client && input.theme === '')) &&
        !(input.logo && input.removeLogo),
      422,
      'invalid_branding',
      'Choose an available theme and either replace or remove the logo.',
    );
    if (!client) this.platform.reason(input.reason);
    await this.auth.db.transaction((sql) => this.authorize(sql, token, client, csrf));
    let newPath: string | null = null,
      obsolete: string | null = null;
    try {
      if (input.logo) {
        requireCondition(
          input.logo.length <= 2796204 && /^[A-Za-z0-9+/]*={0,2}$/.test(input.logo),
          422,
          'invalid_logo',
          'Upload a PNG, JPEG or WebP no larger than 2 MB.',
        );
        const raw = Buffer.from(input.logo, 'base64');
        requireCondition(
          raw.length <= 2097152 && raw.length > 0,
          422,
          'invalid_logo',
          'Logo must be no larger than 2 MB.',
        );
        let bytes: Buffer;
        try {
          const processor = sharp(raw, {
            limitInputPixels: 4096 * 4096,
            animated: false,
            failOn: 'warning',
          });
          const meta = await processor.metadata();
          requireCondition(
            ['png', 'jpeg', 'webp'].includes(meta.format ?? '') &&
              !!meta.width &&
              !!meta.height &&
              meta.width <= 4096 &&
              meta.height <= 4096 &&
              (meta.pages ?? 1) === 1,
            422,
            'invalid_logo',
            'Use a single raster image no larger than 4096 × 4096 pixels.',
          );
          bytes = await processor.png().toBuffer();
        } catch {
          requireCondition(
            false,
            422,
            'invalid_logo',
            'Upload a valid PNG, JPEG or WebP within the size limits.',
          );
          throw new Error();
        }
        newPath = 'branding/' + randomUUID() + '.png';
        await mkdir(path.join(privatePath(), 'branding'), { recursive: true });
        await writeFile(path.join(privatePath(), newPath), bytes, { flag: 'wx' });
      }
      const result = await this.auth.db.transaction(async (sql) => {
        if (client)
          await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
        else
          await sql.query(
            'SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE',
            [process.env.NODE_ENV === 'production' ? 'production' : 'test'],
          );
        const actor = await this.authorize(sql, token, client, csrf);
        const old = (
          await sql.query(
            client
              ? 'SELECT * FROM client_brandings WHERE organisation_id=$1 AND environment=$2'
              : 'SELECT * FROM platform_settings WHERE environment=$1',
            client ? [client, actor.environment] : [actor.environment],
          )
        ).rows[0];
        requireCondition(
          (old?.version ?? 0) === input.version,
          409,
          'branding_changed',
          'Branding changed while you were editing. Reload before saving.',
        );
        const logo = input.removeLogo ? null : (newPath ?? old?.logo_path ?? null);
        if (client)
          await sql.query(
            'INSERT INTO client_brandings(organisation_id,environment,version,mode,client_name,app_name,accent,default_theme,logo_path) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organisation_id,environment) DO UPDATE SET version=EXCLUDED.version,mode=EXCLUDED.mode,client_name=EXCLUDED.client_name,app_name=EXCLUDED.app_name,accent=EXCLUDED.accent,default_theme=EXCLUDED.default_theme,logo_path=EXCLUDED.logo_path,updated_at=now()',
            [
              client,
              actor.environment,
              input.version + 1,
              input.mode,
              input.displayName.trim(),
              input.appName.trim(),
              input.accent.toLowerCase(),
              input.theme || null,
              logo,
            ],
          );
        else
          await sql.query(
            'UPDATE platform_settings SET version=version+1,display_name=$1,app_name=$2,accent=$3,default_theme=$4,logo_path=$5 WHERE environment=$6',
            [
              input.displayName.trim(),
              input.appName.trim(),
              input.accent.toLowerCase(),
              input.theme || null,
              logo,
              actor.environment,
            ],
          );
        const changes = {
          display_name: {
            before: old?.client_name ?? old?.display_name ?? null,
            after: input.displayName.trim(),
          },
          app_name: { before: old?.app_name ?? null, after: input.appName.trim() },
          accent: { before: old?.accent ?? null, after: input.accent },
          default_theme: { before: old?.default_theme ?? null, after: input.theme },
          logo_changed: old?.logo_path !== logo,
        };
        if (client)
          await sql.query(
            "INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2::uuid,$3,$4,'client.branding.saved',$2::text,$5)",
            [
              randomUUID(),
              client,
              actor.environment,
              actor.id,
              { changes, version: input.version + 1 },
            ],
          );
        else
          await this.platform.audit(
            sql,
            actor,
            'platform.appearance.saved',
            actor.environment,
            input.reason,
            changes,
          );
        if (old?.logo_path && old.logo_path !== logo) obsolete = old.logo_path;
        return { version: input.version + 1 };
      });
      if (obsolete) await unlink(path.join(privatePath(), obsolete)).catch(() => {});
      return result;
    } catch (error) {
      if (newPath) await unlink(path.join(privatePath(), newPath)).catch(() => {});
      throw error;
    }
  }
  async preference(
    token: string,
    csrf: string,
    client: string,
    version: number,
    theme: string | null,
  ) {
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.context(sql, token, client, csrf);
      const saved = (
        await sql.query(
          'SELECT accent FROM client_brandings WHERE organisation_id=$1 AND environment=$2',
          [client, actor.environment],
        )
      ).rows[0];
      requireCondition(
        theme === null ||
          Object.keys(themes).includes(theme) ||
          (saved && ['client-light', 'client-dark'].includes(theme)),
        422,
        'theme_unavailable',
        'Choose an available theme.',
      );
      const old = (
        await sql.query(
          'SELECT version,theme FROM client_theme_preferences WHERE organisation_id=$1 AND environment=$2 AND user_id=$3',
          [client, actor.environment, actor.id],
        )
      ).rows[0];
      requireCondition(
        Number.isInteger(version) && version === (old?.version ?? 0),
        409,
        'preference_changed',
        'Your theme changed elsewhere. Reload before choosing again.',
      );
      await sql.query(
        'INSERT INTO client_theme_preferences(organisation_id,environment,user_id,theme,version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(organisation_id,environment,user_id) DO UPDATE SET theme=EXCLUDED.theme,version=EXCLUDED.version',
        [client, actor.environment, actor.id, theme, version + 1],
      );
      await sql.query(
        "INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4::uuid,'client.theme.preference.saved',$4::text,$5)",
        [
          randomUUID(),
          client,
          actor.environment,
          actor.id,
          { before: old?.theme ?? null, after: theme, version: version + 1 },
        ],
      );
      return { version: version + 1 };
    });
  }
  async logo(token: string, client: string | null) {
    const file = await this.auth.db.transaction(async (sql) => {
      const environment = client
        ? (await this.context(sql, token, client)).environment
        : process.env.NODE_ENV === 'production'
          ? 'production'
          : 'test';
      return (
        await sql.query(
          client
            ? 'SELECT logo_path FROM client_brandings WHERE organisation_id=$1 AND environment=$2'
            : 'SELECT logo_path FROM platform_settings WHERE environment=$1',
          client ? [client, environment] : [environment],
        )
      ).rows[0]?.logo_path;
    });
    requireCondition(
      typeof file === 'string' && /^branding\/[0-9a-f-]+\.png$/.test(file),
      404,
      'logo_unavailable',
      'Logo is unavailable.',
    );
    try {
      return await readFile(path.join(privatePath(), file));
    } catch {
      requireCondition(false, 404, 'logo_unavailable', 'Logo is unavailable.');
      throw new Error();
    }
  }
}

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Branding, type BrandInput } from '../packages/domain/src/branding.js';
import { generate, contrast } from '../packages/domain/src/theme.js';
describe('versioned branding and isolated personal preferences', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>,
    auth: Auth,
    tenancy: Tenancy,
    brand: Branding,
    admin: { token: string; csrf: string },
    member: { token: string; csrf: string },
    client: string,
    other: string;
  const input: BrandInput = {
    version: 0,
    displayName: 'Test client',
    appName: 'Learning',
    accent: '#ffcc00',
    theme: 'client-light',
    mode: 'white-label',
    reason: 'Synthetic appearance verification',
  };
  beforeAll(async () => {
    instance = await testDatabase();
    auth = new Auth(instance.db, randomBytes(32));
    tenancy = new Tenancy(auth);
    brand = new Branding(auth);
    const guest = await auth.context();
    await auth.setup(guest.token!, guest.csrf, {
      name: 'Admin',
      email: 'admin@example.invalid',
      password: 'Unique administrator passphrase',
      demoPassword: 'Separate demonstration password',
    });
    admin = await auth.login(
      guest.token!,
      guest.csrf,
      'admin@example.invalid',
      'Unique administrator passphrase',
    );
    const g = await auth.context();
    member = await auth.login(
      g.token!,
      g.csrf,
      'demo.1.3@example.invalid',
      'Separate demonstration password',
    );
    const clients = await tenancy.choices(admin.token);
    client = clients[0].id;
    other = clients[1].id;
    await tenancy.select(admin.token, admin.csrf, client);
    await tenancy.select(member.token, member.csrf, client);
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('reads shared branding for guests and selected client branding for members',async()=>{expect((await brand.current('')).displayName).toBe('Scalyn');expect((await brand.current(admin.token)).displayName).toBe('Scalyn');expect((await brand.current(member.token,true)).displayName).toBe('Scalyn');});
  it('generates readable light and dark palettes for edge colours', () => {
    for (const color of [
      '#000000',
      '#ffffff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ffff00',
      '#00ffff',
      '#ff00ff',
      '#1d4668',
    ])
      for (const p of Object.values(generate(color))) {
        for (const surface of ['background', 'card', 'hover']) {
          expect(contrast(p.primary, p[surface])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.text, p[surface])).toBeGreaterThanOrEqual(7);
          expect(contrast(p.muted, p[surface])).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.line, p[surface])).toBeGreaterThanOrEqual(3);
        }
        expect(contrast(p.primary, p['on-primary'])).toBeGreaterThanOrEqual(4.5);
      }
  });
  it('rejects unselected clients and unauthorized branding edits', async () => {
    await expect(brand.read(admin.token, other)).rejects.toMatchObject({ status: 403 });
    await expect(brand.save(member.token, member.csrf, client, input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      brand.save(admin.token, admin.csrf, client, { ...input, accent: 'red' }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('pins saved appearance versions and does not overwrite personal preferences', async () => {
    expect(await brand.save(admin.token, admin.csrf, client, input)).toEqual({ version: 1 });
    await expect(brand.save(admin.token, admin.csrf, client, input)).rejects.toMatchObject({
      status: 409,
    });
    expect((await brand.read(member.token, client)).selectedTheme).toBe('client-light');
    await brand.preference(member.token, member.csrf, client, 0, 'dark');
    await brand.save(admin.token, admin.csrf, client, {
      ...input,
      version: 1,
      theme: 'client-dark',
    });
    expect((await brand.read(member.token, client)).selectedTheme).toBe('dark');
    expect((await brand.read(admin.token, client)).selectedTheme).toBe('client-dark');
    await expect(
      brand.preference(member.token, member.csrf, client, 0, 'light'),
    ).rejects.toMatchObject({ status: 409 });
    await brand.preference(member.token, member.csrf, client, 1, null);
    expect((await brand.read(member.token, client)).selectedTheme).toBe('client-dark');
  });
  it('decodes and reencodes private logos and rejects SVG and corrupt images', async () => {
    const png = (
      await sharp({ create: { width: 2, height: 2, channels: 4, background: '#0099ff' } })
        .png()
        .toBuffer()
    ).toString('base64');
    await brand.save(admin.token, admin.csrf, client, { ...input, version: 2, logo: png });
    const data = await brand.logo(member.token, client);
    expect((await sharp(data).metadata()).format).toBe('png');
    await expect(brand.logo(member.token, other)).rejects.toMatchObject({ status: 403 });
    await expect(
      brand.save(admin.token, admin.csrf, client, {
        ...input,
        version: 3,
        logo: Buffer.from('<svg/>').toString('base64'),
      }),
    ).rejects.toMatchObject({ status: 422 });
    await brand.save(admin.token, admin.csrf, client, { ...input, version: 3, removeLogo: true });
    await expect(brand.logo(member.token, client)).rejects.toMatchObject({ status: 404 });
  });
  it('keeps platform appearance separate and audited', async () => {
    await brand.save(admin.token, admin.csrf, null, {
      ...input,
      theme: 'platform-dark',
      displayName: 'Shared platform',
    });
    expect((await brand.read(admin.token, null)).displayName).toBe('Shared platform');
    expect((await brand.read(member.token, client)).displayName).toBe('Test client');
    const audit = (
      await instance.db.pool.query(
        "SELECT changes FROM platform_audit_events WHERE action='platform.appearance.saved'",
      )
    ).rows[0];
    expect(audit.changes.display_name.after).toBe('Shared platform');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  appearanceScript,
  type InitialAppearance,
} from './components/appearance-state';
import { loadInitialAppearance } from './initial-appearance';

afterEach(() => vi.unstubAllGlobals());
describe('bounded 503 policy scope', () => {
  for (const [name, pathname, account, unavailable, stored, expected] of [
    ['guest known intent', '/login', 'guest', true, { guest: 'platform-dark' }, 'dark'],
    [
      'shared known intent',
      '/account/security',
      'test.user',
      true,
      { 'test.user': 'platform-dark' },
      'dark',
    ],
    [
      'other identity ignored',
      '/account/security',
      'test.other',
      true,
      { 'test.user': 'platform-dark', guest: 'platform-dark' },
      'light',
    ],
    [
      'unknown identity ignored',
      '/account/security',
      null,
      true,
      { guest: 'platform-dark' },
      'light',
    ],
    [
      'client local preference ignored',
      '/dashboard',
      'test.user',
      true,
      { 'test.user': 'platform-dark' },
      'light',
    ],
    ['non-503 ignored', '/login', 'guest', false, { guest: 'platform-dark' }, 'light'],
    ['missing ignored', '/login', 'guest', true, {}, 'light'],
    ['malformed ignored', '/login', 'guest', true, { guest: 'system' }, 'light'],
    ['built-in preserved', '/login', 'guest', true, { guest: 'neon-amber' }, 'neon-amber'],
  ] as const)
    it(name, () => {
      const dataset = { theme: 'light' };
      const values: Record<string, string> = stored;
      runInNewContext(
        appearanceScript({
          pathname,
          account,
          brand: null,
          brandingUnavailable: unavailable,
        } as InitialAppearance),
        {
          document: { documentElement: { dataset } },
          localStorage: {
            getItem: (key: string) =>
              values[key.replace('training.v21.appearance.platform.', '')] ?? null,
          },
        },
      );
      expect(dataset.theme).toBe(expected);
      expect('appearanceFallback' in dataset).toBe(expected === 'dark');
    });
  for (const status of [401, 403, 500, 503])
    it(`only branding 503 enables exception: ${status}`, async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })));
      expect(
        (await loadInitialAppearance('/login', '', 'http://fixture')).brandingUnavailable,
      ).toBe(status === 503);
    });
  it('authentication 503 never establishes a fallback scope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    const result = await loadInitialAppearance(
      '/account/security',
      'tracker_session=fixture',
      'http://fixture',
    );
    expect(result.account).toBeNull();
    expect(result.brandingUnavailable).toBe(false);
  });
});

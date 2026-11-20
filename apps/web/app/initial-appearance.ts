import {
  guestAppearance,
  sharedAppearance,
  type Brand,
  type InitialAppearance,
} from './components/appearance-state';

// Request-local only: do not cache a user's/client's appearance across documents.
// Reuse the API's authority and palette resolution; never read the database here.
export async function loadInitialAppearance(
  pathname: string,
  cookie: string,
  origin: string,
): Promise<InitialAppearance> {
  let account: string | null =
    guestAppearance(pathname) || !/(?:^|;\s*)tracker_session=/.test(cookie) ? 'guest' : null;
  const signal = AbortSignal.timeout(2500);
  let brandingUnavailable = false;
  const get = async (route: string) => {
    const response = await fetch(origin + route, {
      headers: { cookie },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      brandingUnavailable = route.startsWith('/branding/current?') && response.status === 503;
      throw new Error('Appearance unavailable');
    }
    return response.json();
  };
  try {
    if (account === null) {
      const context = await get('/auth/context');
      account = context.user ? context.user.environment + '.' + context.user.id : 'guest';
    }
    const brand = (await get(
      '/branding/current?shared=' + (sharedAppearance(pathname) ? '1' : '0'),
    )) as Brand;
    return { pathname, account, brand };
  } catch {
    // Bounded recovery, not an indefinite blank document. No guessed identity/cache.
    // The existing appearance retry fetch owns recovery after hydration.
    return { pathname, account, brand: null, brandingUnavailable };
  }
}

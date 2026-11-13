export function pageResponseHeaders(pathname: string, passwordMode: boolean, requestId: string) {
  const credential = /^\/(?:login|account|accounts|setup)(?:\/|$)/.test(pathname) ||
    (passwordMode && /^\/(?:platform|administration)(?:\/|$)/.test(pathname));
  return {
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': credential ? 'no-referrer' : 'same-origin',
    'X-Request-ID': requestId,
  };
}

import { readFile } from 'node:fs/promises';
import type { Route } from '@playwright/test';

// Keep this synthetic transport closed to network traffic. The shared shell's
// decorative icons are served from the checked-in assets, not a live server.
const icons = new Set(['workspace', 'switch', 'logout', 'moon', 'dot']);
export async function serveShellAsset(route: Route, origin: string): Promise<boolean> {
  const url = new URL(route.request().url());
  const name = /^\/images\/overview\/([a-z-]+)\.svg$/.exec(url.pathname)?.[1];
  if (url.origin !== origin || route.request().method() !== 'GET' || !name || !icons.has(name))
    return false;
  await route.fulfill({
    contentType: 'image/svg+xml',
    body: await readFile(`apps/web/public/images/overview/${name}.svg`),
  });
  return true;
}

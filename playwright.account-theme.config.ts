import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import base from './playwright.qa-expanded.config';
if (process.env.QA_BUILT) {
  const manifest = JSON.parse(readFileSync('apps/web/.next-expanded/routes-manifest.json', 'utf8'));
  const api = manifest.rewrites.afterFiles.find(
    (row: { source: string }) => row.source === '/api/:path*',
  );
  if (api?.destination !== 'http://127.0.0.1:3111/:path*') {
    throw new Error(
      'Build with API_INTERNAL_ORIGIN=http://127.0.0.1:3111 before isolated account QA.',
    );
  }
}
// Separate fixture database lifetime from the account behavior suite's setup.
export default defineConfig({ ...base, testDir: 'tests/account-theme-browser' });

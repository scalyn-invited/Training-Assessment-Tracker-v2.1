import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
process.env.TRACKER_UPGRADE_BROWSER_ROOT ??= path.resolve(
  '.runtime/upgrade-browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
export default defineConfig({
  testDir: 'tests/local-upgrade-browser',
  workers: 1,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:3140',
    headless: true,
    actionTimeout: 15000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  webServer: {
    command: 'tsx scripts/local-upgrade-browser-start.ts',
    url: 'http://127.0.0.1:3140/api/health/ready',
    timeout: 180000,
  },
});

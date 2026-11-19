import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.NEXT_DIST_DIR = '.next-setup-ui';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
process.env.TRACKER_LOCAL_INSTALLER_ROOT ??= path.resolve(
  '.runtime/local-installer-browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
export default defineConfig({
  testDir: 'tests/local-installer-browser',
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:3130',
    headless: true,
    channel: process.env.CI ? undefined : 'chrome',
    actionTimeout: 15000,
    screenshot: 'off',
    trace: 'off',
  },
  reporter: [['list']],
  webServer: {
    command: 'tsx scripts/local-installer-browser-start.ts',
    url: 'http://127.0.0.1:3130/api/health/ready',
    timeout: 180000,
  },
});

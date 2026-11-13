import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
process.env.TRACKER_INSTALLER_BROWSER_ROOT ??= path.resolve(
  '.runtime/installer-browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
export default defineConfig({
  testDir: 'tests/installer-browser',
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 15000 },
  use: {
    baseURL: 'https://localhost:3120',
    ignoreHTTPSErrors: true,
    headless: true,
    actionTimeout: 15000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'tsx scripts/installer-browser-start.ts',
    url: 'https://localhost:3120/api/health/ready',
    ignoreHTTPSErrors: true,
    timeout: 180000,
  },
});

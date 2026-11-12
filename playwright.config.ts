import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
export default defineConfig({
  expect: { timeout: 15000 },
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3110', headless: true, actionTimeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: {
    command: 'tsx scripts/browser-start.ts',
    url: 'http://127.0.0.1:3110/api/health/ready',
    reuseExistingServer: process.env.TRACKER_REUSE_TEST_SERVER === '1',
    timeout: 180000,
  },
});

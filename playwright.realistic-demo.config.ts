import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
process.env.TRACKER_REALISTIC_DEMO_ROOT ??= path.resolve(
  '.runtime/realistic-demo-browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
export default defineConfig({
  testDir: 'tests/realistic-demo-browser',
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:3150',
    headless: true,
    actionTimeout: 20000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  webServer: {
    command: 'tsx scripts/realistic-demo-browser-start.ts',
    url: 'http://127.0.0.1:3150/api/health/ready',
    timeout: 900000,
  },
});

import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
process.env.TRACKER_OPERATOR_BROWSER_ROOT ??= path.resolve(
  '.runtime/operator-browser',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
export default defineConfig({
  testDir: 'tests/operator-browser',
  workers: 1,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:3160',
    headless: true,
    actionTimeout: 15000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['json', { outputFile: '.runtime/operator-browser-results.json' }]],
  webServer: {
    command: 'tsx scripts/operator-browser-start.ts',
    url: 'http://127.0.0.1:3160/api/health/ready',
    timeout: 240000,
  },
});

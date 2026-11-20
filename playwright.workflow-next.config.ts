import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
export default defineConfig({
  testDir: 'tests/workflow-next-browser',
  workers: 1,
  timeout: 90000,
  use: { headless: true, baseURL: 'http://127.0.0.1:3275' },
  reporter: 'list',
  outputDir: '.runtime/workflow-next-results',
  webServer: {
    command: 'node tests/workflow-qa-browser/next-server.cjs',
    url: 'http://127.0.0.1:3275/assessments',
    reuseExistingServer: false,
    timeout: 180000,
  },
});

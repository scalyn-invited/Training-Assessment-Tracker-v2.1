import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/first-paint-browser',
  workers: 1,
  timeout: 60000,
  use: {
    channel: 'chrome',
    headless: true,
    baseURL: 'http://127.0.0.1:3280',
    trace: 'retain-on-failure',
  },
  outputDir: 'output/first-paint',
  reporter: 'list',
  webServer: {
    command: 'node tests/first-paint-browser/server.cjs',
    url: 'http://127.0.0.1:3280/login',
    reuseExistingServer: false,
    timeout: 180000,
  },
});

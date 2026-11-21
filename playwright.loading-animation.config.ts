import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/loading-animation-browser',
  workers: 1,
  use: { channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  reporter: 'list',
  outputDir: 'output/loading-animation',
});

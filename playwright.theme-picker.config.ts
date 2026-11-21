import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/theme-picker-browser',
  workers: 1,
  use: { channel: 'chrome', headless: true, trace: 'retain-on-failure' },
  reporter: 'list',
  outputDir: 'output/theme-picker',
});

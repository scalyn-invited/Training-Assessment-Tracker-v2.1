import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/prompt-rendering-browser',
  use: { channel: process.env.CI ? undefined : 'chrome', screenshot: 'only-on-failure' },
});

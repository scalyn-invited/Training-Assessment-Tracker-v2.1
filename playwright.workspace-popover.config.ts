import { defineConfig } from '@playwright/test';
import base from './playwright.guest-ui.config';
export default defineConfig({
  ...base,
  testDir: 'tests/workspace-real-browser',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3490' },
  reporter: 'list',
  outputDir: 'output/workspace-real',
  webServer: {
    ...base.webServer,
    reuseExistingServer: false,
    url: 'http://127.0.0.1:3490/api/health/ready',
    command: 'tsx scripts/workspace-browser-start.ts',
  },
});

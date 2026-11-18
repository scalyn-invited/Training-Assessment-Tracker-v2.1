import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testDir:
    process.env.OVERVIEW_QA_SUITE === 'shell' ? 'tests/shell-browser' : 'tests/overview-browser',
  use: { ...base.use, channel: process.env.CI ? undefined : 'chrome' },
  webServer: {
    ...base.webServer,
    command: 'tsx scripts/overview-browser-start.ts',
    url: 'http://127.0.0.1:3110/api/health/ready',
    reuseExistingServer: false,
  },
});

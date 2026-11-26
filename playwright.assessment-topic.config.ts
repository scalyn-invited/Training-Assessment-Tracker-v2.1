import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
export default defineConfig({
  ...base,
  testDir: 'tests/assessment-topic-browser',
  webServer: {
    command: 'tsx scripts/overview-browser-start.ts',
    url: 'http://127.0.0.1:3110/api/health/ready',
    timeout: 120000,
    reuseExistingServer: false,
    env: { AI_AUTHORING_LIMIT_MICRO_USD: '1000000', AI_AUTHORING_CALL_LIMIT: '20' },
  },
});

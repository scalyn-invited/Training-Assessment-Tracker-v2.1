import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base,
  testDir: 'tests/mock-browser',
  webServer: {
    command: 'tsx scripts/browser-mock-start.ts',
    url: 'http://127.0.0.1:3110/api/health/ready',
    timeout: 180000,
  },
});

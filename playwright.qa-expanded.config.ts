import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
export default defineConfig({
  ...base,
  testDir: process.env.QA_TEST_DIR || 'tests/browser',
  use: { ...base.use, trace: 'off', screenshot: 'off' },
  webServer: {
    ...base.webServer,
    command: process.env.QA_BUILT
      ? 'tsx tests/expanded-appearance-browser/server.ts'
      : 'tsx scripts/overview-browser-start.ts',
  },
  reporter: 'list',
  outputDir: 'evidence/expanded/results',
});

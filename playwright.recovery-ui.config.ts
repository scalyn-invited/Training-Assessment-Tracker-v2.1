import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
export default defineConfig({
  ...base,
  testDir: 'tests/recovery-ui-browser',
  use: { ...base.use, trace: 'off', screenshot: 'off' },
});

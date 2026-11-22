import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
export default defineConfig({
  ...base,
  testDir: 'tests/account-ui-browser',
  // Private link/MFA fixtures must not be retained in failure screenshots or traces.
  use: { ...base.use, screenshot: 'off', trace: 'off' },
});

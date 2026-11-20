import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
export default defineConfig({
  ...base,
  testDir: 'tests/client-settings-ui-browser',
  testMatch:
    process.env.CLIENT_SETTINGS_QA_SUITE === 'appearance' ? 'appearance.spec.ts' : 'ai.spec.ts',
});

import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
const suites: Record<string, string> = {
  settings: 'tests/settings-ui-browser',
  audit: 'tests/audit-ui-browser',
  people: 'tests/people-ui-browser',
  history: 'tests/directory-history-browser',
  accounts: 'tests/platform-accounts-browser',
  'accounts-mock': 'tests/platform-accounts-mock-browser',
  overview: 'tests/overview-browser',
};
export default defineConfig({
  ...base,
  testDir: suites[process.env.CLIENTS_QA_SUITE ?? ''] ?? 'tests/clients-ui-browser',
});

import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
const suites: Record<string, string> = {
  people: '**/client-admin-ui-browser/people.spec.ts',
  administration: '**/client-admin-ui-browser/administration.spec.ts',
  versions: '**/administration-version-browser/administration-version.spec.ts',
  mock: '**/client-admin-ui-browser/mock.spec.ts',
};
export default defineConfig({
  ...base,
  testDir: 'tests',
  testMatch: suites[process.env.CLIENT_ADMIN_QA_SUITE ?? 'people'],
});

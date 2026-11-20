import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
export default defineConfig({
  testDir: 'tests/workflow-qa-browser',
  workers: 1,
  fullyParallel: false,
  use: { headless: true },
  reporter: 'list',
  outputDir: '.runtime/workflow-qa-playwright',
});

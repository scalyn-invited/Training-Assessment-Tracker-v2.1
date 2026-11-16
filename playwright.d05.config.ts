import path from 'node:path';
import { defineConfig } from '@playwright/test';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('.runtime/browsers');
export default defineConfig({
  testDir: 'tests/d05-browser',
  workers: 1,
  fullyParallel: false,
  use: { headless: true },
  reporter: 'list',
  outputDir: '.runtime/d05-playwright',
});

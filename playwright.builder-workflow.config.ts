import { defineConfig } from '@playwright/test';
import base from './playwright.workflow-qa.config';
export default defineConfig({
  ...base,
  grep: /D03|D04 preview|D06|author/,
  use: { ...base.use, channel: process.env.CI ? undefined : 'chrome' },
});

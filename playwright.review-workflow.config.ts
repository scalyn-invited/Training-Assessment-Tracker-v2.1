import { defineConfig } from '@playwright/test';
import base from './playwright.workflow-qa.config';
export default defineConfig({
  ...base,
  grep: /D07|D04 reordered|D01 reviewer|D01 confirmed|D01 uncertain/,
  use: { ...base.use, channel: process.env.CI ? undefined : 'chrome' },
});

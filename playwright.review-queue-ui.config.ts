import { defineConfig } from '@playwright/test';
import base from './playwright.overview.config';
export default defineConfig({ ...base, testDir: 'tests/review-queue-ui-browser' });

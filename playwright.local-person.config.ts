import { defineConfig } from '@playwright/test';
import base from './playwright.mock.config.js';
export default defineConfig({ ...base, testDir: 'tests/local-person-browser' });

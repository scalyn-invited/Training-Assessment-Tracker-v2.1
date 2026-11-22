import { defineConfig } from '@playwright/test';
import base from './playwright.workflow-next.config';
export default defineConfig({ ...base, use: { ...base.use, channel: 'chrome' } });

import {defineConfig} from '@playwright/test';
import base from './playwright.guest-ui.config';
export default defineConfig({...base, testDir:'tests/qa-theme-real', use:{...base.use,baseURL:'http://127.0.0.1:3390'}, reporter:'list', outputDir:'output/qa-theme/real-results', webServer:{...base.webServer,url:'http://127.0.0.1:3390/api/health/ready', command:'tsx scripts/qa-theme-start.ts'}});

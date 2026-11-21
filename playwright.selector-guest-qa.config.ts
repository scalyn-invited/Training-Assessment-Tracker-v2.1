import {defineConfig} from '@playwright/test';
import base from './playwright.workspace-popover.config';
export default defineConfig({...base,testDir:'tests/guest-ui-browser',outputDir:'output/selector-qa/guest'});

import base from './playwright.first-paint.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,use:{...base.use,channel:undefined},outputDir:'evidence/first-paint/cross-browser',projects:[{name:'edge',use:{channel:'msedge'}},{name:'firefox',use:{browserName:'firefox',channel:undefined}}]});

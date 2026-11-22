import { defineConfig } from 'vitest/config';
// Web resolver tests stay in the web TypeScript project (Bundler resolution).
export default defineConfig({ test: { include: ['apps/web/app/appearance-outage.test.ts'] } });

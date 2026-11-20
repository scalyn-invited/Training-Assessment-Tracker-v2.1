import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['docs/assessment-workflow-implementation/final-review/publication-race.test.ts'],testTimeout:30000,hookTimeout:180000,fileParallelism:false,pool:'forks',maxWorkers:1}});

import base from '../../../vitest.config.js';
export default { ...base, test: { ...base.test, setupFiles: ['docs/assessment-workflow-implementation/correction-backend/query-diagnostic.ts'] } };

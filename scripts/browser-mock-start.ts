process.env.TRAINING_AUTH_MODE = 'mock';
process.env.MOCK_IDENTITY_ENABLED = 'true';
process.env.TRAINING_ENVIRONMENT = 'test';
await import('./browser-start.js');

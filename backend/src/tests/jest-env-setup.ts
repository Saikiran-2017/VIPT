/** Runs before test files (see jest.config.js setupFiles). Ensures API_KEY is set before `config` loads. */
process.env.API_KEY = process.env.API_KEY || 'test-api-key-vipt-jest';

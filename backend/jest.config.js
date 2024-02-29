module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  /** Avoid scanning compiled output (duplicate `__mocks__`, stale modules). */
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
  },
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/src/tests/jest-env-setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
};

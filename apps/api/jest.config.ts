import type { Config } from 'jest';

const base: Partial<Config> = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

const config: Config = {
  // Note: --runInBand is passed via CLI when running integration tests
  // to avoid DB race conditions. See test:integration script in package.json.

  projects: [
    // ── Unit tests (mock-based, no DB) ──────────────────────
    {
      ...base,
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },

    // ── Integration tests (real DB via supertest) ───────────
    {
      ...base,
      displayName: 'integration',
      rootDir: '.',
      testMatch: ['<rootDir>/test/integration/**/*.e2e-spec.ts'],
      globalSetup: '<rootDir>/test/jest-global-setup.ts',
      globalTeardown: '<rootDir>/test/jest-global-teardown.ts',
      testTimeout: 15000,
    },
  ],

  // Coverage collected from all source files
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
};

export default config;

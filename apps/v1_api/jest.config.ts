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
  projects: [
    {
      ...base,
      displayName: 'unit',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
    },
    {
      ...base,
      displayName: 'integration',
      rootDir: '.',
      testEnvironment: '<rootDir>/test/helpers/isolated-integration-environment.cjs',
      testMatch: [
        '<rootDir>/test/integration/**/*.e2e-spec.ts',
        '<rootDir>/test/tournaments/**/*.integration-spec.ts',
        '<rootDir>/test/games/**/*.integration-spec.ts',
        '<rootDir>/test/jobs/**/*.integration-spec.ts',
        // Task 12 (team schedules): without this glob, none of the three specs under
        // test/team-schedules/ (attendance, schedule-crud, and this HTTP contract spec) are ever
        // selected by `jest --selectProjects integration` — the CI "V1 migration replay + drift
        // gate" step runs exactly that command, so they would silently never execute despite
        // existing on disk. Added while writing the HTTP contract spec for this reason.
        '<rootDir>/test/team-schedules/**/*.integration-spec.ts',
      ],
    },
    {
      ...base,
      displayName: 'runner-contract',
      rootDir: '.',
      testMatch: ['<rootDir>/test/config/**/*.contract.spec.ts'],
    },
  ],
  testTimeout: 15000,
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: './coverage',
};

export default config;

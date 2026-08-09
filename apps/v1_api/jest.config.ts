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
        // T4 (team-match-series): same silent-omission trap as team-schedules above —
        // without this glob, `jest --selectProjects integration` never selects
        // test/team-match-series/**, so the admin/public HTTP contract specs would exist
        // on disk but never run in CI's migration replay + drift gate.
        '<rootDir>/test/team-match-series/**/*.integration-spec.ts',
        // 레인 schedule (매치 ↔ 팀일정 연동) 작업 중 발견: test/team-matches/** 도 같은
        // silent-omission 함정에 걸려 있다 — 그 디렉터리의 기존 두 스펙
        // (team-match-lineup.integration-spec.ts, team-match-game-adapter.integration-spec.ts)은
        // 디스크에 존재하지만 `jest --selectProjects integration`(CI의 migration replay +
        // drift gate가 그대로 호출)로 한 번도 선택된 적이 없어 이후 코드 변화(Idempotency-Key
        // 필수화, LOCKED 상태 리네이밍 등)에 이미 bit-rot됐다(이번에 처음 실행해보니 7건 실패 —
        // 이 레인과 무관한 Task 14/Task 6 영역이라 여기서 고치지 않는다). 그 두 파일까지 와일드카드로
        // 되살리면 CI가 이 PR과 무관한 이유로 깨지므로, 새로 추가한 이 레인의
        // team-match-schedule-link.integration-spec.ts 하나만 명시 경로로 등록한다.
        '<rootDir>/test/team-matches/team-match-schedule-link.integration-spec.ts',
        // Copilot review finding (PR #306): a lineup-cap change with no CI-run
        // regression test doesn't actually catch a future regression. This
        // spec has its own minimal, guest-only fixture (no dependency on the
        // Idempotency-Key/LOCKED-state bit rot in the rest of
        // test/team-matches/ noted above) so it can be registered without
        // reviving the other 6 pre-existing, unrelated failures.
        '<rootDir>/test/team-matches/team-match-lineup-size.integration-spec.ts',
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

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
        // 팀 스코프 라인업 재사용(히스토리·프리셋·고정 등번호). 위 두 주석이 경고하는
        // silent-omission 함정을 피하려고 디렉터리를 만들 때 함께 등록한다 — 등록을
        // 잊으면 스펙이 디스크에만 있고 CI에서는 한 번도 돌지 않는다.
        '<rootDir>/test/team-lineups/**/*.integration-spec.ts',
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
        // Task 153 승강 확정 경로. test/league-matches/ 는 이 줄이 생기기 전까지
        // integration testMatch 에 **한 번도 등록된 적이 없다** — 그 디렉터리의 기존 4개
        // 스펙(admin·public·forfeit·completion-projection)은 디스크에만 있고
        // `jest --selectProjects integration`(CI 의 migration replay + drift gate 가 그대로
        // 호출)으로 선택된 적이 없다. 위 team-schedules·team-match-series·team-lineups
        // 주석이 경고하는 그 silent-omission 함정이 여기서도 반복됐다.
        //
        // 그 4개를 와일드카드로 한꺼번에 되살리면 이 PR 과 무관한 이유로 CI 가 깨진다
        // (로컬 실측: 45건 중 44건 통과, 1건은 league-match-public 의 "state 필터" 케이스가
        // 종목을 새로 만들어 경기 설정이 없는 탓에 409 COMPETITION_CONFIG_REQUIRED —
        // 내 변경과 무관한 선재 결함이다). 그래서 team-matches 선례를 따라 이 레인이
        // 새로 추가한 파일 하나만 명시 경로로 등록한다.
        '<rootDir>/test/league-matches/league-promotion.integration-spec.ts',
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

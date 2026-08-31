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
        // ── 디렉터리는 **글롭으로 등록한다. 파일별 열거를 쓰지 않는다.** ──
        //
        // 열거는 이 저장소에서 **여섯 번 연속 실패했다.** team-schedules · team-match-series ·
        // team-lineups · team-matches · league-matches(×6, 레인마다 한 줄씩) 가 전부 같은 방식
        // ("내 파일만 명시 등록, 나머지는 나중에")으로 늘었고, 그 결과 **디스크에 있는데
        // `jest --selectProjects integration`(= CI 의 migration replay + drift gate)이 한 번도
        // 고르지 않는 스펙이 7개** 쌓였다.
        //
        // 대가가 실제로 발생했다: `league-completion-projection.integration-spec.ts` 는 만들어진
        // 뒤 한 번도 등록된 적이 없는데(전 이력 grep 0), 2026-09-01 KST 에 그 파일에 R4-b 봉쇄
        // 테스트를 추가하고 "변이로 red 를 확인했다"고 보고했다. **그 파일은 실행 자체가
        // 불가능했다**(`jest <경로>` 도 "0 matches"). 등록 누락이 **거짓 검증 보고**를 만든 것이다.
        //
        // 그래서 **글롭으로 바꾸고, 안 도는 것은 아래 testPathIgnorePatterns 에 이름과 이유를
        // 적어 둔다.** 침묵 누락(등록 안 함)과 명시 제외(이유를 적고 뺌)는 다르다 — 전자는
        // 아무도 모르고, 후자는 목록을 보면 보인다.
        '<rootDir>/test/team-schedules/**/*.integration-spec.ts',
        '<rootDir>/test/team-match-series/**/*.integration-spec.ts',
        '<rootDir>/test/team-lineups/**/*.integration-spec.ts',
        '<rootDir>/test/team-matches/**/*.integration-spec.ts',
        '<rootDir>/test/league-matches/**/*.integration-spec.ts',
        '<rootDir>/test/admin/**/*.integration-spec.ts',
        '<rootDir>/test/team-contacts/**/*.integration-spec.ts',
      ],
      // **명시 제외 — 이름과 이유를 적는다.** 침묵 누락과 달리 이 목록은 눈에 보이고,
      // 지우면 CI 가 바로 말해 준다. 여기 있는 것은 전부 **이 변경과 무관한 선재 결함**이고,
      // 고치는 것은 별도 작업이다. **새 스펙을 여기 넣지 마라** — 여기는 "고쳐야 할 빚" 목록이지
      // "안 돌려도 되는 것" 목록이 아니다.
      testPathIgnorePatterns: [
        // Idempotency-Key 필수화 · LOCKED 상태 리네이밍 이후 bit-rot. 등록 시도 때 7건 실패로
        // 실측됐고(Task 14/Task 6 영역), 그 뒤로 아무도 고치지 않았다.
        '<rootDir>/test/team-matches/team-match-lineup\\.integration-spec\\.ts$',
        '<rootDir>/test/team-matches/team-match-game-adapter\\.integration-spec\\.ts$',
        //
        // ── 아래 셋은 이 PR 의 CI 가 **처음 돌려서** 드러난 bit-rot 이다(2026-09-01 KST).
        //    셋 다 **코드가 아니라 테스트가 낡았다** — 안 도는 동안 코드가 앞서 갔다.
        //    수리는 별도 작업이다(이 PR 은 등록 방식만 바꾼다).
        //
        // 응답에 `leagueCompleted: false` 가 추가됐는데 :588 의 `toEqual` 이 옛 모양 그대로다.
        '<rootDir>/test/league-matches/league-match-admin\\.integration-spec\\.ts$',
        // 목록 커서가 `<state>:<id>`(`paginateByStatePriority`)로 바뀌었는데 옛 포맷을 기대한다
        //   Expected "098219f7-…"  /  Received "draft:098219f7-…"
        '<rootDir>/test/league-matches/league-match-public\\.integration-spec\\.ts$',
        // :195 `v1TournamentField.create` 가 FK 위반 — `v1_tournament_fields_tournament_fk`.
        // 픽스처가 만드는 대회보다 필드 생성이 앞서거나 대회가 안 만들어진다.
        '<rootDir>/test/admin/task7-platform-ops-boundary\\.integration-spec\\.ts$',
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

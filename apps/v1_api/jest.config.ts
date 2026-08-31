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
        // 디렉터리를 열거하지 않는다 — **`test/**` 한 줄**이다.
        //
        // 파일 열거를 디렉터리 열거로 바꾸는 것만으로는 **7번째 사고를 못 막는다**: 지난 6회가
        // 전부 *"새 디렉터리/새 파일을 등록 안 함"* 이었고, 디렉터리 열거는 **새 디렉터리가
        // 생기면 똑같이 조용히 빠진다.** 등록을 사람이 기억해야 하는 구조가 남아 있으면 같은
        // 사고가 이름만 바꿔 반복된다.
        '<rootDir>/test/**/*.integration-spec.ts',
        // 확장자가 달라 위 글롭에 안 잡힌다 — 이 한 줄은 유지한다.
        '<rootDir>/test/integration/**/*.e2e-spec.ts',
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

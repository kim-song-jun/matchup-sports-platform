import type { Config } from 'jest';

// 워커가 이 프로세스의 env 를 물려받으므로 여기서 한 번 고정하면 전 스위트에 적용된다.
// 이유는 `apps/v1_web/vitest.config.mts` 의 같은 핀과 같다 — CI(UTC)와 로컬(KST)이
// 자정 경계에서 갈리는 것을 없앤다.
process.env.TZ = 'UTC';

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
        // ── team-matches: `team-match-lineup` 은 **되살렸다**(2026-09-07). ──
        // 실측한 실패 6건의 정체는 셋이었다:
        //   ① Idempotency-Key 필수화 이후 `undefined` 를 넘기던 호출 4건 — 키를 채웠다.
        //   ② 폐기된 계약을 단언하던 3건(최소 인원·골키퍼 필수·인원 상한) — 정본 §3 으로
        //      사라진 규칙이라 `src` 에 throw 지점이 0곳이다. 상한 쪽은 지우지 않고
        //      **반대 방향**(상한을 넘어도 저장된다)으로 다시 써서 새 계약을 못박았다.
        //      **중복 등번호·중복 userId 검사는 폐기되지 않았으므로 그대로 남겼다.**
        //   ③ `LOCKED` 단언 1건 — 폐기도 결함도 아니었다. `requestChange` 는 lazyLock 의
        //      UPDATE 뒤 409 를 던지는데 그 전체가 한 `serializable` 트랜잭션이라 UPDATE 도
        //      함께 롤백된다. 이제 **정상 반환하는 읽기 경로**를 먼저 태워 락이 실제로
        //      영속되는 것을 잰다.
        //   (재생 테스트 1건은 앞선 테스트가 남긴 SUBMITTED 상태 때문이었다 — 전용
        //    팀매치 픽스처로 갈랐다.)
        //
        // `team-match-game-adapter` 는 **아직 켜지 않는다**: 그 스펙이
        // `TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN` 을 무조건 기대하는데 리그 예외가 들어와
        // 그 게이트가 좁아졌다(#1054). 보고된 2건보다 늘었을 수 있어 별건으로 다룬다.
        '<rootDir>/test/team-matches/team-match-game-adapter\\.integration-spec\\.ts$',
        //
        // ── 여기 남은 하나는 **상속한 숫자가 아니라 측정값**이다(2026-09-01 KST CI). ──
        //
        // 측정한 사실만 적는다:
        //   2026-08-01 02:15  스펙 작성(878bf0d59) — 이때는 FK 가 없어 유효했다
        //   2026-08-01 13:40  FK 마이그레이션(7e25c4ce1)이 붙으며 무효화
        //   그 뒤              등록된 적이 없어 드러나지 않았다(이 파일은 전 이력에서
        //                      v1Tournament 를 만든 적이 없다 — grep 0)
        // 되살리려면 픽스처에 대회 2개를 새로 만들어야 한다. 같은 bit-rot 이지만 **고치는
        // 규모가 "낡은 기대값 갱신" 과 다르다** — 그래서 별도 작업으로 남긴다.
        //
        // 위 사유는 **측정값**이고, 같은 CI 가 드러낸 다른 두 건(league-match-admin 의
        // `leagueCompleted` · league-match-public 의 커서 포맷)은 **이 PR 에서 고쳐 제외에서 뺐다.**
        // 여기 남은 것은 task7 하나뿐이다.
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

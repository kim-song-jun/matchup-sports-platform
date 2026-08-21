import {
  parseLineupConfigForResponse,
  parseLineupLimits,
  parsePeriodDurations,
  parseResultPolicy,
} from './competition-config.parse';
import { FOOTBALL_V1_CONFIG, FUTSAL_V1_CONFIG } from './competition-config.presets';

/**
 * The lineup screens pick which formation presets to offer from the squad size the admin
 * configured for this competition. Before this helper existed the response carried only the
 * position/formation catalog, so the frontend inferred the number by counting
 * `starters − 골키퍼로 지정된 선수` — a count that shifts the moment a manager taps GK, which
 * swapped the whole preset list mid-edit. If this field silently stops being sent, that
 * guidance disappears without any type error, so the contract is pinned here.
 */
describe('parseLineupConfigForResponse', () => {
  it('carries the configured squad size alongside the position/formation catalog', () => {
    const parsed = parseLineupConfigForResponse({
      minPlayers: 5,
      maxPlayers: 5,
      substitutions: 'rolling',
      maxSubstitutions: null,
      positions: [{ code: 'GOLEIRO', label: '골레이로', short: 'GK', goalkeeper: true }],
      formations: [
        { code: '2-2', label: '박스', outfield: 4, slots: [{ position: 'FIXO', x: 28, y: 38 }] },
      ],
    });

    expect(parsed.minPlayers).toBe(5);
    expect(parsed.maxPlayers).toBe(5);
    expect(parsed.positions).toHaveLength(1);
    expect(parsed.formations).toHaveLength(1);
  });

  it('degrades to the same tolerant defaults as its two halves for a legacy/empty blob', () => {
    // 구버전 config row에는 positions/formations가 아예 없다 — 화면은 이 상태를 "프리셋 없음,
    // 자유 배치만"으로 이미 다루므로 여기서 던지면 안 된다.
    expect(parseLineupConfigForResponse(null)).toEqual({
      positions: [],
      formations: [],
      minPlayers: 1,
      maxPlayers: 11,
    });
  });
});

/**
 * Extracted from a private duplicate in team-match-lineup.service.ts so
 * games.service.ts#saveLineup could reuse the exact same roster-size gate
 * instead of having no check at all — this spec locks the tolerant-defaults
 * contract both call sites depend on.
 */
describe('parseLineupLimits', () => {
  it('reads minPlayers/maxPlayers/substitutions/maxSubstitutions off a well-formed lineup blob', () => {
    expect(
      parseLineupLimits({ minPlayers: 3, maxPlayers: 6, substitutions: 'rolling', maxSubstitutions: null }),
    ).toEqual({ minPlayers: 3, maxPlayers: 6, substitutions: 'rolling', maxSubstitutions: null });
    expect(
      parseLineupLimits({ minPlayers: 7, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: 5 }),
    ).toEqual({ minPlayers: 7, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: 5 });
  });

  it('falls back to (1, 11, limited, null) for null/undefined/non-object input, never throwing', () => {
    const fallback = { minPlayers: 1, maxPlayers: 11, substitutions: 'limited', maxSubstitutions: null };
    expect(parseLineupLimits(null)).toEqual(fallback);
    expect(parseLineupLimits(undefined)).toEqual(fallback);
    expect(parseLineupLimits('not-an-object' as never)).toEqual(fallback);
    expect(parseLineupLimits([] as never)).toEqual(fallback);
  });

  it('falls back field-by-field when individual keys are missing or malformed', () => {
    expect(parseLineupLimits({ maxPlayers: 6 })).toEqual({
      minPlayers: 1,
      maxPlayers: 6,
      substitutions: 'limited',
      maxSubstitutions: null,
    });
    expect(parseLineupLimits({ minPlayers: 'three', maxPlayers: 6, substitutions: 'rolling' })).toEqual({
      minPlayers: 1,
      maxPlayers: 6,
      substitutions: 'rolling',
      maxSubstitutions: null,
    });
  });

  it('only accepts the literal string "rolling" for substitutions — anything else (including typos) degrades to "limited"', () => {
    expect(parseLineupLimits({ substitutions: 'rolling' }).substitutions).toBe('rolling');
    expect(parseLineupLimits({ substitutions: 'unlimited' }).substitutions).toBe('limited');
    expect(parseLineupLimits({ substitutions: 'Rolling' }).substitutions).toBe('limited');
  });
});

/**
 * alpha "452′" 사고 대응(2026-08) — `operate-console.tsx`의 확인 게이트가 이
 * 파서의 반환값으로 "제출을 막을지 그냥 통과시킬지"를 가른다. 실제 프리셋
 * 모양(`competition-config.presets.ts`의 `FOOTBALL_V1_CONFIG.periods` 등)과
 * 레거시 `{count:N}` 축약 모양, 개별 항목 손상까지 모두 커버한다.
 */
describe('parsePeriodDurations', () => {
  it('reads durationMinutes/extraTime off a well-formed periods array, index-aligned with input order', () => {
    expect(
      parsePeriodDurations([
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
      ]),
    ).toEqual([
      { durationMinutes: 45, extraTime: false },
      { durationMinutes: 45, extraTime: false },
    ]);
  });

  it('reads extraTime: true through unchanged for a dedicated extra-time period entry', () => {
    expect(parsePeriodDurations([{ code: 'EXTRA_FIRST', durationMinutes: 15, extraTime: true }])).toEqual([
      { durationMinutes: 15, extraTime: true },
    ]);
  });

  it('returns null wholesale for the legacy {count:N} shape — it carries no per-period duration to read', () => {
    expect(parsePeriodDurations({ count: 2 } as never)).toBeNull();
  });

  it('returns null for non-array/null/undefined input, never throwing', () => {
    expect(parsePeriodDurations(null)).toBeNull();
    expect(parsePeriodDurations(undefined)).toBeNull();
    expect(parsePeriodDurations('not-an-array' as never)).toBeNull();
  });

  it('degrades a single malformed entry to null without invalidating the rest of the array', () => {
    expect(
      parsePeriodDurations([
        { code: 'FIRST_HALF', durationMinutes: 45, extraTime: false },
        { code: 'BROKEN', durationMinutes: 0, extraTime: false },
        { code: 'MISSING_DURATION' },
        'not-an-object',
        { code: 'SECOND_HALF', durationMinutes: 45, extraTime: false },
      ] as never),
    ).toEqual([
      { durationMinutes: 45, extraTime: false },
      null,
      null,
      null,
      { durationMinutes: 45, extraTime: false },
    ]);
  });

  it('treats any non-true extraTime value as false rather than propagating a malformed flag', () => {
    expect(parsePeriodDurations([{ durationMinutes: 20, extraTime: 'yes' }] as never)).toEqual([
      { durationMinutes: 20, extraTime: false },
    ]);
  });
});

/**
 * 승부차기 조기 종료(early stop) 정책의 **관용 리더**.
 *
 * ## 왜 프리셋을 바꾸지 않고 리더를 두는가
 *
 * canonical 프리셋(`competition-config.presets.ts`)의 `result` 를 건드리면 그 두 행의
 * `contentHash` 가 바뀐다 → 백필 CLI 가 `COMPETITION_CONFIG_SEED_DRIFT` 로 실패하고
 * (`competition-config-backfill.ts`), 이미 참조 중인 버전 행은
 * `COMPETITION_CONFIG_VERSION_IN_USE` 트리거가 UPDATE 자체를 막는다 → alpha·prod 양쪽에
 * 운영 데이터 마이그레이션이 필요해진다. 그래서 **저장된 config 는 그대로 두고**, 키가
 * 없으면 기본값으로 읽는다. `parseLineupLimits`/`parsePeriodDurations` 와 같은
 * "read-path 는 관용, write-path(`validateCompetitionConfig`)만 엄격" 규약을 따른다.
 *
 * ## 기본값이 `earlyStop: true` 인 이유
 *
 * FIFA 정규 규칙(5킥 이내라도 남은 킥으로 뒤집을 수 없으면 종료)이 기본이다. 이 기본값은
 * 지금 동작(`home !== away` 하나만 보는 판정)보다 **더 엄격하다** — 각 3킥 2:1 은 오늘
 * 결판으로 읽히지만 이 정책에서는 미결이다. 즉 키가 없는 기존 대회 전부가 기본값을 받아도
 * "덜 막던 것을 더 막는" 방향이라 잘못 확정될 위험이 늘지 않는다.
 *
 * ## 저장 형태
 *
 * `result.penaltyShootout: { earlyStop: boolean }` — `getGame` 응답의
 * `penaltyShootoutPolicy` 와 **동형**으로 둔다(`substitutionPolicy`/`periodDurations` 가
 * 그렇듯 파싱 결과를 그대로 응답에 실을 수 있게). 이 형태는 이 테스트가 못 박는 계약이므로,
 * 구현이 다른 키를 고르면 여기와 `competition-config.types.ts` 를 함께 바꿔야 한다.
 */
describe('parseResultPolicy', () => {
  it('키가 없으면 FIFA 정규(earlyStop: true)를 기본값으로 쓴다', () => {
    expect(parseResultPolicy(null)).toEqual({ earlyStop: true });
    expect(parseResultPolicy(undefined)).toEqual({ earlyStop: true });
    expect(parseResultPolicy({})).toEqual({ earlyStop: true });
    expect(parseResultPolicy({ tournamentScorerPolicy: 'required' })).toEqual({ earlyStop: true });
  });

  /**
   * 프리셋을 **바꾸지 않았다**는 것과, 그런데도 기존 대회가 기본값을 받는다는 것을 한
   * 테스트가 동시에 지킨다. 누군가 프리셋에 값을 박아 넣어 이 문제를 "해결"하려 하면
   * (= contentHash 드리프트 사고) 이 테스트가 아니라 `competition-config.presets.spec.ts`
   * 의 해시 고정이 먼저 깨진다.
   */
  it('canonical 프리셋(무변경)도 기본값으로 읽힌다', () => {
    expect(parseResultPolicy(FOOTBALL_V1_CONFIG.result)).toEqual({ earlyStop: true });
    expect(parseResultPolicy(FUTSAL_V1_CONFIG.result)).toEqual({ earlyStop: true });
  });

  it('명시적으로 꺼 둔 대회는 끝까지 차는 정책(earlyStop: false)을 그대로 읽는다', () => {
    expect(parseResultPolicy({ penaltyShootout: { earlyStop: false } })).toEqual({ earlyStop: false });
  });

  it('명시적으로 켜 둔 값도 그대로 읽는다', () => {
    expect(parseResultPolicy({ penaltyShootout: { earlyStop: true } })).toEqual({ earlyStop: true });
  });

  /**
   * 관용 리더의 핵심 — 형태가 깨진 값은 **throw 하지 않고** 기본값으로 떨어진다. 특히
   * 문자열 `'false'` 를 boolean false 로 읽어 주면 안 된다: 그러면 오타 하나가 조용히
   * 정책을 뒤집어, 아직 결판나지 않은 승부차기를 종료할 수 있게 만든다(= 이 작업이
   * 고치려는 결함과 같은 부류).
   */
  it.each([
    ['penaltyShootout 가 문자열', { penaltyShootout: 'off' }],
    ['penaltyShootout 가 배열', { penaltyShootout: [] }],
    ['penaltyShootout 가 null', { penaltyShootout: null }],
    ['earlyStop 이 문자열 false', { penaltyShootout: { earlyStop: 'false' } }],
    ['earlyStop 이 숫자 0', { penaltyShootout: { earlyStop: 0 } }],
    ['earlyStop 누락', { penaltyShootout: {} }],
    ['result 자체가 문자열', 'not-an-object'],
    ['result 자체가 배열', []],
  ])('%s이면 기본값으로 떨어진다', (_label, stored) => {
    expect(parseResultPolicy(stored as never)).toEqual({ earlyStop: true });
  });
});

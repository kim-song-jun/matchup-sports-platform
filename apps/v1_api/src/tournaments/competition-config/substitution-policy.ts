import { CompetitionConfig } from './competition-config.types';

/**
 * "교체 방식/횟수"(관리자가 대회별로 고르는 `CompetitionConfig.lineup.substitutions` /
 * `maxSubstitutions`) 기능의 순수 계산 계층. `lineup-size.ts`와 같은 패턴 —
 * Prisma/Nest 의존 없이 단독 테스트 가능하다.
 *
 * `lineup-size.ts#selectableLineupSizes()`는 `lineup.formations`라는 실제 데이터에서
 * 후보 인원수를 파생시키지만, 교체 횟수(N)에는 그런 카탈로그가 존재하지 않는다(축구/풋살
 * canonical 모두 정확히 하나의 고정값만 갖는다 — football: limited/5, futsal:
 * rolling/null). 없는 목록을 지어내는 대신, 이 모듈은 "몇 번까지"를 자유 정수 입력으로
 * 받고 `validateCompetitionConfig`(0 이상의 정수)가 그 값을 검증하게 한다. 반면
 * "제한(limited) vs 무제한(rolling)" 모드 자체는 진짜 카탈로그가 있다 —
 * `CompetitionConfig['lineup']['substitutions']` 타입이 정의한 두 값 그대로이고, 게임
 * 엔진(`games.service.ts` / `games/core/substitution.ts`)이 이미 이 두 모드를 종목
 * 하드코딩 없이 config 값만으로 지원한다(docs/api/domains/games.md 참고) — 그래서
 * SELECTABLE_SUBSTITUTION_MODES는 실제로 지원되는 값이지 지어낸 선택지가 아니다.
 */
export const SELECTABLE_SUBSTITUTION_MODES: ReadonlyArray<CompetitionConfig['lineup']['substitutions']> = [
  'limited',
  'rolling',
];

/**
 * canonical(또는 이미 다른 override가 적용된) config에서 lineup.substitutions/
 * maxSubstitutions만 바꾼 새 config content를 만든다. 나머지는 그대로 유지한다
 * (`lineup-size.ts#buildLineupSizeConfig`와 같은 원칙 — 서로 다른 override를 조합해도
 * 각자 건드리는 필드만 바뀐다).
 *
 * `mode`가 'rolling'이면 `maxSubstitutions`는 항상 null로 강제한다 — "무제한"에 숫자
 * 상한이 함께 있는 모순 상태를 만들지 않는다. `mode`가 'limited'면 호출부가 넘긴 값을
 * 그대로 쓴다(정수/범위 검증은 호출부 책임 — LineupSizeConfigResolver 참고).
 */
export function buildSubstitutionPolicyConfig(
  config: CompetitionConfig,
  mode: CompetitionConfig['lineup']['substitutions'],
  maxSubstitutions: number | null,
): CompetitionConfig {
  return {
    ...config,
    lineup: {
      ...config.lineup,
      substitutions: mode,
      maxSubstitutions: mode === 'rolling' ? null : maxSubstitutions,
    },
  };
}

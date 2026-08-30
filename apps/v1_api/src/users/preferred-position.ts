/**
 * [D14] 종목별 **선호 포지션(주/부)** 검증.
 *
 * 사람 축에 한 번 저장하면 모든 대회·리그에 자동 적용되는 값이다. 그래서 잘못된 값이
 * 들어가면 그 사람의 **모든 경기 기록 표시와 선수 카드 가중치**가 계속 틀린다 — 경기마다
 * 고쳐 넣을 기회가 없다. 저장 시점 검증이 유일한 방어선이라 규칙을 여기 모아 둔다.
 *
 * 코드 집합을 하드코딩하지 않는다. 종목마다 자리 이름이 다르고(축구 `GK`/`DF`/`MF`/`FW`,
 * 풋살 `GOLEIRO`/`FIXO`/`ALA`/`PIVO`) 프리셋이 늘어날 수 있으므로, 그 종목 대회 설정의
 * `lineup.positions[].code` 를 **단일 출처**로 받는다.
 */

/**
 * 이 종목에서 고를 수 있는 자리 코드. **종목 프리셋이 단일 출처**다.
 *
 * 프리셋이 없는 종목(러닝·수영 등)은 **빈 배열**을 돌려준다 — 그건 오류가 아니라
 * "이 종목엔 포지션 개념이 없다"는 사실이다. 화면은 이 값이 비면 선호 포지션 섹션을
 * **아예 숨겨야 한다**(빈 목록을 보여주는 것이 아니다).
 *
 * `tryNormalizeCompetitionSportCode` 가 football·futsal 만 통과시키므로 나머지 종목은
 * 여기서 자연히 걸러진다 -- 종목 목록을 따로 관리하지 않는다.
 */
export function positionCodesForSport(
  rawSportCode: string | null | undefined,
  deps: {
    readonly tryNormalize: (value: string) => string | null;
    readonly canonicalConfig: (normalized: string) => { lineup: { positions: readonly { code: string }[] } };
  },
): string[] {
  if (typeof rawSportCode !== 'string') return [];
  // 원시 문자열을 프리셋 조회에 직접 넣지 않는다(lineup-size.ts 의 명시 규약).
  const normalized = deps.tryNormalize(rawSportCode);
  if (normalized === null) return [];
  return deps.canonicalConfig(normalized).lineup.positions.map((position) => position.code);
}

export interface PreferredPositionInput {
  /** 주 포지션. null = 미설정. */
  readonly primary: string | null;
  /** 부 포지션. null = 미설정. */
  readonly secondary: string | null;
}

export type PreferredPositionError =
  /** 부만 정했다 — 주 없이 부는 의미가 없다. */
  | 'SECONDARY_WITHOUT_PRIMARY'
  /** 주와 부가 같다 — 같으면 부가 담는 정보가 0이다. */
  | 'DUPLICATE_POSITION'
  /** 이 종목에 없는 코드다(풋살 선호에 축구 `CB` 같은 것). */
  | 'UNKNOWN_POSITION';

/**
 * 규칙 네 가지를 한곳에서 판정한다. 통과면 `null`, 아니면 첫 위반 코드.
 *
 * - **둘 다 null 은 정상이다.** 미설정은 결함이 아니라 기본 상태다(카드 포지션 미상,
 *   가중치 균등). 강제하지 않는다.
 * - **주 없이 부만**은 거부한다. 부를 정하려면 주가 먼저다.
 * - **주 == 부**는 거부한다.
 * - **다른 종목의 코드**는 거부한다. 이 검사가 없으면 종목을 바꿔 저장할 때 남은 값이
 *   조용히 살아남아, 그 종목엔 존재하지 않는 자리가 카드에 뜬다.
 */
export function validatePreferredPositions(
  input: PreferredPositionInput,
  allowedCodes: readonly string[],
): PreferredPositionError | null {
  const { primary, secondary } = input;

  if (primary === null && secondary === null) return null;
  if (primary === null && secondary !== null) return 'SECONDARY_WITHOUT_PRIMARY';
  if (primary !== null && secondary !== null && primary === secondary) return 'DUPLICATE_POSITION';

  const allowed = new Set(allowedCodes);
  if (primary !== null && !allowed.has(primary)) return 'UNKNOWN_POSITION';
  if (secondary !== null && !allowed.has(secondary)) return 'UNKNOWN_POSITION';

  return null;
}

/** 사용자에게 보일 문구. 해요체(이 저장소 규약). */
export const PREFERRED_POSITION_MESSAGES: Record<PreferredPositionError, string> = {
  SECONDARY_WITHOUT_PRIMARY: '주 포지션을 먼저 골라 주세요.',
  DUPLICATE_POSITION: '주 포지션과 부 포지션은 서로 달라야 해요.',
  UNKNOWN_POSITION: '이 종목에 없는 포지션이에요.',
};

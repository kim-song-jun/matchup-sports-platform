/**
 * 두 번째 옐로와 그 뒤의 레드(경고 누적 퇴장)를 화면에서 한 줄로 합친다 — 표시 계층 전용이다.
 *
 * 저장은 그대로 이벤트 둘이다. 콘솔이 두 번째 옐로를 기록하면 "레드도 기록할까요?"를 묻고(`isSecondYellowWithoutRed`),
 * 확인하면 레드를 **같은 선수·같은 피리어드·같은 시각**으로 따로 적는다. 레드는 옐로의 id 를 들고 있지 않아서 화면이
 * 짝을 찾아야 한다 — 그래서 아래 조건을 모두 만족할 때만 합치고, 하나라도 모자라면 합치지 않고 두 줄로 둔다
 * (합쳐 보이는 것보다 사실대로 두 줄로 보이는 쪽이 덜 위험하다).
 *
 * - 되돌려진 기록이 아니다.
 * - 같은 선수다. 선수를 알아볼 수 없으면(이름·등번호까지 가려진 기록) 합치지 않는다.
 * - 같은 팀·같은 피리어드·같은 시각이다. 피리어드나 시각을 모르는 기록(과거 복원 기록)은 합치지 않는다.
 * - 그 옐로 앞에 같은 선수의 옐로가 한 장 이상 있다 — 첫 옐로와 같은 시각에 적힌 레드는 "경고 누적"이 아니다.
 *   앞의 옐로는 다른 피리어드(전반)에 있어도 된다.
 *
 * 합친 결과는 "레드 이벤트 → 그 레드가 흡수한 옐로 이벤트" 지도와 "줄에서 빼야 하는 옐로 집합"이다. 호출부는 목록에서
 * 흡수된 옐로를 빼고, 짝이 있는 레드 줄만 합친 표시로 그린다. 목록 순서·구간 나누기는 건드리지 않는다.
 *
 * 개인 기록 집계·징계 계산은 이벤트를 그대로 읽으므로 이 파일의 영향을 받지 않는다.
 */

/** 합친 줄의 이름 — 콘솔 목록의 글자와 공개 화면의 스크린리더 라벨이 같은 말을 쓴다. */
export const SECOND_YELLOW_RED_LABEL = '경고 누적 퇴장';

export interface CardFacts {
  readonly color: 'YELLOW' | 'RED' | null;
  /** 같은 선수인지 가르는 키(`cardPlayerKey`). 알아볼 수 없으면 null. */
  readonly playerKey: string | null;
  /** 같은 팀인지 가르는 키. 홈/원정이나 side id 처럼 목록 안에서 팀을 구분하는 값이면 된다. */
  readonly sideKey: string | null;
  readonly period: number | null;
  readonly clockMs: number | null;
  /** 되돌려진 기록이면 true — 합치지 않는다. */
  readonly cancelled?: boolean;
}

export interface SecondYellowRedPairs<T> {
  /** 레드 항목 → 그 레드와 합쳐 보일 두 번째 옐로 항목. */
  readonly yellowOfRed: ReadonlyMap<T, T>;
  /** 레드 줄에 흡수돼 목록에서 빼야 하는 옐로 항목. */
  readonly absorbedYellows: ReadonlySet<T>;
}

/**
 * 같은 선수인지 가르는 키. 선수 id 가 있으면 id 로, 없으면 이름과 등번호로 본다.
 * 둘 다 없으면(동의 없음으로 가려진 기록) null — 다른 선수를 같은 선수로 합치지 않기 위해서다.
 */
export function cardPlayerKey(player: {
  readonly participantId?: string | null;
  readonly participantName?: string | null;
  readonly jerseyNumber?: number | null;
}): string | null {
  if (typeof player.participantId === 'string' && player.participantId !== '') return `id:${player.participantId}`;
  if (typeof player.participantName === 'string' && player.participantName !== '') {
    return `name:${player.jerseyNumber ?? ''}:${player.participantName}`;
  }
  return null;
}

function isSameSpot(yellow: CardFacts, red: CardFacts): boolean {
  return (
    yellow.sideKey !== null &&
    yellow.sideKey === red.sideKey &&
    yellow.period !== null &&
    yellow.period === red.period &&
    yellow.clockMs !== null &&
    yellow.clockMs === red.clockMs
  );
}

/**
 * `items` 는 경기 흐름대로(시간순) 정렬된 목록이다. `read` 는 카드가 아닌 항목에 null 을 돌려준다.
 * 레드가 같은 시각 옐로보다 목록에서 먼저 나와도(같은 시각 정렬 순서가 뒤집혀도) 짝을 찾는다.
 */
export function pairSecondYellowRed<T>(
  items: readonly T[],
  read: (item: T) => CardFacts | null,
): SecondYellowRedPairs<T> {
  const yellowOfRed = new Map<T, T>();
  const absorbedYellows = new Set<T>();

  const yellowsByPlayer = new Map<string, Array<{ item: T; facts: CardFacts }>>();
  for (const item of items) {
    const facts = read(item);
    if (facts === null || facts.cancelled === true || facts.color !== 'YELLOW' || facts.playerKey === null) continue;
    const list = yellowsByPlayer.get(facts.playerKey);
    if (list === undefined) yellowsByPlayer.set(facts.playerKey, [{ item, facts }]);
    else list.push({ item, facts });
  }
  if (yellowsByPlayer.size === 0) return { yellowOfRed, absorbedYellows };

  for (const item of items) {
    const facts = read(item);
    if (facts === null || facts.cancelled === true || facts.color !== 'RED' || facts.playerKey === null) continue;
    const yellows = yellowsByPlayer.get(facts.playerKey);
    if (yellows === undefined) continue;
    // 두 번째 이상의 옐로만 후보다 — 인덱스 0 은 그 선수의 첫 옐로라 "경고 누적"의 근거가 못 된다.
    for (let index = yellows.length - 1; index >= 1; index -= 1) {
      const candidate = yellows[index];
      if (absorbedYellows.has(candidate.item) || !isSameSpot(candidate.facts, facts)) continue;
      yellowOfRed.set(item, candidate.item);
      absorbedYellows.add(candidate.item);
      break;
    }
  }
  return { yellowOfRed, absorbedYellows };
}

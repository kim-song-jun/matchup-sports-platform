/**
 * 경고 누적·퇴장에 따른 출전정지 판정 — 순수 함수.
 *
 * 1차 대회(2026-08-15~16) 회고: "옐로카드 누적, 레드카드 퇴장등 필요해보임".
 * 지금까지 카드는 **경기 단위로만** `{yellow, red}` 로 집계됐고, 라인업 제출은
 * 그 선수가 직전 경기에서 퇴장당했는지를 **전혀 검사하지 않았다** — 레드카드를
 * 받은 선수가 다음 경기에 그대로 뛸 수 있었다. 불편이 아니라 대회 결과의 정당성
 * 문제다.
 *
 * **DB 접근을 이 파일에 두지 않는 이유**: 이 저장소의 v1_api 로컬 테스트는 공유
 * Prisma 클라이언트가 stale 해서 DB를 건드리는 스펙이 아예 실행되지 않는 구간이
 * 있다(`extractEndPenalties`·`parseFairPlayCards` 가 순수 함수로 분리된 것과 같은
 * 이유). 판정 규칙 자체는 여기서 DB 없이 전수 검증한다.
 */

/** 한 경기에서 그 선수가 받은 카드. `V1GameResultParticipant.cards` 의 실제 저장 모양이다. */
export interface GameCards {
  readonly yellow: number;
  readonly red: number;
}

/**
 * 대회 안에서 한 선수가 치른 경기 하나의 카드 기록.
 *
 * `order` 는 대회 일정 순서(킥오프 시각 오름차순)다. 정지는 "다음 경기"에 걸리므로
 * 순서를 모르면 판정 자체가 불가능하다 — 호출자가 확정해 넘긴다.
 */
export interface PlayedGameCards {
  readonly gameOrder: number;
  readonly cards: GameCards;
}

/**
 * 대회별 정지 규정. **둘 다 null 이면 이 대회는 정지 규정을 쓰지 않는다.**
 *
 * 기본값을 두지 않는 것이 이 기능의 안전장치다 — 값이 있으면 배포 즉시 이미 끝난
 * 대회들에 소급 적용돼 다수 선수가 갑자기 출전정지로 뜬다(2026-08-23 사용자 결정
 * Q4-A: 대회 생성 시 관리자가 직접 설정).
 */
export interface SuspensionRules {
  /** 옐로 몇 장 누적마다 1경기 정지. null = 경고 누적 규정 미적용. */
  readonly yellowAccumulationLimit: number | null;
  /** 레드카드 1장당 정지 경기 수. null = 퇴장 정지 미적용. */
  readonly redCardSuspensionMatches: number | null;
}

export interface SuspensionVerdict {
  /** 지금(=`upcomingGameOrder` 경기) 출전이 막히는가. */
  readonly suspended: boolean;
  /** 누적 옐로 총합(정지 소진분 차감 전 원본). */
  readonly yellowTotal: number;
  /** 누적 레드 총합. */
  readonly redTotal: number;
  /** 남은 정지 경기 수(이번 경기 포함). suspended=false 면 0. */
  readonly remainingMatches: number;
  /** 사용자에게 보여줄 사유. suspended=false 면 null. */
  readonly reason: string | null;
}

const NO_SUSPENSION: SuspensionVerdict = {
  suspended: false,
  yellowTotal: 0,
  redTotal: 0,
  remainingMatches: 0,
  reason: null,
};

/**
 * 규정이 하나라도 켜져 있는가. 둘 다 null 이면 판정 자체를 건너뛴다 —
 * 호출자가 불필요한 조회를 하지 않게 하려고 밖으로 노출한다.
 */
export function suspensionRulesEnabled(rules: SuspensionRules): boolean {
  return isPositive(rules.yellowAccumulationLimit) || isPositive(rules.redCardSuspensionMatches);
}

function isPositive(value: number | null): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * 이 선수가 `upcomingGameOrder` 경기에 나설 수 있는지 판정한다.
 *
 * 규칙:
 * - **레드카드**: 받은 경기의 *다음* 경기부터 `redCardSuspensionMatches` 경기 정지.
 *   여러 장이면 정지가 누적된다(연달아 소화).
 * - **경고 누적**: 옐로 총합이 한도의 배수에 도달할 때마다 그 시점의 *다음* 경기
 *   1경기 정지. 예: 한도 2 → 2장째에 1경기, 4장째에 또 1경기.
 * - 이미 치른 경기는 정지를 **소진**한다. 그래서 정지된 경기를 지나면 자동으로 풀린다.
 *
 * **소진은 출전 기록이 아니라 일정 순서로 센다.** 결장한 경기는 로스터에 없어
 * `played` 에 아예 나타나지 않으므로, "그 사이 실제로 치른 경기"를 세는 방식이면
 * 정지가 영원히 안 풀린다. 그래서 정지 구간을 `gameOrder` 축 위의 구간
 * (`servedFrom` 미만은 못 뛴다)으로 누적하고, `upcomingGameOrder` 가 그 구간을
 * 지나면 자동으로 해제된다 — 결장 여부와 무관하게 일정이 흐르면 풀린다.
 * (Copilot 리뷰 지적: 이 주석이 구현에 없는 `playedOrMissedGameCount` 인자를
 * 설명하고 있었다 — 설계 초안의 잔재였다.)
 */
export function evaluateSuspension(input: {
  readonly rules: SuspensionRules;
  readonly played: readonly PlayedGameCards[];
  /** 출전 여부를 물어보는 경기의 일정 순서. */
  readonly upcomingGameOrder: number;
}): SuspensionVerdict {
  const { rules, played, upcomingGameOrder } = input;
  if (!suspensionRulesEnabled(rules)) return NO_SUSPENSION;

  // 아직 치르지 않은(=이 경기 이후의) 기록은 판정에 쓰지 않는다. 결과 정정으로
  // 미래 경기의 카드가 먼저 들어오는 경우가 실제로 있다.
  const priorGames = played
    .filter((game) => game.gameOrder < upcomingGameOrder)
    .slice()
    .sort((a, b) => a.gameOrder - b.gameOrder);

  const yellowTotal = priorGames.reduce((sum, game) => sum + normalize(game.cards.yellow), 0);
  const redTotal = priorGames.reduce((sum, game) => sum + normalize(game.cards.red), 0);

  // 정지가 "몇 번째 경기부터" 걸리는지를 경기 순서로 누적한다.
  // suspendedUntil = 이 순서 미만의 경기는 못 뛴다(= 이 순서부터 출전 가능).
  let servedFrom = 0;
  let runningYellow = 0;

  for (const game of priorGames) {
    const yellow = normalize(game.cards.yellow);
    const red = normalize(game.cards.red);
    // 정지는 이 경기 "다음"부터 시작한다. 이미 더 뒤로 밀려 있으면 그 지점부터 이어 붙인다.
    const startFrom = Math.max(servedFrom, game.gameOrder + 1);
    let added = 0;

    if (isPositive(rules.redCardSuspensionMatches) && red > 0) {
      added += red * rules.redCardSuspensionMatches;
    }
    if (isPositive(rules.yellowAccumulationLimit) && yellow > 0) {
      const limit = rules.yellowAccumulationLimit;
      const before = Math.floor(runningYellow / limit);
      runningYellow += yellow;
      const after = Math.floor(runningYellow / limit);
      added += after - before;
    } else {
      runningYellow += yellow;
    }

    if (added > 0) servedFrom = startFrom + added;
  }

  if (servedFrom <= upcomingGameOrder) {
    return { suspended: false, yellowTotal, redTotal, remainingMatches: 0, reason: null };
  }

  const remainingMatches = servedFrom - upcomingGameOrder;
  return {
    suspended: true,
    yellowTotal,
    redTotal,
    remainingMatches,
    reason: describeReason({ redTotal, yellowTotal, rules, remainingMatches }),
  };
}

function normalize(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function describeReason(input: {
  redTotal: number;
  yellowTotal: number;
  rules: SuspensionRules;
  remainingMatches: number;
}): string {
  const { redTotal, yellowTotal, rules, remainingMatches } = input;
  const causes: string[] = [];
  if (isPositive(rules.redCardSuspensionMatches) && redTotal > 0) {
    causes.push(`퇴장 ${redTotal}회`);
  }
  if (isPositive(rules.yellowAccumulationLimit) && yellowTotal >= rules.yellowAccumulationLimit) {
    causes.push(`경고 ${yellowTotal}장 누적`);
  }
  // 원인을 못 특정하는 경우는 규칙상 나올 수 없지만, 문구가 비는 것보다 낫다.
  const cause = causes.length > 0 ? causes.join(' · ') : '카드 누적';
  return `${cause}으로 ${remainingMatches}경기 출전정지예요.`;
}

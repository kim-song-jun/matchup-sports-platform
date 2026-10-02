/**
 * 도메인 중립 라운드로빈 페어링 (circle method).
 *
 * 대회(registrationId)와 팀 정기전 시리즈(teamId)가 공유하는 단일 소스다.
 * 이 파일 밖에서 라운드로빈 페어링을 다시 구현하지 않는다 —
 * 과거에 대회는 프론트 순수함수, 시리즈는 백엔드에 각각 따로 갖고 있었다.
 */

export interface RoundRobinPairing {
  /** 1-based. 모든 leg를 통틀어 연속 증가한다. */
  round: number;
  /** 1-based. 몇 번째 회전인지. */
  leg: number;
  homeId: string;
  awayId: string;
}

export interface RoundRobinOptions {
  /** 총 라운드 수를 직접 지정한다(부분 회전 허용). legs보다 우선한다. */
  rounds?: number;
  /** 회전 수. rounds = cycleRounds * legs 로 환산된다. */
  legs?: number;
  /** 홈 경기 수를 참가자 간에 균등 분배한다. 기본 true. */
  balanceHome?: boolean;
}

const BYE: unique symbol = Symbol('bye');
type Slot = string | typeof BYE;

export function generateRoundRobin(
  participantIds: readonly string[],
  options: RoundRobinOptions,
): RoundRobinPairing[] {
  if (participantIds.length < 2) return [];

  const padded: Slot[] = participantIds.length % 2 === 0
    ? [...participantIds]
    : [...participantIds, BYE];
  const cycleRounds = padded.length - 1;

  const totalRounds = options.rounds ?? cycleRounds * (options.legs ?? 1);
  if (totalRounds < 1) return [];

  const balanceHome = options.balanceHome ?? true;
  const homeCounts = new Map<string, number>(participantIds.map((id) => [id, 0]));
  const lastHomeByPair = new Map<string, string>();
  const pairings: RoundRobinPairing[] = [];

  for (let round = 1; round <= totalRounds; round++) {
    const cycleIndex = (round - 1) % cycleRounds;
    const leg = Math.floor((round - 1) / cycleRounds) + 1;
    const arrangement = cycleIndex === 0 ? padded : rotateCircle(padded, cycleIndex);

    for (const [left, right] of circlePairs(arrangement)) {
      if (left === BYE || right === BYE) continue;
      const [homeId, awayId] = balanceHome
        ? pickHome(left, right, homeCounts, lastHomeByPair)
        : [left, right];
      homeCounts.set(homeId, (homeCounts.get(homeId) ?? 0) + 1);
      lastHomeByPair.set(pairKey(left, right), homeId);
      pairings.push({ round, leg, homeId, awayId });
    }
  }
  return pairings;
}

/**
 * 홈 배정 계약(balanceHome=true):
 * - 같은 페어가 다시 만나면(2회전 이후) 직전 만남의 방향을 반드시 뒤집는다. 그래서
 *   더블 라운드로빈에서 모든 페어의 홈/어웨이가 교대하고, 팀별 홈 수 == 원정 수가
 *   홀수 팀(bye 포함)에서도 자동 성립한다.
 * - 첫 만남만 누적 홈 경기 수가 적은 쪽을 홈으로 주는 greedy 균형 배분이며,
 *   동수면 입력 순서를 유지해 결정적으로 만든다.
 *
 * 설계 스펙(docs/superpowers/specs/2026-08-17-tournament-league-format-design.md §5.1)의
 * "greedy 균형 규칙이 2회전에서 자연히 홈/어웨이를 뒤집는다"는 서술은 거짓이었다 —
 * 실측으로 4팀 2회전에서 6쌍 중 3쌍(b–c, d–b, c–d)이 두 번 다 같은 홈이었다.
 * 스펙 §2 목표3·§10 검증표가 요구하는 2회전 뒤집기는 이 명시적 뒤집기로만 보장된다.
 */
function pickHome(
  left: string,
  right: string,
  homeCounts: ReadonlyMap<string, number>,
  lastHomeByPair: ReadonlyMap<string, string>,
): [string, string] {
  const previousHome = lastHomeByPair.get(pairKey(left, right));
  if (previousHome !== undefined) {
    return previousHome === left ? [right, left] : [left, right];
  }
  return (homeCounts.get(left) ?? 0) <= (homeCounts.get(right) ?? 0)
    ? [left, right]
    : [right, left];
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

/** base[0]을 고정하고 나머지를 시계방향으로 steps만큼 회전한다(표준 circle method). */
function rotateCircle(base: readonly Slot[], steps: number): Slot[] {
  const [fixed, ...rest] = base;
  const offset = steps % rest.length;
  return [fixed, ...rest.slice(rest.length - offset), ...rest.slice(0, rest.length - offset)];
}

function circlePairs(arrangement: readonly Slot[]): Array<[Slot, Slot]> {
  const size = arrangement.length;
  const pairs: Array<[Slot, Slot]> = [];
  for (let i = 0; i < size / 2; i++) pairs.push([arrangement[i], arrangement[size - 1 - i]]);
  return pairs;
}

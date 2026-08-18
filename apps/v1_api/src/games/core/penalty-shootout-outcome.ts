import { UnprocessableEntityException } from '@nestjs/common';

/**
 * 승부차기가 **규칙상 끝났는지**를 서버가 직접 판정한다.
 *
 * 왜 서버에도 있어야 하나 — 이 판정은 원래 프런트에만 있었다
 * (`apps/v1_web/src/lib/penalty-shootout.ts`). 서버는 총점 두 개(`home`/`away`)만
 * 받으므로 "홈 1킥 1:0 / 원정 0킥"과 "각 5킥 1:0"을 **구분할 수 없었고**, 그래서
 * 서버가 막을 수 있는 건 무승부(`home === away`)뿐이었다. 즉 화면의 가드는
 * API를 직접 호출하면 그대로 우회됐다.
 *
 * 더 나쁜 건 **결판 규칙이 두 곳에 따로 살았다**는 것이다 — 프런트는 정책까지
 * 반영한 술어를, 서버는 `home !== away` 한 줄을 갖고 있어 언제든 갈릴 수 있었다.
 * 이제 킥 수(`takenHome`/`takenAway`)를 함께 받아 **서버가 권위**가 되고,
 * 프런트 술어는 버튼을 미리 잠그는 미리보기 역할이 된다.
 *
 * 레거시 degrade: 킥 수가 없는 요청(선축 도입 이전 클라이언트, 정정 승계 경로)은
 * 예전처럼 `home !== away`만 본다. 새 필드를 필수로 만들면 이미 저장된 리비전을
 * 정정하는 경로가 통째로 막힌다 — 기존 데이터를 소급해서 깨뜨리지 않는다.
 */
export type PenaltyShootoutKickCounts = {
  readonly home: number;
  readonly away: number;
  readonly takenHome: number;
  readonly takenAway: number;
  readonly firstKickSideKey?: 'HOME' | 'AWAY';
};

export type PenaltyShootoutPolicy = { readonly earlyStop: boolean };

/**
 * 프런트 `penaltyShootoutOutcome`의 서버 미러. **판정 문장이 갈리면 안 되므로**
 * 분기 구조와 주석의 근거를 의도적으로 같게 유지한다.
 *
 * 선축을 모르면(레거시) 선축/후축을 가를 수 없다. 그때는 홈을 선축으로 가정하지
 * 않고 — 그건 이 기능이 고친 바로 그 하드코딩이다 — 킥 수가 같은지만 보는
 * 보수적 판정으로 물러난다.
 */
export function penaltyShootoutDecided(
  counts: PenaltyShootoutKickCounts,
  policy: PenaltyShootoutPolicy,
): boolean {
  const { home, away, takenHome, takenAway, firstKickSideKey } = counts;
  // 한 팀이 한 번도 안 찼으면 어떤 정책에서도 확정하지 않는다. 아래 5킥 산술이
  // 이미 막는 것 아닌가? — 아니다. 킥 수가 크게 어긋난 국면(선축 6킥 6점 /
  // 후축 0킥)에서는 잔여 5로 `6 > 0 + 5`가 성립해 DECIDED가 나온다.
  if (takenHome === 0 || takenAway === 0) return false;
  if (home === away) return false;

  if (firstKickSideKey === undefined) {
    // 선축을 모르면 "누가 몇 개 남았는지"를 계산할 수 없다 — 보수적으로 같은
    // 횟수를 찬 경우에만 결판으로 본다(A1과 같은 문장).
    return takenHome === takenAway;
  }
  const firstIsHome = firstKickSideKey === 'HOME';
  const takenFirst = firstIsHome ? takenHome : takenAway;
  const takenSecond = firstIsHome ? takenAway : takenHome;
  const scoreFirst = firstIsHome ? home : away;
  const scoreSecond = firstIsHome ? away : home;

  // A1 = 조기 종료 없음 — 5킥을 다 채운 뒤에만 판정한다. 프런트 술어의 같은 분기와
  // 문장을 맞춘다(2026-08-18 정정: 예전엔 각 1킥 1:0에 결판이 나 어느 규정에도 없는
  // 동작이었다).
  if (!policy.earlyStop) {
    if (takenFirst < 5 || takenSecond < 5) return false;
    return takenFirst === takenSecond;
  }

  if (takenFirst < 5 || takenSecond < 5) {
    const remainingFirst = Math.max(0, 5 - takenFirst);
    const remainingSecond = Math.max(0, 5 - takenSecond);
    if (scoreFirst > scoreSecond + remainingSecond) return true;
    if (scoreSecond > scoreFirst + remainingFirst) return true;
    return false;
  }
  return takenFirst === takenSecond;
}

/**
 * 저장 직전 게이트. 킥 수가 실려 오지 않았으면(레거시) 아무것도 하지 않는다.
 *
 * `operatorOverride`는 **면제가 아니라 기록**이다. 현장에서는 규칙보다 먼저
 * 승부차기가 끝난다(기권·선수 없음·심판 중단). 그때 운영자가 확인 모달을 거쳐
 * 명시적으로 닫았다는 사실을 payload에 실어 보내고, 이 값은 `score.penalties`에
 * 그대로 저장돼 **리비전에 영구히 남는다** — 나중에 "이 결과는 왜 규칙과 다른가"를
 * 물었을 때 답할 수 있는 유일한 근거다. 플래그 없이 통과시키면 우회와 정상 종료가
 * 기록상 구분되지 않는다.
 */
export function assertPenaltyShootoutConcluded(
  penalties: {
    home: number;
    away: number;
    takenHome?: number;
    takenAway?: number;
    operatorOverride?: boolean;
    firstKickSideKey?: 'HOME' | 'AWAY';
  },
  policy: PenaltyShootoutPolicy,
): void {
  const { takenHome, takenAway } = penalties;
  if (takenHome === undefined || takenAway === undefined) return;
  if (penalties.operatorOverride === true) return;
  const decided = penaltyShootoutDecided(
    {
      home: penalties.home,
      away: penalties.away,
      takenHome,
      takenAway,
      firstKickSideKey: penalties.firstKickSideKey,
    },
    policy,
  );
  if (decided) return;
  throw new UnprocessableEntityException({
    code: 'TOURNAMENT_PENALTY_UNDECIDED',
    message:
      'The penalty shootout has not been decided under this tournament policy; ' +
      'set penalties.operatorOverride to record an explicit operator decision',
  });
}

/**
 * 승부차기 킥 순서/집계를 계산하는 순수 함수 모음.
 *
 * 저장 방식 결정(옵션 B, Task: 운영 콘솔 확인 모달 + 승부차기): 백엔드
 * `V1GameEventType`에는 개별 킥을 표현할 이벤트 타입이 없고(`GOAL`을 재사용하면
 * `game-invariants.ts`의 "GOAL 이벤트 합 === 정규 스코어" 불변식이 깨진다),
 * 새 이벤트 타입을 추가하려면 스키마 마이그레이션이 필요하다. 반면 `end`
 * 커맨드는 이미 `payload.penalties: { home, away }`를 받아 CAS·감사·멱등을
 * 그대로 태우는 경로가 완성돼 있다(`apps/v1_api/src/games/games.service.ts`의
 * `extractEndPenalties`/`applyPenalties`, `.changeset/v1-tournament-result-ops.md`
 * "승부차기" 항목 — 이미 배포된 백엔드 기능). 그래서 이 화면은 킥별 기록을
 * **로컬 상태로만** 들고 있다가(`PenaltyKick[]`), "승부차기 종료"를 누르는
 * 순간 최종 점수만 뽑아 `end` 커맨드에 실어 보낸다 — 마이그레이션 없이 이미
 * 검증된 계약을 그대로 탄다는 뜻이다.
 *
 * 선축(누가 먼저 차는가)은 **점수 두 개로는 복원할 수 없는 동전 던지기 결과**라
 * 별도로 저장한다: `end` 커맨드의 `payload.penalties` 안에 `firstKickSideKey`
 * (`'HOME' | 'AWAY'`)를 함께 실어 보내고, 서버가 `PenaltyScoreDto`에 선언된 허용
 * 키로 받아 리비전 `score.penalties`에 그대로 남긴다(`extractEndPenalties` ·
 * `readStoredPenalties`). 즉 킥 **순서**는 남지 않아도 "누가 먼저 찼는지"는 남는다.
 *
 * 트레이드오프(솔직하게): 누가 몇 번째 킥을 성공/실패했는지는 서버에
 * **남지 않는다**. 새로고침하거나 운영자가 패널을 취소하면 진행 중이던 킥
 * 기록은 사라지고, 최종적으로 서버에 남는 것은 `score.penalties`의 숫자 두 개와
 * 선축 하나뿐이다. 킥별 기록을 영구 보존하려면 새 이벤트 타입(스키마
 * 마이그레이션)이 필요하고, 이는 사용자 승인 없이 진행할 수 없는 결정이라
 * 이번 작업 범위에서 제외했다.
 *
 * 그래서 **"양 팀이 같은 횟수를 찼는가"는 서버가 알 수 없다** — 서버의
 * `extractEndPenalties`는 총점 두 개만 보므로 `home === away`(무승부 승부차기)만
 * 거부할 수 있고, "원정이 아직 한 번도 안 찼는데 1:0으로 종료"는 막지 못한다.
 * 아래 `penaltyShootoutOutcome`은 그 판정을 킥 목록이 있는 **프런트에서만** 할 수
 * 있는 단독 가드다. 서버에서도 막으려면 킥 단위 이벤트 모델이 필요하다.
 */

export type PenaltyKickResult = 'SCORED' | 'MISSED';

export interface PenaltyKick {
  readonly sideId: string;
  readonly result: PenaltyKickResult;
}

/**
 * 다음 키커의 사이드를 정한다 — 실제 승부차기 규칙(양팀이 한 번씩 번갈아
 * 찬다)을 그대로 반영한다. `sides`가 비어 있으면(방어적 케이스) `null`이다.
 *
 * 첫 킥 주체는 **선축**(`firstKickSideId`, 동전 던지기 결과)이다. 예전에는
 * `sides[0]`이 먼저 찼는데, 그 배열은 서버 `getGame`의 `orderBy: { sideKey: 'asc' }`
 * + enum 순서(`HOME, AWAY`) 때문에 **항상 HOME이 [0]**이라 사실상 "홈이 무조건
 * 선축"이라는 하드코딩이었다(사용자 보고 결함).
 *
 * 아직 선축을 안 정했으면(`null`) 찰 주체도 없다 — 패널의 성공/실패 버튼이
 * 잠기는 근거가 이 `null`이다. "누가 먼저 차는지 모르는 채로 킥을 기록한다"는
 * 상태를 애초에 만들지 않는다.
 */
export function nextPenaltyKicker(
  kicks: readonly PenaltyKick[],
  sides: readonly { id: string }[],
  firstKickSideId: string | null,
): string | null {
  if (sides.length === 0) return null;
  if (kicks.length === 0) return firstKickSideId;
  const last = kicks[kicks.length - 1];
  const lastIndex = sides.findIndex((side) => side.id === last.sideId);
  const nextIndex = lastIndex === -1 ? 0 : (lastIndex + 1) % sides.length;
  return sides[nextIndex].id;
}

/** 사이드별 성공(SCORED) 킥 수 — 승부차기 최종 점수 그 자체다. */
export function penaltyScoreBySideId(kicks: readonly PenaltyKick[]): Map<string, number> {
  const score = new Map<string, number>();
  for (const kick of kicks) {
    if (kick.result !== 'SCORED') continue;
    score.set(kick.sideId, (score.get(kick.sideId) ?? 0) + 1);
  }
  return score;
}

/** 승부차기가 끝났는가. 끝난 상태에서만 "승부차기 종료"를 누를 수 있다. */
export type PenaltyShootoutOutcome = 'IN_PROGRESS' | 'DECIDED';

/** 승부차기 종료 판정 정책 — 대회 설정(`GameDetail.penaltyShootoutPolicy`)에서 온다. */
export interface PenaltyShootoutPolicy {
  /**
   * **처음 5킥을 다 차기 전에** 끝내도 되는가.
   *
   * `true`(FIFA 정규, 기본) — 라운드 중간이라도 남은 킥을 다 넣어서 못 따라잡는
   * 순간 종료.
   * `false` — 라운드가 끝나야(= 양 팀이 **같은 횟수**를 찬 뒤) 결판을 볼 수 있다.
   * 한 팀이 더 찬 상태에서는 수학적으로 이미 끝났어도 종료하지 않는다.
   *
   * 두 정책이 갈리는 국면은 "킥 수가 다른데 이미 수학적으로 확정된" 구간 하나뿐이다.
   * 같은 횟수를 찬 뒤 점수가 갈렸다면 어느 정책이든 종료한다 — 그래서 `false`가
   * 5킥 구간 전체를 잠그지는 않는다(잠그면 각 3킥 3:0처럼 현장에서 이미 끝난
   * 승부차기를 영영 종료할 수 없다).
   */
  readonly earlyStop: boolean;
}

/**
 * 승부차기가 끝났는지 판정한다.
 *
 * 이전 술어(`isPenaltyShootoutDecisive(home, away) { return home !== away; }`)는
 * **점수 두 개만** 보고 킥 수를 몰랐다. 그래서 홈이 첫 킥을 성공하는 순간 1:0이
 * "결판"으로 읽혀 `disabled={!decisive}`가 풀렸고, **원정이 한 번도 차기 전에**
 * 승부차기를 종료할 수 있었다(사용자 보고 결함). 그 술어가 지키던 의도 — 무승부
 * 승부차기는 서버 `extractEndPenalties`가 422로 거부하니 프런트도 같은 기준으로
 * 막는다 — 는 "같은 킥 수 + 점수 동일 → 미결"로 그대로 승계된다.
 *
 * 서버는 이 판정을 할 수 없다(총점 두 개만 저장한다 — 파일 상단 doc 참고). 그래서
 * 이 함수가 유일한 가드다.
 */
export function penaltyShootoutOutcome(
  kicks: readonly PenaltyKick[],
  sides: readonly { id: string }[],
  firstKickSideId: string | null,
  policy: PenaltyShootoutPolicy,
): PenaltyShootoutOutcome {
  if (sides.length !== 2 || firstKickSideId === null) return 'IN_PROGRESS';
  const first = sides.find((side) => side.id === firstKickSideId);
  const second = sides.find((side) => side.id !== firstKickSideId);
  if (first === undefined || second === undefined) return 'IN_PROGRESS';

  const takenFirst = kicks.filter((kick) => kick.sideId === first.id).length;
  const takenSecond = kicks.filter((kick) => kick.sideId === second.id).length;
  const scoreFirst = kicks.filter((kick) => kick.sideId === first.id && kick.result === 'SCORED').length;
  const scoreSecond = kicks.filter((kick) => kick.sideId === second.id && kick.result === 'SCORED').length;

  // 두 정책이 **공유하는** 불변식이라 분기보다 먼저, 한 번만 둔다: 한쪽이라도 아직
  // 차지 않았으면 어떤 정책에서도 확정하지 않는다.
  //
  // 아래 5킥 산술이 이미 막아 주는 것 아닌가? — **아니다.** 킥 수가 크게 어긋난 국면
  // (선축 6킥 6점 / 후축 0킥)에서는 `remainingSecond`가 5라 `6 > 0 + 5`가 성립해
  // 후축이 한 번도 차지 않았는데 DECIDED가 나온다. 번갈아 차는 UI에서는 두 팀의 킥 수
  // 차이가 1을 넘지 않지만, 이 함수는 순수 술어라 호출부의 그 성질에 기대지 않는다.
  // (사용자가 보고한 "홈 1킥 1:0에 종료 가능"은 이 줄이 아니라 아래 산술이 막는다 —
  //  1 > 0 + 5가 거짓이라 IN_PROGRESS다.)
  if (takenFirst === 0 || takenSecond === 0) return 'IN_PROGRESS';

  // A1(`earlyStop: false`) — **라운드가 끝나야** 결판을 본다. 5킥 구간이든 그 뒤든 문장이
  // 같아 분기 앞에 한 번만 둔다. 즉 이 정책은 "한 팀이 더 찬 상태에서는 절대 끝내지 않는다".
  //
  // 여기서 5킥 구간을 통째로 IN_PROGRESS로 만들면 안 된다: 각 3킥 3:0(후축이 남은 2킥을 다
  // 넣어도 2점)처럼 현장에서 이미 끝난 승부차기를 종료할 수 없어, 운영자가 차지도 않은 킥을
  // 지어내야만 경기를 닫을 수 있는 막다른 상태가 된다.
  if (!policy.earlyStop) {
    return takenFirst === takenSecond && scoreFirst !== scoreSecond ? 'DECIDED' : 'IN_PROGRESS';
  }

  // 처음 5킥 구간(A2 · FIFA 정규). 남은 킥을 다 넣어도 못 따라잡으면 라운드 중간이라도 끝난다
  // — 두 정책의 답이 갈리는 국면이 정확히 여기다(예: 선축 4킥 4점 / 후축 3킥 0점 — 수학적으로
  // 이미 끝났지만 킥 수가 달라 A1은 계속한다).
  if (takenFirst < 5 || takenSecond < 5) {
    const remainingFirst = Math.max(0, 5 - takenFirst);
    const remainingSecond = Math.max(0, 5 - takenSecond);
    if (scoreFirst > scoreSecond + remainingSecond) return 'DECIDED';
    if (scoreSecond > scoreFirst + remainingFirst) return 'DECIDED';
    return 'IN_PROGRESS';
  }

  // 5킥을 다 찬 뒤(서든데스)는 두 정책이 같다 — 같은 횟수를 찬 뒤 점수가 갈려야 끝난다.
  // 여기에 "같은 킥 수" 조건이 없으면 후축이 답할 기회를 얻기 전에 종료할 수 있고,
  // "점수가 다름" 조건이 없으면 무승부 승부차기가 나가 서버가 422로 되돌린다.
  return takenFirst === takenSecond && scoreFirst !== scoreSecond ? 'DECIDED' : 'IN_PROGRESS';
}

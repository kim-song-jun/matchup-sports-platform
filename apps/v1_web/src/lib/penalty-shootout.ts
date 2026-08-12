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
 * 트레이드오프(솔직하게): 누가 몇 번째 킥을 성공/실패했는지는 서버에
 * **남지 않는다**. 새로고침하거나 운영자가 패널을 취소하면 진행 중이던 킥
 * 기록은 사라지고, 최종적으로 서버에 남는 것은 `score.penalties.home/away`
 * 두 숫자뿐이다. 킥별 기록을 영구 보존하려면 새 이벤트 타입(스키마
 * 마이그레이션)이 필요하고, 이는 사용자 승인 없이 진행할 수 없는 결정이라
 * 이번 작업 범위에서 제외했다.
 */

export type PenaltyKickResult = 'SCORED' | 'MISSED';

export interface PenaltyKick {
  readonly sideId: string;
  readonly result: PenaltyKickResult;
}

/**
 * 다음 키커의 사이드를 정한다 — 실제 승부차기 규칙(양팀이 한 번씩 번갈아
 * 찬다)을 그대로 반영한다. 아직 한 번도 안 찼으면 `sides[0]`(헤더의
 * "A vs B" 표시 순서와 동일)이 먼저 찬다. `sides`가 비어 있으면(방어적
 * 케이스) `null`을 돌려준다.
 */
export function nextPenaltyKicker(
  kicks: readonly PenaltyKick[],
  sides: readonly { id: string }[],
): string | null {
  if (sides.length === 0) return null;
  if (kicks.length === 0) return sides[0].id;
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

/**
 * 백엔드 `extractEndPenalties`(games.service.ts)와 정확히 같은 결정성 기준 —
 * 무승부인 승부차기는 의미가 없어 서버가 `TOURNAMENT_PENALTY_INVALID`로
 * 거부한다. 여기서 미리 같은 기준으로 걸러 "승부차기 종료" 버튼을 비활성화
 * 해두면, 무의미한 서버 왕복(그리고 그 실패를 설명해야 하는 에러 배너) 없이
 * 운영자가 바로 알 수 있다.
 */
export function isPenaltyShootoutDecisive(home: number, away: number): boolean {
  return home !== away;
}

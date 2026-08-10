import type { GameEventRecord } from '@/types/game-operations';

/**
 * B3/D-9 — 토스트 "어시스트 추가" 액션과 이벤트 목록의 "+ 어시스트" 버튼이
 * 똑같이 쓰는 매칭 로직. 대회 콘솔(operate-console.tsx)과 팀매치 콘솔
 * (team-match-operate-console.tsx) 양쪽이 이 함수를 그대로 import한다 —
 * 각자 다른 접근을 따로 구현하면 두 화면의 동작이 갈라진다.
 *
 * GOAL 커밋은 오프라인 큐를 거쳐 비동기로 liveEvents에 반영되므로, 토스트를
 * 누른 시점엔 방금 낸 그 골이 아직 목록에 없을 수 있다 — 그래도 같은 선수가
 * 같은 clockMs(서버가 프리즈해 기록)에 두 번 골을 넣을 수는 없으므로, 이
 * 조합으로 유일하게 식별해 liveEvents를 뒤에서부터(reverse) 찾는다.
 */
export function findRecentGoalEvent(
  liveEvents: readonly GameEventRecord[],
  captured: { readonly participantId: string; readonly clockMs: number },
): GameEventRecord | undefined {
  return [...liveEvents]
    .reverse()
    .find(
      (event) =>
        event.type === 'GOAL' &&
        event.participantId === captured.participantId &&
        event.clockMs === captured.clockMs,
    );
}

import type { GameEventRecord } from '@/types/game-operations';

/**
 * D-5 — 팀 누적 파울은 별도 카운터 컬럼 없이 (gameId, sideId, period) 활성
 * FOUL 이벤트 개수에서 파생한다. void/reverse된 FOUL은 제외한다 — reverseEvent가
 * 만드는 CORRECTION 행의 reversesEventId가 원본 FOUL의 id를 가리키므로, 그
 * id 집합을 먼저 모아 제외한다.
 */
export function deriveFoulCounts(events: readonly GameEventRecord[], period: number): Record<string, number> {
  const reversedIds = new Set(
    events.filter((event) => event.reversesEventId !== null).map((event) => event.reversesEventId as string),
  );
  const counts: Record<string, number> = {};
  for (const event of events) {
    if (event.type !== 'FOUL' || event.period !== period || event.sideId === null) continue;
    if (reversedIds.has(event.id)) continue;
    counts[event.sideId] = (counts[event.sideId] ?? 0) + 1;
  }
  return counts;
}

export const TEAM_FOUL_WARNING_THRESHOLD = 5;

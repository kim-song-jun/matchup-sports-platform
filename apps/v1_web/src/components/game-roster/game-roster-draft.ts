import type { V1GameRosterBatchChange, V1GameRosterView } from '@/hooks/use-v1-game-roster';
import type { GameRosterAdjustmentReason } from '@/lib/v1-status-labels';

/** 저장 전 화면에서 고른 변경 — 선수당 하나. */
export type GameRosterDraftEntry = { op: 'EXCLUDE'; reason: GameRosterAdjustmentReason | null } | { op: 'REVOKE' };
export type GameRosterDraft = Readonly<Record<string, GameRosterDraftEntry>>;

/**
 * 초안 → 일괄 저장 요청. 지금 명단과 안 맞는 항목은 버린다 — 다른 운영진이 먼저 바꿨거나 참가 명단에서
 * 빠진 선수를 그대로 보내면 서버가 422 로 저장 전체를 거절한다.
 */
export function draftToChanges(draft: GameRosterDraft, roster: V1GameRosterView): V1GameRosterBatchChange[] {
  const participating = new Set(roster.participants.map((row) => row.userId));
  const excluded = new Set(roster.excluded.map((row) => row.userId));
  return Object.entries(draft).flatMap(([userId, entry]): V1GameRosterBatchChange[] => {
    if (entry.op === 'EXCLUDE') {
      if (!participating.has(userId)) return [];
      return [
        entry.reason === null
          ? { gameId: roster.gameId, userId, op: 'EXCLUDE' }
          : { gameId: roster.gameId, userId, op: 'EXCLUDE', reason: entry.reason },
      ];
    }
    return excluded.has(userId) ? [{ gameId: roster.gameId, userId, op: 'REVOKE' }] : [];
  });
}

/** "참가 명단대로" — 지금 빠져 있는 사람 전부 되돌리기. 결장·출전정지는 조정이 아니라 대상이 아니다. */
export function resetToRegistrationChanges(roster: V1GameRosterView): V1GameRosterBatchChange[] {
  return roster.excluded.map((row) => ({ gameId: roster.gameId, userId: row.userId, op: 'REVOKE' as const }));
}

import { V1ApiError } from '@/lib/api-client';
import { extractErrorCode } from '@/lib/error-message';
import { gameRosterErrorMessage, isStaleGameRosterWrite } from '@/lib/game-roster-errors';
import type {
  V1GameRosterBatchChange,
  V1TeamRosterCell,
  V1TeamRosterCellStatus,
  V1TeamRosterMatrix,
  V1TeamRosterMatrixGame,
} from '@/hooks/use-v1-game-roster';

// 선수 × 경기 표(팀 B 경기 명단 관리 · 어드민 참가 신청 펼침)의 저장 전 초안.

/** 저장 전 칸 변경 — 키는 `gameId:userId`. */
export type TeamRosterDraft = Readonly<Record<string, 'EXCLUDE' | 'REVOKE'>>;

export function cellKey(gameId: string, userId: string): string {
  return `${gameId}:${userId}`;
}

/** 칩으로 켜고 끌 수 있는 칸 — 시작 전 경기의 출전·빠짐만. 결장·출전정지·명단 밖은 계산이 정한다. */
export function isToggleable(game: V1TeamRosterMatrixGame, cell: V1TeamRosterCell): boolean {
  return game.editable && (cell.status === 'PARTICIPATING' || cell.status === 'EXCLUDED');
}

/** 초안을 반영한 이 칸의 상태. */
export function effectiveStatus(cell: V1TeamRosterCell, draft: TeamRosterDraft, userId: string): V1TeamRosterCellStatus {
  const entry = draft[cellKey(cell.gameId, userId)];
  if (entry === 'EXCLUDE' && cell.status === 'PARTICIPATING') return 'EXCLUDED';
  if (entry === 'REVOKE' && cell.status === 'EXCLUDED') return 'PARTICIPATING';
  return cell.status;
}

/** 칩 한 번 누르기 — 저장된 상태와 반대면 초안에 넣고, 같아지면 초안에서 뺀다. */
export function toggleCell(draft: TeamRosterDraft, cell: V1TeamRosterCell, userId: string): TeamRosterDraft {
  const key = cellKey(cell.gameId, userId);
  const next = { ...draft };
  if (key in next) delete next[key];
  else if (cell.status === 'PARTICIPATING') next[key] = 'EXCLUDE';
  else if (cell.status === 'EXCLUDED') next[key] = 'REVOKE';
  return next;
}

/**
 * 초안 → 일괄 저장 요청. 지금 표와 안 맞는 항목(다른 운영진이 먼저 바꿨거나, 경기가 시작됐거나,
 * 참가 명단에서 빠진 선수)은 버린다 — 그대로 보내면 서버가 저장 전체를 거절한다.
 */
export function draftToBatchChanges(
  draft: TeamRosterDraft,
  matrix: Pick<V1TeamRosterMatrix, 'games' | 'players'>,
): V1GameRosterBatchChange[] {
  return matrix.players.flatMap((player) =>
    matrix.games.flatMap((game, index): V1GameRosterBatchChange[] => {
      const cell = player.cells[index];
      const entry = draft[cellKey(game.gameId, player.userId)];
      if (cell === undefined || entry === undefined || !isToggleable(game, cell)) return [];
      if (entry === 'EXCLUDE' && cell.status === 'PARTICIPATING') {
        return [{ gameId: game.gameId, userId: player.userId, op: 'EXCLUDE' }];
      }
      if (entry === 'REVOKE' && cell.status === 'EXCLUDED') {
        return [{ gameId: game.gameId, userId: player.userId, op: 'REVOKE' }];
      }
      return [];
    }),
  );
}

/** 지금 표로 보낼 수 있는 초안만. 표가 새로 오면(경기 시작·권한·명단 변경) "저장 전" 표시도 보낼 것만 남는다. */
export function liveDraft(draft: TeamRosterDraft, matrix: Pick<V1TeamRosterMatrix, 'games' | 'players'>): TeamRosterDraft {
  return Object.fromEntries(draftToBatchChanges(draft, matrix).map((change) => [cellKey(change.gameId, change.userId), change.op]));
}

/** 거절된 경기의 초안만 버린다 — 나머지는 다시 저장할 수 있게 남긴다. */
export function dropGamesFromDraft(draft: TeamRosterDraft, gameIds: readonly string[]): TeamRosterDraft {
  const blocked = new Set(gameIds);
  return Object.fromEntries(Object.entries(draft).filter(([key]) => !blocked.has(key.split(':')[0] ?? '')));
}

/** 일괄 저장이 거절한 경기 id(`details.gameIds` — 409 시작됨, 404 이 팀 경기 아님). */
export function rejectedGameIds(error: unknown): string[] {
  if (!(error instanceof V1ApiError)) return [];
  const details = error.details as { gameIds?: unknown } | null | undefined;
  return Array.isArray(details?.gameIds) ? details.gameIds.filter((id): id is string => typeof id === 'string') : [];
}

const REJECTED_GAME_MESSAGES: Record<string, string> = {
  LINEUP_DEADLINE_PASSED: '그사이 시작된 경기가 있어 저장하지 못했어요. 그 경기 변경은 뺐으니 나머지를 다시 저장해 주세요.',
  GAME_SIDE_NOT_FOUND: '대진이 바뀌어 이 팀이 뛰지 않게 된 경기가 있어요. 그 경기 변경은 뺐으니 나머지를 다시 저장해 주세요.',
};

/**
 * 표(팀 경기 명단·어드민 펼침) 일괄 저장이 실패한 뒤 할 일. 경기 단위로 거절됐으면 그 경기 초안만 버리고,
 * 화면이 낡은 거절이면 표를 다시 받는다 — 안 그러면 같은 초안으로 같은 에러를 되풀이한다.
 */
export function batchFailureRecovery(error: unknown): {
  nextDraft: (current: TeamRosterDraft) => TeamRosterDraft;
  refetch: boolean;
  message: string;
} {
  const code = extractErrorCode(error);
  const rejectedMessage = code === null ? undefined : REJECTED_GAME_MESSAGES[code];
  if (rejectedMessage !== undefined) {
    const ids = rejectedGameIds(error);
    return {
      nextDraft: (current) => (ids.length > 0 ? dropGamesFromDraft(current, ids) : {}),
      refetch: true,
      message: rejectedMessage,
    };
  }
  return {
    nextDraft: (current) => current,
    refetch: isStaleGameRosterWrite(error),
    message: gameRosterErrorMessage(error, '명단을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'),
  };
}

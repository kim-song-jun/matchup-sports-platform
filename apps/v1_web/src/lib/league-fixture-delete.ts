/**
 * Delete/cancel rules for a league fixture, shared by the list menu and the board panel so both
 * surfaces gate and word the actions identically. Mirrors `LeagueMatchAdminService.deleteFixture`:
 * a not-yet-cancelled fixture whose game started or has a result must be cancelled first.
 */

export const LEAGUE_FIXTURE_CANCEL_HINT = '순위 집계에서 빼요. 경기 기록은 남아요.';
export const LEAGUE_FIXTURE_DELETE_HINT = '대진표에서 숨겨요. 되돌릴 수 없어요.';

const IN_PROGRESS_REASON = '경기가 진행 중이에요. 콘솔의 ‘몰수·중단으로 종료’로 먼저 끝내 주세요.';
const STARTED_OR_RESULT_REASON = '시작했거나 결과가 있는 경기는 바로 삭제할 수 없어요. 먼저 경기를 취소한 뒤 삭제해 주세요.';

interface DeleteGateInput {
  cancelled: boolean;
  gameState: string | null | undefined;
  /** Official, voided or pending result revision exists. */
  hasResult: boolean;
}

/** Why the fixture cannot be deleted right now, or null when it can. A cancelled fixture is always deletable. */
export function leagueFixtureDeleteBlockedReason({ cancelled, gameState, hasResult }: DeleteGateInput): string | null {
  if (cancelled) return null;
  if (gameState === 'LIVE' || gameState === 'PAUSED') return IN_PROGRESS_REASON;
  const started = gameState !== null && gameState !== undefined && gameState !== 'SCHEDULED';
  return started || hasResult ? STARTED_OR_RESULT_REASON : null;
}

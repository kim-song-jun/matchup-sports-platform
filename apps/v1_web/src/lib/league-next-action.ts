import type { V1LeagueFixture } from '@/types/league-match';

export type LeagueNextAction =
  /** 끝난 경기의 결과가 확정을 기다린다 — 콘솔에서 확정한다. */
  | { readonly kind: 'confirm'; readonly fixture: V1LeagueFixture; readonly pendingCount: number }
  /** 지금 뛰고 있는 경기가 있다 — 콘솔을 연다. */
  | { readonly kind: 'live'; readonly fixture: V1LeagueFixture }
  /** 다음에 치를 경기 — 킥오프 전에 콘솔에서 도착 확인을 한다. */
  | { readonly kind: 'next'; readonly fixture: V1LeagueFixture };

/** 취소·부전승(상대 없음)은 콘솔이 열리는 경기가 아니다. */
function isPlayable(fixture: V1LeagueFixture): boolean {
  return fixture.status !== 'cancelled' && fixture.awayTeamId !== null;
}

function startMs(fixture: V1LeagueFixture): number {
  const ms = new Date(fixture.startAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/**
 * 리그 상세 맨 위 "지금 할 일" 한 장이 무엇을 말할지 정한다. 우선순위는 화면이 정한 순서 그대로:
 * 결과 확정 대기 → 진행 중 → 다음 경기. 아무것도 없으면(모든 경기가 끝났거나 대진이 없다) `null`.
 *
 * 결과 확정 대기는 `resultStage === 'awaiting_approval'`(제출됐고 아직 확정 전)만이다 — 초안(`draft`)이나
 * 정정 요청(`change_requested`)은 운영자가 확정할 수 있는 상태가 아니다. 여러 건이면 가장 이른 경기를
 * 가리키고 건수를 함께 돌려준다.
 */
export function pickLeagueNextAction(fixtures: readonly V1LeagueFixture[]): LeagueNextAction | null {
  const playable = fixtures.filter(isPlayable).sort((left, right) => startMs(left) - startMs(right));

  const pending = playable.filter((fixture) => fixture.resultStage === 'awaiting_approval');
  if (pending.length > 0) return { kind: 'confirm', fixture: pending[0], pendingCount: pending.length };

  const live = playable.find((fixture) => fixture.gameState === 'LIVE' || fixture.gameState === 'PAUSED');
  if (live) return { kind: 'live', fixture: live };

  // 아직 치르지 않은 경기 — 결과가 서 있거나(확정·무효) 경기가 끝난 것은 제외한다.
  const upcoming = playable.find(
    (fixture) =>
      fixture.resultStage !== 'official' &&
      fixture.resultStage !== 'voided' &&
      fixture.gameState !== 'ENDED' &&
      fixture.gameState !== 'CANCELLED',
  );
  return upcoming ? { kind: 'next', fixture: upcoming } : null;
}

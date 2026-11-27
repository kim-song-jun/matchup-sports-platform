import { createHash } from 'node:crypto';
import type { WidgetLiveGame } from './widget-home.service';
import { WIDGET_JUST_ENDED_MS } from './widget-home';

/** 실시간 카드가 한 번에 읽는 상태 — 위젯 홈 `live` 와 같은 모양에서 카드에 필요한 것만(득점자 목록은 카드에 없다). */
export function liveActivityContentState(game: WidgetLiveGame, now: Date): Record<string, unknown> {
  return {
    gameId: game.gameId,
    teamName: game.teamName,
    teamLogoUrl: game.teamLogoUrl,
    opponentName: game.opponentName,
    opponentLogoUrl: game.opponentLogoUrl,
    competitionName: game.competitionName,
    venueName: game.venueName,
    state: game.state,
    score: game.score,
    penalties: game.penalties,
    period: game.period,
    updatedAt: now.getTime(),
    endedAt: game.endedAt?.getTime() ?? null,
  };
}

/**
 * 카드가 바뀌어야 하는 순간을 알아내는 지문. 득점·구간·일시정지·종료·점수 공개 여부가 바뀌면 달라지고,
 * 시계처럼 흐르기만 하는 값(`updatedAt`)은 넣지 않는다 — 넣으면 10초마다 푸시가 나간다.
 */
export function liveStateHash(game: WidgetLiveGame): string {
  const { state, score, penalties, period, endedAt } = game;
  return createHash('sha1').update(JSON.stringify({ state, score, penalties, period, endedAt })).digest('hex');
}

/** 종료 푸시의 `dismissal-date`(초). 종료 시각 + 15분, 종료 시각을 모르면 지금 + 15분. */
export function liveActivityDismissalSeconds(game: WidgetLiveGame, now: Date): number {
  return Math.floor(((game.endedAt ?? now).getTime() + WIDGET_JUST_ENDED_MS) / 1000);
}

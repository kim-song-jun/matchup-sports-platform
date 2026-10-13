import { toKstDateString } from './kst-calendar';
import type { V1LeagueFixture } from '@/types/league-match';

/**
 * 정규 리그의 **경기가 있는 날**인가 — 리그 진입 CTA 를 LIVE 로 그리는 기준(2026-10-13 사용자 확정).
 *
 * 대회는 하루 안에 끝나 `in_progress` 만으로 LIVE 가 맞지만, 리그는 몇 주에 걸쳐 열려 경기가 없는
 * 날이 대부분이다. 그래서
 * · 진행 중·일시정지인 경기가 있으면 날짜와 상관없이 경기일이다(자정을 넘긴 경기).
 * · 아니면 오늘(KST) 시작하는 경기가 하나라도 있으면 경기일이다. 취소된 경기는 세지 않는다.
 *
 * 대회 상세(`/tournaments/:id`)와 리그 순위·일정 화면(`/league-matches/:id`)이 같은 판정을 쓴다.
 */
export function isLeagueMatchDay(
  fixtures: readonly Pick<V1LeagueFixture, 'startAt' | 'status' | 'gameState'>[],
  now: Date = new Date(),
): boolean {
  const today = toKstDateString(now);
  return fixtures.some((fixture) => {
    if (fixture.gameState === 'LIVE' || fixture.gameState === 'PAUSED') return true;
    if (fixture.status === 'cancelled' || fixture.gameState === 'CANCELLED') return false;
    const startsAt = new Date(fixture.startAt);
    return Number.isFinite(startsAt.getTime()) && toKstDateString(startsAt) === today;
  });
}

/** 리그 진입 CTA 문구 — 경기가 있는 날만 "진행 중" 이라고 말한다(두 화면이 같은 문구를 쓴다). */
export function leagueEntryCtaLabel(isMatchDay: boolean): string {
  return isMatchDay ? '진행 중인 리그 보기' : '리그 일정 보기';
}

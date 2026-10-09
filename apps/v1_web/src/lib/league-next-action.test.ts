import { describe, expect, it } from 'vitest';
import type { V1LeagueFixture } from '@/types/league-match';
import { pickLeagueNextAction } from './league-next-action';

let seq = 0;
function fixture(overrides: Partial<V1LeagueFixture> & { startAt: string }): V1LeagueFixture {
  seq += 1;
  return {
    teamMatchId: `tm-${seq}`,
    title: `${seq}주차`,
    homeTeamId: 't1',
    awayTeamId: 't2',
    placeName: '구장',
    status: 'matched',
    resultStage: 'not_entered',
    gameState: 'SCHEDULED',
    ...overrides,
  };
}

const W1 = '2026-09-30T01:10:00.000Z';
const W2 = '2026-10-07T01:10:00.000Z';
const W3 = '2026-10-14T01:10:00.000Z';

describe('pickLeagueNextAction', () => {
  it('팀이 비어 있는 자리 경기는 콘솔을 열 수 없으므로 다음 경기로 가리키지 않는다 — 양쪽이 다 찬 경기는 그대로 가리킨다', () => {
    const noTeams = fixture({ startAt: W1, homeTeamId: null, awayTeamId: null });
    const onlyHomeEmpty = fixture({ startAt: W1, homeTeamId: null, awayTeamId: 't2' });
    const ready = fixture({ startAt: W2 });
    const action = pickLeagueNextAction([noTeams, onlyHomeEmpty, ready]);

    expect(action).toMatchObject({ kind: 'next' });
    expect(action?.fixture.teamMatchId).toBe(ready.teamMatchId);
    // 팀이 빈 경기만 있으면 할 일이 없다.
    expect(pickLeagueNextAction([noTeams, onlyHomeEmpty])).toBeNull();
  });

  it('결과 확정 대기 경기가 있으면 그 경기를 먼저 가리킨다 — 다음 경기가 있어도', () => {
    const waiting = fixture({ startAt: W1, resultStage: 'awaiting_approval', gameState: 'ENDED' });
    const action = pickLeagueNextAction([fixture({ startAt: W2 }), waiting]);

    expect(action).toMatchObject({ kind: 'confirm', pendingCount: 1 });
    expect(action?.fixture.teamMatchId).toBe(waiting.teamMatchId);
  });

  it('확정 대기가 여럿이면 가장 이른 경기를 가리키고 건수를 알린다', () => {
    const early = fixture({ startAt: W1, resultStage: 'awaiting_approval', gameState: 'ENDED' });
    const late = fixture({ startAt: W2, resultStage: 'awaiting_approval', gameState: 'ENDED' });
    const action = pickLeagueNextAction([late, early]);

    expect(action).toMatchObject({ kind: 'confirm', pendingCount: 2 });
    expect(action?.fixture.teamMatchId).toBe(early.teamMatchId);
  });

  it('확정 대기가 없고 뛰는 경기가 있으면 진행 중 — 일시 중지도 뛰는 중이다', () => {
    const live = fixture({ startAt: W1, gameState: 'LIVE' });
    const paused = fixture({ startAt: W2, gameState: 'PAUSED' });

    expect(pickLeagueNextAction([paused, live])?.fixture.teamMatchId).toBe(live.teamMatchId);
    expect(pickLeagueNextAction([paused])).toMatchObject({ kind: 'live' });
  });

  it('둘 다 없으면 아직 치르지 않은 가장 이른 경기가 다음 경기다 (확정·무효·종료·취소는 건너뛴다)', () => {
    const done = fixture({ startAt: W1, resultStage: 'official', gameState: 'ENDED' });
    const cancelled = fixture({ startAt: W2, status: 'cancelled' });
    const upcoming = fixture({ startAt: W3 });
    const action = pickLeagueNextAction([upcoming, cancelled, done]);

    expect(action).toMatchObject({ kind: 'next' });
    expect(action?.fixture.teamMatchId).toBe(upcoming.teamMatchId);
  });

  it('초안·정정 요청 상태는 운영자가 확정할 수 있는 결과가 아니라서 확정 카드를 만들지 않는다', () => {
    const draft = fixture({ startAt: W1, resultStage: 'draft', gameState: 'ENDED' });
    const changeRequested = fixture({ startAt: W2, resultStage: 'change_requested', gameState: 'ENDED' });

    expect(pickLeagueNextAction([draft, changeRequested])?.kind).not.toBe('confirm');
  });

  it('모든 경기가 끝났거나 대진이 없으면 null', () => {
    const done = fixture({ startAt: W1, resultStage: 'official', gameState: 'ENDED' });

    expect(pickLeagueNextAction([done])).toBeNull();
    expect(pickLeagueNextAction([])).toBeNull();
  });

  it('상대가 없는 부전승과 취소된 대진은 콘솔이 열리는 경기가 아니라 어느 카드도 만들지 않는다', () => {
    const bye = fixture({ startAt: W1, awayTeamId: null, resultStage: 'awaiting_approval' });
    const cancelled = fixture({ startAt: W2, status: 'cancelled', gameState: 'LIVE' });

    expect(pickLeagueNextAction([bye, cancelled])).toBeNull();
  });

  it('gameState 를 모르는 응답(구버전·캐시)에서도 다음 경기는 고른다', () => {
    const legacy = fixture({ startAt: W1, gameState: undefined });

    expect(pickLeagueNextAction([legacy])).toMatchObject({ kind: 'next' });
  });
});

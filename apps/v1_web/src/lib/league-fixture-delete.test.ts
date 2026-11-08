import { describe, expect, it } from 'vitest';
import { leagueFixtureDeleteBlockedReason } from './league-fixture-delete';

describe('leagueFixtureDeleteBlockedReason', () => {
  it('시작 전이고 결과가 없는 경기는 삭제할 수 있다', () => {
    expect(leagueFixtureDeleteBlockedReason({ cancelled: false, gameState: 'SCHEDULED', hasResult: false })).toBeNull();
    expect(leagueFixtureDeleteBlockedReason({ cancelled: false, gameState: null, hasResult: false })).toBeNull();
    expect(leagueFixtureDeleteBlockedReason({ cancelled: false, gameState: undefined, hasResult: false })).toBeNull();
  });

  it('시작했거나 결과가 있으면 먼저 취소하라는 사유로 막는다', () => {
    for (const input of [
      { cancelled: false, gameState: 'ENDED', hasResult: false },
      { cancelled: false, gameState: 'SCHEDULED', hasResult: true },
    ]) {
      expect(leagueFixtureDeleteBlockedReason(input)).toContain('먼저 경기를 취소한 뒤 삭제');
    }
  });

  it('진행 중이면 취소로 풀 수 없으니 콘솔에서 끝내라는 사유가 따로 나온다', () => {
    for (const gameState of ['LIVE', 'PAUSED']) {
      expect(leagueFixtureDeleteBlockedReason({ cancelled: false, gameState, hasResult: false })).toContain('콘솔');
    }
  });

  it('취소된 경기는 결과가 있어도 삭제할 수 있다', () => {
    expect(leagueFixtureDeleteBlockedReason({ cancelled: true, gameState: 'ENDED', hasResult: true })).toBeNull();
  });
});

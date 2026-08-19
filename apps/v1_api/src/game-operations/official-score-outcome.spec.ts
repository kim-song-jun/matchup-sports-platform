import { officialRecordResult } from './official-score-outcome';

describe('officialRecordResult', () => {
  it('정규시간 승패를 그대로 반환한다', () => {
    expect(officialRecordResult({ home: 2, away: 1 }, 'HOME')).toBe('WON');
    expect(officialRecordResult({ home: 2, away: 1 }, 'AWAY')).toBe('LOST');
  });

  it('정규시간 동점이면 승부차기로 최종 승패를 판정한다', () => {
    const score = { home: 1, away: 1, penalties: { home: 2, away: 3 } };
    expect(officialRecordResult(score, 'HOME')).toBe('LOST');
    expect(officialRecordResult(score, 'AWAY')).toBe('WON');
  });

  it('승부차기가 없으면 정규시간 동점을 무승부로 유지한다', () => {
    expect(officialRecordResult({ home: 0, away: 0 }, 'HOME')).toBe('DRAWN');
  });
});

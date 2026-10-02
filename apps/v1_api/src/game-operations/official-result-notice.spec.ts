import { officialResultNoticeBody } from './official-result-notice';

describe('officialResultNoticeBody', () => {
  const base = { label: '가을 리그 1주차', homeName: '마포 FC', awayName: '합정 유나이티드' };

  it('목업 문구 그대로 — 승리 + 출전자 개인 기록', () => {
    expect(officialResultNoticeBody({ ...base, score: { home: 2, away: 1 }, side: 'HOME', record: { goals: 1, assists: 0 } })).toBe(
      '가을 리그 1주차 · 마포 FC 2 : 1 합정 유나이티드 · 승리. 내 기록 1골이에요.',
    );
  });

  it('승패는 받는 사람 팀 기준이다 — 같은 경기가 원정팀에게는 패배다', () => {
    expect(officialResultNoticeBody({ ...base, score: { home: 2, away: 1 }, side: 'AWAY', record: null })).toBe(
      '가을 리그 1주차 · 마포 FC 2 : 1 합정 유나이티드 · 패배.',
    );
  });

  it('무승부, 그리고 골·도움이 없는 출전자는 개인 기록 문장을 붙이지 않는다', () => {
    expect(officialResultNoticeBody({ ...base, score: { home: 1, away: 1 }, side: 'HOME', record: { goals: 0, assists: 0 } })).toBe(
      '가을 리그 1주차 · 마포 FC 1 : 1 합정 유나이티드 · 무승부.',
    );
  });

  it('골과 도움을 함께, 도움만 있으면 도움만 쓴다', () => {
    expect(officialResultNoticeBody({ ...base, score: { home: 0, away: 3 }, side: 'AWAY', record: { goals: 2, assists: 1 } })).toBe(
      '가을 리그 1주차 · 마포 FC 0 : 3 합정 유나이티드 · 승리. 내 기록 2골 1도움이에요.',
    );
    expect(officialResultNoticeBody({ ...base, score: { home: 0, away: 3 }, side: 'AWAY', record: { goals: 0, assists: 2 } })).toBe(
      '가을 리그 1주차 · 마포 FC 0 : 3 합정 유나이티드 · 승리. 내 기록 2도움이에요.',
    );
  });

  it('정규시간 무승부를 승부차기로 가르면 승부차기 점수와 그 결과의 승패를 쓴다', () => {
    const score = { home: 1, away: 1, penalties: { home: 3, away: 4 } };
    expect(officialResultNoticeBody({ ...base, label: '가을 대회 · 결승', score, side: 'HOME', record: null })).toBe(
      '가을 대회 · 결승 · 마포 FC 1 : 1 합정 유나이티드 (승부차기 3 : 4) · 패배.',
    );
    expect(officialResultNoticeBody({ ...base, label: '가을 대회 · 결승', score, side: 'AWAY', record: null })).toMatch(/· 승리\.$/);
  });
});

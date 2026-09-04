import { isLeagueRegistrationOpen } from './league-registration-open';

/**
 * 이 판정이 등록 서비스와 갈리면 **화면은 "모집 중" 을 그리는데 누르면 409** 가 난다.
 * 그래서 경계를 값으로 못박는다.
 */
describe('isLeagueRegistrationOpen', () => {
  const NOW = new Date('2026-09-20T14:59:00.000Z').getTime();

  it('마감 시각과 정확히 같은 순간은 아직 열려 있다', () => {
    // 등록 서비스는 `deadline < now` 일 때만 닫는다 — 같은 순간은 통과한다.
    // `>` 로 적으면 이 한 순간만 화면과 서버가 갈린다.
    expect(isLeagueRegistrationOpen('open', new Date(NOW), NOW)).toBe(true);
  });

  it('1ms 라도 지나면 닫힌다', () => {
    expect(isLeagueRegistrationOpen('open', new Date(NOW - 1), NOW)).toBe(false);
  });

  it('아직 안 지났으면 열려 있다', () => {
    expect(isLeagueRegistrationOpen('open', new Date(NOW + 1), NOW)).toBe(true);
  });

  it('마감이 없으면 기한 없이 열림이다 — "안 받음" 이 아니다', () => {
    expect(isLeagueRegistrationOpen('open', null, NOW)).toBe(true);
  });

  it('status 가 open 이 아니면 마감이 남아 있어도 닫혀 있다', () => {
    // 받는지 여부를 정하는 것은 status 다. 마감만 보고 판단하면 아직 안 연 리그가 열린 것처럼 보인다.
    for (const status of ['draft', 'in_progress', 'completed', 'cancelled']) {
      expect(isLeagueRegistrationOpen(status, new Date(NOW + 60_000), NOW)).toBe(false);
    }
  });
});

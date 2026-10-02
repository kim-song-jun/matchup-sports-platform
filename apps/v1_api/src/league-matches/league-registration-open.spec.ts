import { isLeagueRegistrationOpen } from './league-registration-open';

/**
 * 이 판정이 등록 서비스와 갈리면 **화면은 "모집 중" 을 그리는데 누르면 409** 가 난다.
 * 그래서 경계와 의미를 값으로 못박는다.
 */
describe('isLeagueRegistrationOpen', () => {
  const NOW = new Date('2026-09-20T14:59:00.000Z').getTime();

  it('마감 시각과 정확히 같은 순간은 아직 열려 있다', () => {
    // 등록 서비스는 `deadline < now` 일 때만 닫는다 — 같은 순간은 통과한다.
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW), NOW)).toBe(true);
  });

  it('1ms 라도 지나면 닫힌다', () => {
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW - 1), NOW)).toBe(false);
  });

  it('마감이 없으면 **안 받는다** — 아무도 열지 않은 리그다', () => {
    // 정본 §6: "마감을 누군가 정해야 한다 — 안 정하면(null) 그 리그는 신청을 안 받는다."
    // 판정에서 status 를 뺀 이상 **열렸다는 신호는 마감밖에 없다.**
    expect(isLeagueRegistrationOpen('draft', null, NOW)).toBe(false);
    expect(isLeagueRegistrationOpen('in_progress', null, NOW)).toBe(false);
  });

  it('대진이 있어 진행 중인 리그도 신청을 받을 수 있다 — 이게 이번 변경의 요지다', () => {
    // 예전엔 `status === 'open'` 을 요구해서, `generateFixtures` 가 status 를 `in_progress`
    // 로 옮기는 순간 신청을 영영 못 열었다(2026-09-04 alpha 실측 409 LEAGUE_NOT_DRAFT).
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW + 60_000), NOW)).toBe(true);
    expect(isLeagueRegistrationOpen('draft', new Date(NOW + 60_000), NOW)).toBe(true);
    expect(isLeagueRegistrationOpen('open', new Date(NOW + 60_000), NOW)).toBe(true);
  });

  it('끝났거나 취소된 리그는 마감이 남아 있어도 안 받는다', () => {
    for (const status of ['completed', 'cancelled']) {
      expect(isLeagueRegistrationOpen(status, new Date(NOW + 60_000), NOW)).toBe(false);
    }
  });
});

import { hasLeagueFirstMatchStarted, isLeagueRegistrationOpen } from './league-registration-open';

/**
 * 이 판정이 등록 서비스와 갈리면 **화면은 "모집 중" 을 그리는데 누르면 409** 가 난다.
 * 그래서 경계와 의미를 값으로 못박는다.
 */
describe('isLeagueRegistrationOpen', () => {
  const NOW = new Date('2026-09-20T14:59:00.000Z').getTime();

  it('마감 시각과 정확히 같은 순간은 아직 열려 있다', () => {
    // 등록 서비스는 `deadline < now` 일 때만 닫는다 — 같은 순간은 통과한다.
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW), false, NOW)).toBe(true);
  });

  it('1ms 라도 지나면 닫힌다', () => {
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW - 1), false, NOW)).toBe(false);
  });

  it('마감이 없으면 **안 받는다** — 아무도 열지 않은 리그다', () => {
    // 정본 §6: "마감을 누군가 정해야 한다 — 안 정하면(null) 그 리그는 신청을 안 받는다."
    expect(isLeagueRegistrationOpen('draft', null, false, NOW)).toBe(false);
    expect(isLeagueRegistrationOpen('in_progress', null, false, NOW)).toBe(false);
  });

  it('대진을 미리 짜 둔(진행 중 status) 리그도 첫 경기 킥오프 전이면 신청을 받는다', () => {
    // 예전엔 `status === 'open'` 을 요구해서, `generateFixtures` 가 status 를 `in_progress`
    // 로 옮기는 순간 신청을 영영 못 열었다(2026-09-04 alpha 실측 409 LEAGUE_NOT_DRAFT).
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW + 60_000), false, NOW)).toBe(true);
    expect(isLeagueRegistrationOpen('draft', new Date(NOW + 60_000), false, NOW)).toBe(true);
    expect(isLeagueRegistrationOpen('open', new Date(NOW + 60_000), false, NOW)).toBe(true);
  });

  it('끝났거나 취소된 리그는 마감이 남아 있어도 안 받는다', () => {
    for (const status of ['completed', 'cancelled']) {
      expect(isLeagueRegistrationOpen(status, new Date(NOW + 60_000), false, NOW)).toBe(false);
    }
  });

  it('첫 경기가 킥오프하면 마감이 남아 있어도 닫힌다 (2026-10-13)', () => {
    expect(isLeagueRegistrationOpen('in_progress', new Date(NOW + 7 * 86_400_000), true, NOW)).toBe(false);
  });
});

describe('hasLeagueFirstMatchStarted', () => {
  it('삭제되지 않은 대진의 킥오프한 경기(LIVE·PAUSED·ENDED)만 센다 — 취소된 경기는 시작이 아니다', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await expect(hasLeagueFirstMatchStarted({ v1Game: { findFirst } } as never, 'league-1')).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith({
      where: { teamMatch: { leagueId: 'league-1', deletedAt: null }, state: { in: ['LIVE', 'PAUSED', 'ENDED'] } },
      select: { id: true },
    });

    findFirst.mockResolvedValue({ id: 'game-1' });
    await expect(hasLeagueFirstMatchStarted({ v1Game: { findFirst } } as never, 'league-1')).resolves.toBe(true);
  });
});

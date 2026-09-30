import { ProfileService } from '../profile/profile.service';
import { HomeService } from './home.service';

const teamActivityService = {
  forUser: jest.fn().mockResolvedValue({ hasTeam: false, nextGame: null }),
} as never;

describe('HomeService', () => {
  it('추천 매치는 경기 전이면서 신청 마감이 지나지 않은 모집 행만 조회한다', async () => {
    const prisma = {
      v1Match: { findMany: jest.fn().mockResolvedValue([]) },
      v1Notice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const popupsService = { findActive: jest.fn().mockResolvedValue(null) };
    const service = new HomeService(prisma as never, popupsService as never, teamActivityService);

    await service.getRecommendations(null, {});

    expect(prisma.v1Match.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'recruiting',
        startAt: { gte: expect.any(Date) },
        OR: [{ deadlineAt: null }, { deadlineAt: { gte: expect.any(Date) } }],
      }),
    }));
  });

  it('returns the active popup separately from recent notices', async () => {
    const publishedAt = new Date('2026-07-09T00:00:00.000Z');
    const prisma = {
      v1Match: { findMany: jest.fn().mockResolvedValue([]) },
      v1Notice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'notice-1', title: '업데이트 안내', body: '공지 본문', category: '업데이트', publishedAt },
        ]),
      },
    };
    const popupsService = {
      findActive: jest.fn().mockResolvedValue({
        popupId: 'popup-1',
        title: '서비스 점검',
        body: '팝업 본문',
        targetScreens: ['home'],
        linkUrl: null,
        linkLabel: null,
        publishedAt,
      }),
    };
    const service = new HomeService(prisma as never, popupsService as never, teamActivityService);

    const result = await service.getHome(null, {});

    expect(popupsService.findActive).toHaveBeenCalledWith('home');
    expect(prisma.v1Notice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'published', audience: 'public' },
      take: 3,
    }));
    expect(result.popup).toEqual({
      popupId: 'popup-1',
      title: '서비스 점검',
      body: '팝업 본문',
      targetScreens: ['home'],
      linkUrl: null,
      linkLabel: null,
      publishedAt,
    });
    expect(result.notices).toEqual([
      expect.objectContaining({ noticeId: 'notice-1', category: '업데이트' }),
    ]);
  });

  it('추천 매치 목록에도 참가 인원과 정원을 함께 내려준다', async () => {
    // 홈 카드는 "1/6명"처럼 인원을 그린다. 이 두 값이 응답에서 빠지면 프론트가 값을 지어내
    // 모든 카드가 "0/1명 · 마감 임박"으로 보인다(2026-09-07 프로덕션 제보).
    const startAt = new Date('2026-09-11T11:00:00.000Z');
    const prisma = {
      v1Match: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'match-1',
            title: '평일 저녁 풋살',
            startAt,
            maxParticipants: 6,
            sport: { name: '풋살' },
            region: { name: '광진구' },
            participants: [{ id: 'participant-1' }],
            hostUser: { reputationSummary: { trustState: 'verified' } },
          },
        ]),
      },
      v1Notice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const popupsService = { findActive: jest.fn().mockResolvedValue(null) };
    const service = new HomeService(prisma as never, popupsService as never, teamActivityService);

    const result = await service.getHome(null, {});

    // 전체 형태를 단언한다 — 필드 하나가 빠져도 통과하는 부분 단언이면 이 결함을 다시 놓친다.
    expect(result.recommendations).toEqual([
      {
        matchId: 'match-1',
        title: '평일 저녁 풋살',
        sportName: '풋살',
        regionName: '광진구',
        startsAt: startAt,
        participantCount: 1,
        capacity: 6,
      },
    ]);
  });

  // F85: 홈 "이번 달 경기"와 마이 "이번 달 경기"가 같은 데이터에서 같은 숫자여야 한다. 대조군으로 신청만 한
  // 매치·취소된 매치(호스트 row 는 active 로 남는다)·지난달 경기를 섞어, 예전 홈 집계(신청·참가 합산)로는
  // 3 이 나오고 마이 집계로는 2 가 나오게 둔다.
  it('이번 달 경기는 마이 활동 요약과 같은 값이다 — 끝난 개인 매치 + 공식 경기 출전', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-20T03:00:00.000Z'));
    try {
      const prisma = monthlyCountPrisma();
      const popupsService = { findActive: jest.fn().mockResolvedValue(null) };
      const home = await new HomeService(prisma as never, popupsService as never, teamActivityService).getHome(
        { id: 'user-1' } as never,
        {} as never,
      );
      const my = await new ProfileService(prisma as never).activitySummary({ id: 'user-1' } as never);

      expect(my.monthly.matchCount).toBe(2);
      expect(home.summary.monthlyMatches).toBe(my.monthly.matchCount);
    } finally {
      jest.useRealTimers();
    }
  });
});

type Range = { gte?: Date; lt?: Date };
type ParticipantWhere = {
  userId: string;
  status: string | { in: string[] };
  match: { status: string | { not: string }; deletedAt: null; startAt?: Range };
};

function monthlyCountPrisma() {
  const participant = (status: string, matchStatus: string, startAt: string) => ({
    userId: 'user-1',
    status,
    match: { status: matchStatus, deletedAt: null, startAt: new Date(startAt) },
  });
  const participants = [
    participant('completed', 'completed', '2026-09-05T10:00:00.000Z'),
    participant('active', 'recruiting', '2026-09-25T10:00:00.000Z'),
    participant('active', 'recruiting', '2026-09-28T10:00:00.000Z'),
    participant('active', 'cancelled', '2026-09-10T10:00:00.000Z'),
    participant('completed', 'completed', '2026-08-20T10:00:00.000Z'),
  ];
  const matches = (value: string, rule: string | { in?: string[]; not?: string }) =>
    typeof rule === 'string' ? value === rule : rule.in !== undefined ? rule.in.includes(value) : value !== rule.not;
  const inRange = (value: Date, range: Range) =>
    (range.gte === undefined || value >= range.gte) && (range.lt === undefined || value < range.lt);
  const officialRow = (gameId: string, officialAt: string) => ({
    resultRevision: {
      id: `rev-${gameId}`,
      gameId,
      officialAt: new Date(officialAt),
      game: {
        currentOfficialRevisionId: `rev-${gameId}`,
        sourceType: 'TEAM_MATCH',
        teamMatch: { id: `tm-${gameId}`, leagueId: 'league-1', tournamentId: null, tournament: null, tournamentDetails: null },
      },
    },
  });

  return {
    v1MatchParticipant: {
      count: jest.fn(({ where }: { where: ParticipantWhere }) =>
        Promise.resolve(
          participants.filter(
            (row) =>
              row.userId === where.userId &&
              matches(row.status, where.status) &&
              matches(row.match.status, where.match.status) &&
              inRange(row.match.startAt, where.match.startAt ?? {}),
          ).length,
        ),
      ),
    },
    v1ParticipantIdentityLinkCurrent: { findMany: jest.fn().mockResolvedValue([{ participantId: 'participant-1' }]) },
    v1GameResultParticipant: {
      findMany: jest.fn().mockResolvedValue([
        officialRow('game-this-month', '2026-09-12T12:00:00.000Z'),
        officialRow('game-last-month', '2026-08-30T12:00:00.000Z'),
      ]),
    },
    v1UserReputationSummary: { findUnique: jest.fn().mockResolvedValue(null) },
    v1UserRecordConsent: { findUnique: jest.fn().mockResolvedValue(null) },
    v1PostEventReview: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    v1MatchApplication: { count: jest.fn().mockResolvedValue(0) },
    v1Match: { findMany: jest.fn().mockResolvedValue([]) },
    v1Notice: { findMany: jest.fn().mockResolvedValue([]) },
    v1Notification: { count: jest.fn().mockResolvedValue(0) },
    v1UserProfile: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

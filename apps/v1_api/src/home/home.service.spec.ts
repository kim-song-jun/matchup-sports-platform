import { HomeService } from './home.service';

describe('HomeService', () => {
  it('추천 매치는 경기 전이면서 신청 마감이 지나지 않은 모집 행만 조회한다', async () => {
    const prisma = {
      v1Match: { findMany: jest.fn().mockResolvedValue([]) },
      v1Notice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const popupsService = { findActive: jest.fn().mockResolvedValue(null) };
    const service = new HomeService(prisma as never, popupsService as never);

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
    const service = new HomeService(prisma as never, popupsService as never);

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
    const service = new HomeService(prisma as never, popupsService as never);

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
});

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
});

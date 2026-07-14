import { HomeService } from './home.service';

describe('HomeService', () => {
  it('returns the active popup separately from recent notices', async () => {
    const publishedAt = new Date('2026-07-09T00:00:00.000Z');
    const prisma = {
      v1Match: { findMany: jest.fn().mockResolvedValue([]) },
      v1Popup: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'popup-1',
          title: '서비스 점검',
          body: '팝업 본문',
          publishedAt,
        }),
      },
      v1Notice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'notice-1', title: '업데이트 안내', body: '공지 본문', category: '업데이트', publishedAt },
        ]),
      },
    };
    const service = new HomeService(prisma as never);

    const result = await service.getHome(null, {});

    expect(prisma.v1Popup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'published',
        audience: 'public',
        AND: [
          { OR: [{ displayStartAt: null }, { displayStartAt: { lte: expect.any(Date) } }] },
          { OR: [{ displayEndAt: null }, { displayEndAt: { gt: expect.any(Date) } }] },
        ],
      },
    }));
    expect(prisma.v1Notice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'published', audience: 'public' },
      take: 3,
    }));
    expect(result.popup).toEqual({
      popupId: 'popup-1',
      title: '서비스 점검',
      body: '팝업 본문',
      publishedAt,
    });
    expect(result.notices).toEqual([
      expect.objectContaining({ noticeId: 'notice-1', category: '업데이트' }),
    ]);
  });
});
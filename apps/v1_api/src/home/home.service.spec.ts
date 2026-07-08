import { HomeService } from './home.service';

describe('HomeService', () => {
  it('returns up to three published public pinned notices on home', async () => {
    const now = new Date('2026-07-09T00:00:00.000Z');
    const prisma = {
      v1Match: { findMany: jest.fn().mockResolvedValue([]) },
      v1Notice: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'notice-1', title: '고정 공지 1', body: '본문 1', category: '고정', publishedAt: now },
          { id: 'notice-2', title: '고정 공지 2', body: '본문 2', category: '고정', publishedAt: now },
          { id: 'notice-3', title: '고정 공지 3', body: '본문 3', category: '고정', publishedAt: now },
        ]),
      },
    };
    const service = new HomeService(prisma as never);

    const result = await service.getHome(null, {});

    expect(prisma.v1Notice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'published', audience: 'public', category: '고정' },
        take: 3,
      }),
    );
    expect(result.notices).toHaveLength(3);
    expect(result.notice).toEqual({ noticeId: 'notice-1', title: '고정 공지 1', pinned: true });
  });
});

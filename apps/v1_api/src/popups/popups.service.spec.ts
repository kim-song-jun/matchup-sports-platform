import { PopupsService } from './popups.service';

describe('PopupsService', () => {
  it('selects the newest active popup targeting the requested screen', async () => {
    const publishedAt = new Date('2026-07-18T00:00:00.000Z');
    const prisma = {
      v1Popup: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'popup-1',
          title: '매치 안내',
          body: '매치 화면 공지',
          targetScreens: ['matches', 'teams'],
          linkUrl: '/matches',
          linkLabel: '매치 보기',
          publishedAt,
        }),
      },
    };
    const service = new PopupsService(prisma as never);

    await expect(service.findActive('matches')).resolves.toEqual({
      popupId: 'popup-1',
      title: '매치 안내',
      body: '매치 화면 공지',
      targetScreens: ['matches', 'teams'],
      linkUrl: '/matches',
      linkLabel: '매치 보기',
      publishedAt,
    });
    expect(prisma.v1Popup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'published',
        audience: 'public',
        targetScreens: { has: 'matches' },
      }),
    }));
  });

  it('returns null when no popup targets the screen in the active window', async () => {
    const prisma = { v1Popup: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new PopupsService(prisma as never);

    await expect(service.findActive('marketplace')).resolves.toBeNull();
  });
});

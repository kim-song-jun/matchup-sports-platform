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
          targetPaths: [],
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
      targetPaths: [],
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

  it('prefers an exact path popup over the broader screen popup', async () => {
    const exact = {
      id: 'popup-exact',
      title: '대회 상세 안내',
      body: '이 대회에만 노출',
      contentJson: null,
      contentVersion: 1,
      targetScreens: [],
      targetPaths: ['/tournaments/tournament-1'],
      linkUrl: null,
      linkLabel: null,
      publishedAt: new Date('2026-08-04T00:00:00.000Z'),
    };
    const prisma = { v1Popup: { findFirst: jest.fn().mockResolvedValue(exact) } };
    const service = new PopupsService(prisma as never);

    await expect(service.findActive('tournaments', '/tournaments/tournament-1')).resolves.toEqual({
      popupId: exact.id,
      title: exact.title,
      body: exact.body,
      content: exact.contentJson,
      contentVersion: exact.contentVersion,
      targetScreens: exact.targetScreens,
      targetPaths: exact.targetPaths,
      linkUrl: null,
      linkLabel: null,
      publishedAt: exact.publishedAt,
    });
    expect(prisma.v1Popup.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.v1Popup.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ targetPaths: { has: '/tournaments/tournament-1' } }),
    }));
  });

  it('returns null when no popup targets the screen in the active window', async () => {
    const prisma = { v1Popup: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new PopupsService(prisma as never);

    await expect(service.findActive('marketplace')).resolves.toBeNull();
  });
});

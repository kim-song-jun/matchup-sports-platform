import { createAdCampaignFakePrisma, type FakeAsset } from '../../test/helpers/ad-campaign-fake-prisma';
import { AdminService } from './admin.service';

// The hourly sweep deletes temporary uploads nobody attached. It must never delete a row that already has an owner,
// whichever owner column carries it. Rows are evaluated by the fake's where matcher, so dropping a condition from the
// sweep's delete filter shows up as a row that disappears.
describe('AdminService stale temporary asset cleanup', () => {
  const stale = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const asset = (id: string, overrides: Partial<FakeAsset> = {}): FakeAsset => ({
    id, url: `/uploads/${id}.webp`, status: 'temporary', uploadedByAdminUserId: 'admin-1',
    noticeId: null, popupId: null, adCampaignId: null, attachedAt: null, createdAt: stale, ...overrides,
  });

  it('removes only unowned, stale, temporary uploads', async () => {
    const fake = createAdCampaignFakePrisma({
      admins: [],
      assets: [
        asset('unowned-stale'),
        asset('fresh', { createdAt: new Date() }),
        asset('owned-by-notice', { noticeId: 'notice-1' }),
        asset('owned-by-popup', { popupId: 'popup-1' }),
        asset('owned-by-campaign', { adCampaignId: 'campaign-1' }),
        asset('attached', { status: 'attached', adCampaignId: 'campaign-1' }),
      ],
    });
    const uploads = { removeStoredUrl: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminService(fake.prisma as never, uploads as never);

    await (service as unknown as { cleanupStaleTemporaryAssets(): Promise<void> }).cleanupStaleTemporaryAssets();

    expect(fake.state.assets.map((row) => row.id).sort()).toEqual(['attached', 'fresh', 'owned-by-campaign', 'owned-by-notice', 'owned-by-popup']);
    expect(uploads.removeStoredUrl).toHaveBeenCalledTimes(1);
    expect(uploads.removeStoredUrl).toHaveBeenCalledWith('/uploads/unowned-stale.webp');
  });
});

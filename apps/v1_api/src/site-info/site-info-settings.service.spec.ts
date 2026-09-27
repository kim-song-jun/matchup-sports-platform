import { PrismaService } from '../prisma/prisma.service';
import { formatGuestInquiryRetention, SiteInfoSettingsService } from './site-info-settings.service';

const opsAdmin = { id: 'ops-admin-id', userId: 'ops-user-id', adminRole: 'ops' as const, status: 'active' as const };

const savedRow = {
  id: 'singleton',
  companyName: '팀밋 주식회사',
  representativeName: '대표자',
  businessRegistrationNumber: '123-45-67890',
  address: '서울특별시 어딘가',
  mailOrderSalesNumber: '제2026-서울-0000호',
  contactEmail: 'help@example.com',
  guestInquiryRetentionDays: 365,
  updatedByAdminUserId: 'ops-admin-id',
  updatedAt: new Date('2026-09-27T00:00:00.000Z'),
};

describe('SiteInfoSettingsService', () => {
  let service: SiteInfoSettingsService;
  let prisma: {
    v1SiteInfoSettings: { findUnique: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let adminContext: { logAdminAction: jest.Mock };

  beforeEach(() => {
    prisma = {
      v1SiteInfoSettings: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => Promise<unknown>) => cb(prisma));
    adminContext = { logAdminAction: jest.fn() };
    service = new SiteInfoSettingsService(prisma as unknown as PrismaService, adminContext as never);
  });

  describe('reads', () => {
    it('no row yet → every field null and retention falls back to 365 days', async () => {
      expect(await service.getPublic()).toEqual({
        companyName: null,
        representativeName: null,
        businessRegistrationNumber: null,
        address: null,
        mailOrderSalesNumber: null,
        contactEmail: null,
        guestInquiryRetentionDays: 365,
      });
      const admin = await service.getForAdmin();
      expect(admin.updatedAt).toBeNull();
    });

    it('admin-set retention days replace the default', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue({ ...savedRow, guestInquiryRetentionDays: 1095 });
      expect((await service.getPublic()).guestInquiryRetentionDays).toBe(1095);
    });

    it('public response never carries the editor id or edit time', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(savedRow);
      const pub = await service.getPublic();
      expect(pub).not.toHaveProperty('updatedByAdminUserId');
      expect(pub).not.toHaveProperty('updatedAt');
      expect(pub.businessRegistrationNumber).toBe('123-45-67890');
      expect(JSON.stringify(pub)).not.toContain('ops-admin-id');
    });

    it('admin response exposes the editor id and ISO edit time', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(savedRow);
      const admin = await service.getForAdmin();
      expect(admin.updatedByAdminUserId).toBe('ops-admin-id');
      expect(admin.updatedAt).toBe('2026-09-27T00:00:00.000Z');
    });
  });

  describe('update()', () => {
    it('first save creates the singleton row with trimmed values and the editor admin', async () => {
      await service.update(opsAdmin, { companyName: '  팀밋  ', contactEmail: 'help@example.com' });

      const arg = prisma.v1SiteInfoSettings.upsert.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'singleton' });
      expect(arg.create).toEqual({
        id: 'singleton',
        updatedByAdminUserId: 'ops-admin-id',
        companyName: '팀밋',
        contactEmail: 'help@example.com',
      });
    });

    it('omitted fields are left untouched; "" clears a field', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(savedRow);
      await service.update(opsAdmin, { address: '', companyName: '새 상호' });

      const update = prisma.v1SiteInfoSettings.upsert.mock.calls[0][0].update;
      expect(update).toEqual({ updatedByAdminUserId: 'ops-admin-id', address: null, companyName: '새 상호' });
      expect(update).not.toHaveProperty('representativeName');
    });

    it('audits only fields whose value actually changed, with before/after values', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(savedRow);
      await service.update(opsAdmin, { companyName: '새 상호', representativeName: '대표자' });

      expect(adminContext.logAdminAction).toHaveBeenCalledWith(
        opsAdmin,
        {
          action: 'site_info_settings.update',
          targetType: 'site_info_settings',
          targetId: 'singleton',
          beforeJson: { companyName: '팀밋 주식회사' },
          afterJson: { companyName: '새 상호' },
        },
        prisma,
      );
    });

    it('audits a retention-days change against the default when no row exists yet', async () => {
      await service.update(opsAdmin, { guestInquiryRetentionDays: 730 });
      expect(prisma.v1SiteInfoSettings.upsert.mock.calls[0][0].create).toEqual({
        id: 'singleton',
        updatedByAdminUserId: 'ops-admin-id',
        guestInquiryRetentionDays: 730,
      });
      expect(adminContext.logAdminAction.mock.calls[0][1]).toMatchObject({
        beforeJson: { guestInquiryRetentionDays: 365 },
        afterJson: { guestInquiryRetentionDays: 730 },
      });
    });

    it('saving the same retention days is not a change', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(savedRow);
      await service.update(opsAdmin, { guestInquiryRetentionDays: 365 });
      expect(prisma.v1SiteInfoSettings.upsert).not.toHaveBeenCalled();
    });

    it('no effective change → no write and no audit entry, so the last editor stays as is', async () => {
      prisma.v1SiteInfoSettings.findUnique.mockResolvedValue(savedRow);
      await service.update(opsAdmin, { companyName: '팀밋 주식회사' });
      expect(prisma.v1SiteInfoSettings.upsert).not.toHaveBeenCalled();
      expect(adminContext.logAdminAction).not.toHaveBeenCalled();
    });

    it('writes and audits inside one transaction', async () => {
      await service.update(opsAdmin, { companyName: '팀밋' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(adminContext.logAdminAction.mock.calls[0][2]).toBe(prisma);
    });
  });
});

// 웹 lib/public-site/site-info.test.tsx 가 같은 표로 formatGuestInquiryRetention 을 고정한다 — 둘 중 하나만 바꾸면 한쪽이 red.
describe('formatGuestInquiryRetention', () => {
  it.each([
    [365, '문의 처리 완료 후 1년'],
    [730, '문의 처리 완료 후 2년'],
    [3650, '문의 처리 완료 후 10년'],
    [1, '문의 처리 완료 후 1일'],
    [180, '문의 처리 완료 후 180일'],
    [366, '문의 처리 완료 후 366일'],
  ])('%i days → %s', (days, text) => {
    expect(formatGuestInquiryRetention(days)).toBe(text);
  });
});

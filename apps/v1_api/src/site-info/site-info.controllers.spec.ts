import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminSiteInfoController } from './admin-site-info.controller';
import { PublicSiteInfoController } from './public-site-info.controller';
import { SiteInfoSettingsService } from './site-info-settings.service';

const user = { id: 'user-1', email: 'someone@example.com', accountStatus: 'active', onboardingStatus: 'completed' } as never;

function adminRow(adminRole: 'owner' | 'ops' | 'support') {
  return { id: 'admin-row-1', userId: 'user-1', adminRole, status: 'active', user: { accountStatus: 'active' } };
}

describe('site-info controllers', () => {
  const prisma = { v1AdminUser: { findUnique: jest.fn() } };
  const settings = { getForAdmin: jest.fn(), update: jest.fn(), getPublic: jest.fn() };
  // 실제 AdminContextService 로 권한 판정을 태운다 — mock 이면 403 계약을 검증하지 못한다.
  const adminContext = new AdminContextService(prisma as unknown as PrismaService);
  const admin = new AdminSiteInfoController(settings as unknown as SiteInfoSettingsService, adminContext);

  beforeEach(() => jest.clearAllMocks());

  it('admin controller sits behind V1AuthGuard; the public one has no guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminSiteInfoController)).toEqual([V1AuthGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicSiteInfoController)).toBeUndefined();
  });

  it('GET rejects a signed-in user with no admin row (403) before reading settings', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(admin.get(user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings.getForAdmin).not.toHaveBeenCalled();
  });

  it('PUT rejects a non-admin (403) without writing', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(admin.update(user, { companyName: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings.update).not.toHaveBeenCalled();
  });

  it('support admin may read but PUT is 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(adminRow('support'));
    settings.getForAdmin.mockResolvedValue({ companyName: null });

    await expect(admin.get(user)).resolves.toEqual({ companyName: null });
    await expect(admin.update(user, { companyName: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(settings.update).not.toHaveBeenCalled();
  });

  it.each(['ops', 'owner'] as const)('%s admin PUT forwards the DTO with the resolved admin', async (role) => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(adminRow(role));
    await admin.update(user, { companyName: 'x' });
    expect(settings.update).toHaveBeenCalledWith(
      { id: 'admin-row-1', userId: 'user-1', adminRole: role, status: 'active' },
      { companyName: 'x' },
    );
  });

  it('public GET sets a shared cache header', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, PublicSiteInfoController.prototype.get);
    expect(headers).toEqual([{ name: 'Cache-Control', value: 'public, max-age=300' }]);
  });
});

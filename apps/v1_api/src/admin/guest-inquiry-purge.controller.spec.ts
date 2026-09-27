import { BadRequestException, ForbiddenException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurgeGuestInquiriesDto } from './dto/guest-inquiry-purge.dto';
import { GuestInquiryPurgeController } from './guest-inquiry-purge.controller';
import { GuestInquiryPurgeService } from './guest-inquiry-purge.service';

const user = { id: 'user-1', email: 'someone@example.com', accountStatus: 'active', onboardingStatus: 'completed' } as never;
const adminRow = (adminRole: 'owner' | 'ops' | 'support') => ({
  id: 'admin-row-1',
  userId: 'user-1',
  adminRole,
  status: 'active',
  user: { accountStatus: 'active' },
});

describe('GuestInquiryPurgeController', () => {
  const prisma = { v1AdminUser: { findUnique: jest.fn() } };
  const purgeService = { listCandidates: jest.fn(), purge: jest.fn() };
  // 실제 AdminContextService 로 권한 판정을 태운다 — mock 이면 403 계약을 검증하지 못한다.
  const controller = new GuestInquiryPurgeController(
    purgeService as unknown as GuestInquiryPurgeService,
    new AdminContextService(prisma as unknown as PrismaService),
  );

  beforeEach(() => jest.clearAllMocks());

  it('sits behind V1AuthGuard and answers the purge with 200', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GuestInquiryPurgeController)).toEqual([V1AuthGuard]);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, GuestInquiryPurgeController.prototype.purge)).toBe(HttpStatus.OK);
  });

  it('a signed-in non-admin gets 403 on the candidate list', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(controller.listCandidates(user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(purgeService.listCandidates).not.toHaveBeenCalled();
  });

  it('support may see the candidates but the purge is 403 without touching data', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(adminRow('support'));
    purgeService.listCandidates.mockResolvedValue({ total: 0 });
    await expect(controller.listCandidates(user)).resolves.toEqual({ total: 0 });
    await expect(controller.purge(user, { scope: 'all' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(purgeService.purge).not.toHaveBeenCalled();
  });

  it.each(['ops', 'owner'] as const)('%s purge is forwarded with the resolved admin', async (role) => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(adminRow(role));
    await controller.purge(user, { scope: 'all' });
    expect(purgeService.purge).toHaveBeenCalledWith(
      { id: 'admin-row-1', userId: 'user-1', adminRole: role, status: 'active' },
      { scope: 'all' },
    );
  });
});

describe('PurgeGuestInquiriesDto via the global ValidationPipe options', () => {
  // main.ts 전역 파이프와 같은 옵션
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: PurgeGuestInquiriesDto });
  const uuid = '00000000-0000-4000-8000-000000000001';

  it('accepts scope=all and scope=selected with ids', async () => {
    await expect(run({ scope: 'all' })).resolves.toBeInstanceOf(PurgeGuestInquiriesDto);
    await expect(run({ scope: 'selected', inquiryIds: [uuid] })).resolves.toMatchObject({ inquiryIds: [uuid] });
  });

  it.each([
    ['missing scope', {}],
    ['unknown scope', { scope: 'everything' }],
    ['selected without ids', { scope: 'selected' }],
    ['selected with an empty list', { scope: 'selected', inquiryIds: [] }],
    ['a non-uuid id', { scope: 'selected', inquiryIds: ['not-a-uuid'] }],
    ['more than 500 ids', { scope: 'selected', inquiryIds: Array.from({ length: 501 }, () => uuid) }],
    ['an unknown field', { scope: 'all', dryRun: true }],
  ])('rejects %s', async (_, body) => {
    await expect(run(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});

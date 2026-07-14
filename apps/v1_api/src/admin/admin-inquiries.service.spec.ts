/**
 * admin-inquiries.service.spec.ts
 *
 * Focused null-safety coverage for AdminService.listInquiries / getInquiry now that
 * V1Inquiry.userId is nullable (guest/비회원 문의 지원). Before this change `row.user`
 * was always a non-null relation object; a guest inquiry row now returns `user: null`
 * and the admin mapper must fall back to guestEmail/guestPhone instead of throwing on
 * `row.user.profile` / `row.user.email`.
 */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

const adminAuthUser = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const nonAdminAuthUser = {
  id: 'regular-user-id',
  email: 'regular@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const activeAdminRecord = {
  id: 'admin-record-id',
  userId: 'admin-user-id',
  adminRole: 'owner' as const,
  status: 'active' as const,
};

function makeGuestInquiryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inquiry-guest-1',
    userId: null,
    guestEmail: 'guest@teameet.test',
    guestPhone: '010-1234-5678',
    category: 'tournament',
    title: '대회 일정 문의',
    status: 'received',
    relatedType: 'tournament',
    relatedId: 'tournament-1',
    createdAt: new Date('2026-07-14T00:00:00.000Z'),
    updatedAt: new Date('2026-07-14T00:00:00.000Z'),
    closedAt: null,
    user: null,
    _count: { replies: 0 },
    ...overrides,
  };
}

describe('AdminService — inquiries null-safety (guest inquiries)', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Inquiry: { findMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Inquiry: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AdminService);
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeAdminRecord);
  });

  afterEach(() => jest.clearAllMocks());

  it('listInquiries throws 403 for non-admin', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.listInquiries(nonAdminAuthUser, {})).rejects.toThrow(ForbiddenException);
  });

  it('listInquiries maps a guest row (user: null) without throwing, using guestEmail as requesterEmail', async () => {
    prisma.v1Inquiry.findMany.mockResolvedValue([makeGuestInquiryRow()]);

    const result = await service.listInquiries(adminAuthUser, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      inquiryId: 'inquiry-guest-1',
      userId: null,
      isGuest: true,
      requesterName: null,
      requesterEmail: 'guest@teameet.test',
      guestEmail: 'guest@teameet.test',
      guestPhone: '010-1234-5678',
    });
  });

  it('listInquiries prefers the member profile nickname over guestEmail when userId is present', async () => {
    prisma.v1Inquiry.findMany.mockResolvedValue([
      makeGuestInquiryRow({
        id: 'inquiry-member-1',
        userId: 'user-1',
        guestEmail: null,
        guestPhone: null,
        user: { email: 'member@teameet.test', profile: { nickname: '멤버닉', displayName: null } },
      }),
    ]);

    const result = await service.listInquiries(adminAuthUser, {});

    expect(result.items[0]).toMatchObject({
      isGuest: false,
      requesterName: '멤버닉',
      requesterEmail: 'member@teameet.test',
    });
  });

  it('getInquiry maps a guest detail row (user: null) without throwing', async () => {
    prisma.v1Inquiry.findUnique.mockResolvedValue({
      ...makeGuestInquiryRow(),
      body: '대회 일정이 언제 확정되나요?',
      contact: null,
      replies: [],
    });

    const result = await service.getInquiry(adminAuthUser, 'inquiry-guest-1');

    expect(result).toMatchObject({
      inquiryId: 'inquiry-guest-1',
      isGuest: true,
      requesterName: null,
      requesterEmail: 'guest@teameet.test',
      guestPhone: '010-1234-5678',
      replies: [],
    });
  });

  it('getInquiry throws 404 with code NOT_FOUND when inquiry is missing', async () => {
    prisma.v1Inquiry.findUnique.mockResolvedValue(null);
    await expect(service.getInquiry(adminAuthUser, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('getPendingInquiryCount throws 403 for non-admin', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.getPendingInquiryCount(nonAdminAuthUser)).rejects.toThrow(ForbiddenException);
    expect(prisma.v1Inquiry.count).not.toHaveBeenCalled();
  });

  it('getPendingInquiryCount counts only received/reviewing (미답변) inquiries, not answered/closed', async () => {
    prisma.v1Inquiry.count.mockResolvedValue(3);

    const result = await service.getPendingInquiryCount(adminAuthUser);

    expect(prisma.v1Inquiry.count).toHaveBeenCalledWith({
      where: { status: { in: ['received', 'reviewing'] } },
    });
    expect(result).toEqual({ count: 3 });
  });
});

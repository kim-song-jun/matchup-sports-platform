import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InquiriesService } from './inquiries.service';

const user = {
  id: 'user-1',
  email: 'user@teameet.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const now = new Date('2026-07-08T00:00:00.000Z');

describe('InquiriesService', () => {
  const prisma = {
    v1Inquiry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  let service: InquiriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InquiriesService(prisma as never);
  });

  it('creates an inquiry for the current user', async () => {
    prisma.v1Inquiry.create.mockResolvedValue({
      id: 'inquiry-1',
      userId: user.id,
      category: 'account',
      title: 'Login issue',
      body: 'I cannot log in.',
      contact: null,
      relatedType: null,
      relatedId: null,
      status: 'received',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    });

    await expect(service.create(user, {
      category: 'account',
      title: ' Login issue ',
      body: ' I cannot log in. ',
    })).resolves.toMatchObject({
      inquiryId: 'inquiry-1',
      status: 'received',
      title: 'Login issue',
    });

    expect(prisma.v1Inquiry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        title: 'Login issue',
        body: 'I cannot log in.',
        contact: null,
      }),
    });
  });

  it('rejects incomplete related target payloads', async () => {
    await expect(service.create(user, {
      category: 'match',
      title: 'Match issue',
      body: 'Need help',
      contact: 'user@teameet.test',
      relatedType: 'match',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists only current user inquiries', async () => {
    prisma.v1Inquiry.findMany.mockResolvedValue([
      {
        id: 'inquiry-1',
        userId: user.id,
        category: 'other',
        title: 'Question',
        body: 'Body',
        contact: null,
        relatedType: null,
        relatedId: null,
        status: 'received',
        createdAt: now,
        updatedAt: now,
        closedAt: null,
      },
    ]);

    await expect(service.list(user, {})).resolves.toEqual({
      items: [expect.objectContaining({ inquiryId: 'inquiry-1' })],
      pageInfo: { nextCursor: null, hasNext: false },
    });
    expect(prisma.v1Inquiry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: user.id },
    }));
  });

  it('blocks access to another user inquiry', async () => {
    prisma.v1Inquiry.findUnique.mockResolvedValue({
      id: 'inquiry-1',
      userId: 'other-user',
    });

    await expect(service.detail(user, 'inquiry-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns not found when inquiry is missing', async () => {
    prisma.v1Inquiry.findUnique.mockResolvedValue(null);
    await expect(service.detail(user, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

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
  const prisma: any = {
    $transaction: jest.fn((callback: (tx: any) => unknown) => callback(prisma)),
    v1Inquiry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    v1TeamContact: {
      findUnique: jest.fn(),
    },
    v1TeamMembership: {
      findFirst: jest.fn(),
    },
    v1OutboxEvent: {
      create: jest.fn(),
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
    expect(prisma.v1OutboxEvent.create).toHaveBeenCalledWith({
      data: {
        businessKey: 'inquiry:inquiry-1:slack-created',
        aggregateType: 'INQUIRY',
        aggregateId: 'inquiry-1',
        type: 'INQUIRY_SLACK_NOTIFICATION',
        payload: {
          inquiryId: 'inquiry-1',
          category: 'account',
          title: 'Login issue',
          relatedType: null,
          relatedId: null,
          createdAt: now.toISOString(),
        },
      },
    });
    const outboxPayload = prisma.v1OutboxEvent.create.mock.calls[0][0].data.payload;
    expect(outboxPayload).not.toHaveProperty('body');
    expect(outboxPayload).not.toHaveProperty('contact');
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

  it('stores the report reason when the category is report', async () => {
    prisma.v1Inquiry.create.mockResolvedValue({
      id: 'inquiry-2',
      userId: user.id,
      category: 'report',
      title: 'Spam contact requests',
      body: 'This team keeps spamming us.',
      contact: null,
      relatedType: 'team_contact',
      relatedId: 'team-contact-1',
      reportReason: 'spam',
      status: 'received',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
    });

    await expect(service.create(user, {
      category: 'report',
      title: 'Spam contact requests',
      body: 'This team keeps spamming us.',
      relatedType: 'team_contact',
      relatedId: 'team-contact-1',
      reportReason: 'spam',
    })).resolves.toMatchObject({ reportReason: 'spam' });

    expect(prisma.v1Inquiry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reportReason: 'spam' }),
    });
  });

  it('rejects a report reason on a non-report inquiry', async () => {
    await expect(service.create(user, {
      category: 'account',
      title: 'Login issue',
      body: 'I cannot log in.',
      reportReason: 'spam',
    })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_INQUIRY_REPORT_REASON' }),
    });
    expect(prisma.v1Inquiry.create).not.toHaveBeenCalled();
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

  describe('신고 대상 팀 기록', () => {
    it('신고자가 fromTeam 소속이면 대상은 toTeam 이다', async () => {
      prisma.v1TeamContact.findUnique.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B' });
      prisma.v1TeamMembership.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.teamId === 'A' ? { id: 'm1' } : null),
      );

      await service.create(user, {
        category: 'report', relatedType: 'team_contact', relatedId: 'c1',
        reportReason: 'spam', title: '신고', body: '내용',
      } as any);

      expect(prisma.v1Inquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reportedTeamId: 'B' }) }),
      );
    });

    it('신고자가 toTeam 소속이면 대상은 fromTeam 이다', async () => {
      prisma.v1TeamContact.findUnique.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B' });
      prisma.v1TeamMembership.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.teamId === 'B' ? { id: 'm1' } : null),
      );

      await service.create(user, {
        category: 'report', relatedType: 'team_contact', relatedId: 'c1',
        reportReason: 'spam', title: '신고', body: '내용',
      } as any);

      expect(prisma.v1Inquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reportedTeamId: 'A' }) }),
      );
    });

    // 남의 컨택 id 를 넣어 신고해도 대상이 정해지지 않는다 — 별도 권한 검사 없이 이것이 방어가 된다.
    it('어느 팀에도 속하지 않으면 대상은 null 이고 접수는 성공한다', async () => {
      prisma.v1TeamContact.findUnique.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B' });
      prisma.v1TeamMembership.findFirst.mockResolvedValue(null);

      await service.create(user, {
        category: 'report', relatedType: 'team_contact', relatedId: 'c1',
        reportReason: 'spam', title: '신고', body: '내용',
      } as any);

      expect(prisma.v1Inquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reportedTeamId: null }) }),
      );
    });

    it('신고가 아닌 문의는 컨택을 조회하지 않는다', async () => {
      await service.create(user, { category: 'account', title: '문의', body: '내용' } as any);

      expect(prisma.v1TeamContact.findUnique).not.toHaveBeenCalled();
    });
  });
});

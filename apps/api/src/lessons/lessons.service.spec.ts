import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { TeamMembershipService } from '../teams/team-membership.service';
import { SportType, LessonType } from '@prisma/client';

const lessonsSettlementsMock = {
  recordSettlement: jest.fn().mockResolvedValue(undefined),
};

describe('LessonsService', () => {
  let service: LessonsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    lesson: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    lessonTicketPlan: {
      findUnique: jest.fn(),
    },
    lessonTicket: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    venue: {
      findUnique: jest.fn(),
    },
  };

  const notificationsServiceMock = {
    create: jest.fn(),
  };

  const teamMembershipServiceMock = {
    assertRole: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.TOSS_SECRET_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: SettlementsService, useValue: lessonsSettlementsMock },
        { provide: TeamMembershipService, useValue: teamMembershipServiceMock },
      ],
    }).compile();

    service = module.get<LessonsService>(LessonsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
    notificationsServiceMock.create.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const mockLessons = [
      {
        id: 'lesson-1',
        title: '풋살 기초 레슨',
        sportType: SportType.futsal,
        type: 'group',
        status: 'open',
        lessonDate: new Date('2026-04-01'),
        host: { id: 'u1', nickname: '코치1', profileImageUrl: null },
      },
      {
        id: 'lesson-2',
        title: '농구 슈팅 클리닉',
        sportType: SportType.basketball,
        type: 'clinic',
        status: 'open',
        lessonDate: new Date('2026-04-02'),
        host: { id: 'u2', nickname: '코치2', profileImageUrl: null },
      },
    ];

    it('should return paginated lessons', async () => {
      mockPrismaService.lesson.findMany.mockResolvedValue(mockLessons);

      const result = await service.findAll({});

      expect(result).toEqual({
        items: mockLessons,
        nextCursor: null,
      });
      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'open' },
          take: 21,
          orderBy: { lessonDate: 'asc' },
        }),
      );
    });

    it('should return nextCursor when there are more results', async () => {
      const manyLessons = Array.from({ length: 21 }, (_, i) => ({
        id: `lesson-${i}`,
        title: `레슨 ${i}`,
        sportType: SportType.futsal,
        status: 'open',
        lessonDate: new Date(),
        host: { id: `u${i}`, nickname: `코치${i}`, profileImageUrl: null },
      }));
      mockPrismaService.lesson.findMany.mockResolvedValue(manyLessons);

      const result = await service.findAll({});

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('lesson-19');
    });

    it('should filter by sportType', async () => {
      mockPrismaService.lesson.findMany.mockResolvedValue([mockLessons[0]]);

      await service.findAll({ sportType: SportType.futsal });

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'open',
            sportType: SportType.futsal,
          }),
        }),
      );
    });

    it('should filter by type', async () => {
      mockPrismaService.lesson.findMany.mockResolvedValue([mockLessons[1]]);

      await service.findAll({ type: 'clinic' });

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'open',
            type: 'clinic',
          }),
        }),
      );
    });

    it('should apply both sportType and type filters together', async () => {
      mockPrismaService.lesson.findMany.mockResolvedValue([]);

      await service.findAll({ sportType: SportType.basketball, type: 'group' });

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'open',
            sportType: SportType.basketball,
            type: 'group',
          },
        }),
      );
    });

    it('should use cursor-based pagination when cursor provided', async () => {
      mockPrismaService.lesson.findMany.mockResolvedValue([mockLessons[1]]);

      await service.findAll({ cursor: 'lesson-1' });

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'lesson-1' },
          skip: 1,
          take: 21,
        }),
      );
    });
  });

  describe('findById', () => {
    const mockLessonDetail = {
      id: 'lesson-1',
      title: '풋살 기초 레슨',
      sportType: SportType.futsal,
      type: 'group',
      status: 'open',
      lessonDate: new Date('2026-04-01'),
      maxParticipants: 10,
      fee: 30000,
      host: {
        id: 'u1',
        nickname: '코치1',
        profileImageUrl: 'https://example.com/img.jpg',
        mannerScore: 4.8,
      },
      team: { id: 'team-1', name: 'FC 서울' },
      ticketPlans: [
        {
          id: 'plan-1',
          lessonId: 'lesson-1',
          name: '10회권',
          type: 'multi',
          price: 80000,
          originalPrice: null,
          totalSessions: 10,
          validDays: null,
          description: '주 2회 수강권',
          isActive: true,
          sortOrder: 0,
        },
      ],
      schedules: [
        {
          id: 'schedule-1',
          lessonId: 'lesson-1',
          sessionDate: new Date('2026-04-02'),
          startTime: '19:00',
          endTime: '20:30',
          maxParticipants: 12,
          note: '실내 코트 B',
          isCancelled: false,
          cancelReason: null,
          _count: {
            attendances: 4,
          },
        },
      ],
    };

    it('should return lesson with host details', async () => {
      mockPrismaService.lesson.findUnique.mockResolvedValue(mockLessonDetail);

      const result = await service.findById('lesson-1');

      expect(result).toEqual({
        ...(({ schedules, ...lessonData }) => lessonData)(mockLessonDetail),
        upcomingSchedules: [
          {
            id: 'schedule-1',
            lessonId: 'lesson-1',
            sessionDate: '2026-04-02',
            startTime: '19:00',
            endTime: '20:30',
            maxParticipants: 12,
            note: '실내 코트 B',
            isCancelled: false,
            attendeeCount: 4,
          },
        ],
      });
      expect(prisma.lesson.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lesson-1' },
          include: expect.objectContaining({
            host: {
              select: {
                id: true,
                nickname: true,
                profileImageUrl: true,
                mannerScore: true,
              },
            },
            team: { select: { id: true, name: true } },
            ticketPlans: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                lessonId: true,
                name: true,
                type: true,
                price: true,
                originalPrice: true,
                totalSessions: true,
                validDays: true,
                description: true,
                isActive: true,
                sortOrder: true,
              },
            },
            schedules: expect.objectContaining({
              where: expect.objectContaining({
                sessionDate: expect.objectContaining({
                  gte: expect.any(Date),
                }),
              }),
              orderBy: [{ sessionDate: 'asc' }, { startTime: 'asc' }],
              select: expect.objectContaining({
                id: true,
                lessonId: true,
                sessionDate: true,
                startTime: true,
                endTime: true,
                maxParticipants: true,
                note: true,
                isCancelled: true,
                cancelReason: true,
              }),
            }),
          }),
        }),
      );
    });

    it('should throw NotFoundException when lesson does not exist', async () => {
      mockPrismaService.lesson.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('non-existent')).rejects.toThrow(
        '강좌를 찾을 수 없습니다.',
      );
    });
  });

  describe('create', () => {
    const createData = {
      sportType: SportType.futsal,
      type: LessonType.group_lesson,
      title: '풋살 기초 레슨',
      description: '초보자를 위한 레슨',
      venueName: '강남 풋살장',
      lessonDate: '2026-04-10',
      startTime: '18:00',
      endTime: '20:00',
      maxParticipants: 10,
      fee: 30000,
      coachName: '김코치',
      coachBio: '프로 경력 10년',
    };

    const createdLesson = {
      id: 'lesson-new',
      hostId: 'user-1',
      ...createData,
      lessonDate: new Date('2026-04-10'),
      levelMin: 1,
      levelMax: 5,
      imageUrls: [],
    };

    it('should create a new lesson', async () => {
      mockPrismaService.lesson.create.mockResolvedValue(createdLesson);

      const result = await service.create('user-1', 'user', createData);

      expect(result).toEqual(createdLesson);
      expect(prisma.lesson.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hostId: 'user-1',
          title: '풋살 기초 레슨',
          sportType: SportType.futsal,
          type: LessonType.group_lesson,
          maxParticipants: 10,
          fee: 30000,
          coachName: '김코치',
          coachBio: '프로 경력 10년',
          startTime: '18:00',
          endTime: '20:00',
        }),
        include: expect.objectContaining({
          host: expect.any(Object),
          team: expect.any(Object),
          ticketPlans: expect.any(Object),
        }),
      });
    });

    it('should throw ForbiddenException when caller lacks manager role for team-affiliated lesson', async () => {
      teamMembershipServiceMock.assertRole.mockRejectedValue(
        new ForbiddenException('팀 권한이 부족합니다'),
      );

      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.create('user-99', 'user', { ...createData, teamId: 'team-1' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use default values for optional fields', async () => {
      const minimalData = {
        sportType: SportType.basketball,
        type: LessonType.clinic,
        title: '농구 클리닉',
        lessonDate: '2026-04-15',
        startTime: '10:00',
        endTime: '12:00',
        maxParticipants: 8,
      };

      mockPrismaService.lesson.create.mockResolvedValue({
        id: 'lesson-min',
        hostId: 'user-1',
        ...minimalData,
        lessonDate: new Date('2026-04-15'),
      });

      await service.create('user-1', 'user', minimalData);

      expect(prisma.lesson.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hostId: 'user-1',
          fee: 0,
          levelMin: 1,
          levelMax: 5,
          imageUrls: [],
        }),
        include: expect.objectContaining({
          host: expect.any(Object),
          team: expect.any(Object),
          ticketPlans: expect.any(Object),
        }),
      });
    });
  });

  describe('findMyTickets', () => {
    it('returns only paid tickets for the authenticated user', async () => {
      const mockTickets = [
        {
          id: 'ticket-1',
          userId: 'user-1',
          status: 'active',
          paymentId: 'payment-1',
          paidAmount: 80000,
          purchasedAt: new Date('2026-04-11T09:00:00.000Z'),
          usedSessions: 2,
          totalSessions: 10,
          startDate: new Date('2026-04-11'),
          expiresAt: new Date('2026-05-11'),
          plan: {
            id: 'plan-1',
            lessonId: 'lesson-1',
            name: '10회권',
            type: 'multi',
            price: 80000,
            originalPrice: null,
            totalSessions: 10,
            validDays: null,
            description: '주 2회 수강권',
            isActive: true,
            sortOrder: 0,
          },
          lesson: {
            id: 'lesson-1',
            hostId: 'host-1',
            sportType: SportType.futsal,
            type: 'group_lesson',
            title: '풋살 기초 레슨',
            description: null,
            venueName: '강남 풋살파크',
            lessonDate: new Date('2026-04-12'),
            startTime: '10:00',
            endTime: '12:00',
            maxParticipants: 12,
            currentParticipants: 5,
            fee: 80000,
            levelMin: 1,
            levelMax: 3,
            status: 'open',
            coachName: '김코치',
            coachBio: null,
            imageUrls: [],
          },
        },
      ];

      mockPrismaService.lessonTicket.findMany.mockResolvedValue(mockTickets);

      const result = await service.findMyTickets('user-1');

      expect(result).toEqual(mockTickets);
      expect(prisma.lessonTicket.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          paymentId: { not: null },
        },
        orderBy: { purchasedAt: 'desc' },
        include: {
          plan: {
            select: {
              id: true,
              lessonId: true,
              name: true,
              type: true,
              price: true,
              originalPrice: true,
              totalSessions: true,
              validDays: true,
              description: true,
              isActive: true,
              sortOrder: true,
            },
          },
          lesson: {
            select: {
              id: true,
              hostId: true,
              sportType: true,
              type: true,
              title: true,
              description: true,
              venueName: true,
              lessonDate: true,
              startTime: true,
              endTime: true,
              maxParticipants: true,
              currentParticipants: true,
              fee: true,
              levelMin: true,
              levelMax: true,
              status: true,
              coachName: true,
              coachBio: true,
              imageUrls: true,
            },
          },
        },
      });
    });
  });

  // ── purchaseTicket ──────────────────────────────────────────────────────────

  describe('purchaseTicket', () => {
    const mockPlan = {
      id: 'plan-1',
      lessonId: 'lesson-1',
      name: '10회권',
      type: 'multi',
      price: 80000,
      totalSessions: 10,
      validDays: null,
      isActive: true,
      lesson: { id: 'lesson-1', title: '풋살 기초 레슨', hostId: 'instructor-1' },
    };

    const mockTicket = {
      id: 'ticket-1',
      planId: 'plan-1',
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'active',
      totalSessions: 10,
      usedSessions: 0,
      paidAmount: 80000,
      paymentId: null,
      purchasedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('creates a ticket and returns ticket + payment prepare info', async () => {
      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.lessonTicket.findFirst.mockResolvedValue(null);
      mockPrismaService.lessonTicket.create.mockResolvedValue(mockTicket);

      const result = await service.purchaseTicket('user-1', 'plan-1');

      expect(result).toHaveProperty('ticket');
      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('orderId');
      expect(result.payment.orderId).toMatch(/^MU-LESSON-/);
      expect(result.payment).toHaveProperty('amount', 80000);
      expect(result.payment).toHaveProperty('ticketId', 'ticket-1');
    });

    it('reuses the latest unpaid draft ticket for the same plan', async () => {
      const draftTicket = {
        ...mockTicket,
        id: 'ticket-draft',
      };

      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrismaService.lessonTicket.findFirst.mockResolvedValue(draftTicket);

      const result = await service.purchaseTicket('user-1', 'plan-1');

      expect(mockPrismaService.lessonTicket.create).not.toHaveBeenCalled();
      expect(result.payment).toEqual({
        orderId: 'MU-LESSON-ticket-draft',
        amount: 80000,
        ticketId: 'ticket-draft',
      });
    });

    it('throws NotFoundException when plan does not exist', async () => {
      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue(null);

      await expect(service.purchaseTicket('user-1', 'no-such-plan')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when plan is inactive', async () => {
      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue({ ...mockPlan, isActive: false });

      await expect(service.purchaseTicket('user-1', 'plan-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when host tries to buy own lesson ticket', async () => {
      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue(mockPlan);

      await expect(service.purchaseTicket('instructor-1', 'plan-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── confirmTicketPayment ────────────────────────────────────────────────────

  describe('confirmTicketPayment (mock Toss mode)', () => {
    const mockTicketWithRelations = {
      id: 'ticket-1',
      planId: 'plan-1',
      userId: 'user-1',
      lessonId: 'lesson-1',
      status: 'active',
      paidAmount: 80000,
      paymentId: null,
      plan: { price: 80000, validDays: null },
      lesson: { title: '풋살 기초 레슨', hostId: 'instructor-1' },
    };

    it('updates ticket with paymentId and notifies instructor', async () => {
      const updated = { ...mockTicketWithRelations, paymentId: 'pk-mock' };
      mockPrismaService.lessonTicket.findUnique.mockResolvedValue(mockTicketWithRelations);
      mockPrismaService.lessonTicket.update.mockResolvedValue(updated);

      const result = await service.confirmTicketPayment('ticket-1', 'pk-mock', 'user-1');

      expect(result.paymentId).toBe('pk-mock');
      expect(mockPrismaService.lessonTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'pk-mock',
            status: 'active',
            purchasedAt: expect.any(Date),
            startDate: expect.any(Date),
          }),
        }),
      );
      expect(notificationsServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'instructor-1',
          type: 'marketplace_order',
        }),
      );
    });

    it('throws NotFoundException when ticket does not exist', async () => {
      mockPrismaService.lessonTicket.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmTicketPayment('no-such', 'pk-mock', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the ticket', async () => {
      mockPrismaService.lessonTicket.findUnique.mockResolvedValue({
        ...mockTicketWithRelations,
        userId: 'other-user',
      });

      await expect(
        service.confirmTicketPayment('ticket-1', 'pk-mock', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when ticket is already paid', async () => {
      mockPrismaService.lessonTicket.findUnique.mockResolvedValue({
        ...mockTicketWithRelations,
        paymentId: 'existing-key',
      });

      await expect(
        service.confirmTicketPayment('ticket-1', 'pk-mock', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a paid ticket is confirmed without paymentKey', async () => {
      mockPrismaService.lessonTicket.findUnique.mockResolvedValue(mockTicketWithRelations);

      await expect(
        service.confirmTicketPayment('ticket-1', undefined, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses a backend-generated paymentId for free tickets', async () => {
      const freeTicket = {
        ...mockTicketWithRelations,
        paidAmount: 0,
        plan: { price: 0, validDays: 30 },
      };
      const updated = { ...freeTicket, paymentId: 'FREE-LESSON-ticket-1' };
      mockPrismaService.lessonTicket.findUnique.mockResolvedValue(freeTicket);
      mockPrismaService.lessonTicket.update.mockResolvedValue(updated);

      const result = await service.confirmTicketPayment('ticket-1', undefined, 'user-1');

      expect(result.paymentId).toBe('FREE-LESSON-ticket-1');
      expect(mockPrismaService.lessonTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'FREE-LESSON-ticket-1',
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});

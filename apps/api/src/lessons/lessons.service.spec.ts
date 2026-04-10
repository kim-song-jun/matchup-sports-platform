import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
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
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const notificationsServiceMock = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    delete process.env.TOSS_SECRET_KEY;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: SettlementsService, useValue: lessonsSettlementsMock },
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
        sportType: 'FUTSAL',
        type: 'group',
        status: 'open',
        lessonDate: new Date('2026-04-01'),
        host: { id: 'u1', nickname: '코치1', profileImageUrl: null },
      },
      {
        id: 'lesson-2',
        title: '농구 슈팅 클리닉',
        sportType: 'BASKETBALL',
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
        sportType: 'FUTSAL',
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

      await service.findAll({ sportType: 'FUTSAL' });

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'open',
            sportType: 'FUTSAL',
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

      await service.findAll({ sportType: 'BASKETBALL', type: 'group' });

      expect(prisma.lesson.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'open',
            sportType: 'BASKETBALL',
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
      sportType: 'FUTSAL',
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
    };

    it('should return lesson with host details', async () => {
      mockPrismaService.lesson.findUnique.mockResolvedValue(mockLessonDetail);

      const result = await service.findById('lesson-1');

      expect(result).toEqual(mockLessonDetail);
      expect(prisma.lesson.findUnique).toHaveBeenCalledWith({
        where: { id: 'lesson-1' },
        include: {
          host: {
            select: {
              id: true,
              nickname: true,
              profileImageUrl: true,
              mannerScore: true,
            },
          },
        },
      });
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

      const result = await service.create('user-1', createData);

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
      });
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

      await service.create('user-1', minimalData);

      expect(prisma.lesson.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hostId: 'user-1',
          fee: 0,
          levelMin: 1,
          levelMax: 5,
          imageUrls: [],
        }),
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
      mockPrismaService.lessonTicket.create.mockResolvedValue(mockTicket);

      const result = await service.purchaseTicket('user-1', 'plan-1');

      expect(result).toHaveProperty('ticket');
      expect(result).toHaveProperty('payment');
      expect(result.payment).toHaveProperty('orderId');
      expect(result.payment.orderId).toMatch(/^MU-LESSON-/);
      expect(result.payment).toHaveProperty('amount', 80000);
      expect(result.payment).toHaveProperty('ticketId', 'ticket-1');
    });

    it('throws NotFoundException when plan does not exist', async () => {
      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue(null);

      await expect(service.purchaseTicket('user-1', 'no-such-plan')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when plan is inactive', async () => {
      mockPrismaService.lessonTicketPlan.findUnique.mockResolvedValue({ ...mockPlan, isActive: false });

      await expect(service.purchaseTicket('user-1', 'plan-1')).rejects.toThrow(BadRequestException);
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
      plan: { price: 80000 },
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
          data: expect.objectContaining({ paymentId: 'pk-mock', status: 'active' }),
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
  });
});

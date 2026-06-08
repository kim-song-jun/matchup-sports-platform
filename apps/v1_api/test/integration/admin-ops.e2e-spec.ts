import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { V1AuthGuard } from '../../src/auth/v1-auth.guard';
import { AdminOpsService } from '../../src/admin/admin-ops.service';
import { AdminController, AdminPaymentsWebhookController } from '../../src/admin/admin.controller';
import { AdminService } from '../../src/admin/admin.service';
import { TossPaymentsService } from '../../src/admin/toss-payments.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const activeUser = {
  id: 'user-admin-1',
  email: 'admin@teameet.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

const activeOpsAdmin = {
  id: 'admin-ops-1',
  userId: activeUser.id,
  adminRole: 'ops',
  status: 'active',
};

const supportAdmin = {
  id: 'admin-support-1',
  userId: activeUser.id,
  adminRole: 'support',
  status: 'active',
};

describe('Admin ops integration', () => {
  let app: INestApplication;

  const prisma = {
    v1User: { findFirst: jest.fn() },
    v1AdminUser: { findUnique: jest.fn() },
    v1OpsReport: { count: jest.fn(), findUnique: jest.fn() },
    v1OpsDispute: { count: jest.fn() },
    v1PaymentOrder: { count: jest.fn() },
    v1PaymentRefund: { count: jest.fn() },
    v1SettlementBatch: { count: jest.fn() },
    v1PayoutAttempt: { count: jest.fn() },
    v1OpsCaseEvent: { findMany: jest.fn() },
  };

  const tossPayments = {
    confirmPayment: jest.fn(),
    cancelPayment: jest.fn(),
    payoutContractUnavailable: jest.fn(() => ({
      code: 'TOSS_PAYOUT_CONTRACT_REQUIRED',
      message: 'Payout contract is not ready',
    })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController, AdminPaymentsWebhookController],
      providers: [
        AdminService,
        AdminOpsService,
        V1AuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: TossPaymentsService, useValue: tossPayments },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.v1User.findFirst.mockResolvedValue(activeUser);
    prisma.v1AdminUser.findUnique.mockResolvedValue(activeOpsAdmin);
    prisma.v1OpsReport.count.mockResolvedValue(0);
    prisma.v1OpsDispute.count.mockResolvedValue(0);
    prisma.v1PaymentOrder.count.mockResolvedValue(0);
    prisma.v1PaymentRefund.count.mockResolvedValue(0);
    prisma.v1SettlementBatch.count.mockResolvedValue(0);
    prisma.v1PayoutAttempt.count.mockResolvedValue(0);
    prisma.v1OpsCaseEvent.findMany.mockResolvedValue([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects ops overview without v1 authentication', async () => {
    await request(app.getHttpServer()).get('/admin/ops/overview').expect(401);
    expect(prisma.v1User.findFirst).not.toHaveBeenCalled();
  });

  it('rejects authenticated non-admin users before queue reads', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .get('/admin/ops/overview')
      .set('x-v1-user-id', activeUser.id)
      .expect(403);

    expect(prisma.v1OpsReport.count).not.toHaveBeenCalled();
  });

  it('allows support admins to read ops overview', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdmin);
    prisma.v1OpsReport.count.mockResolvedValue(2);
    prisma.v1OpsDispute.count.mockResolvedValue(3);
    prisma.v1PaymentOrder.count.mockResolvedValue(4);
    prisma.v1PaymentRefund.count.mockResolvedValue(5);
    prisma.v1SettlementBatch.count.mockResolvedValue(6);
    prisma.v1PayoutAttempt.count.mockResolvedValue(1);

    const response = await request(app.getHttpServer())
      .get('/admin/ops/overview')
      .set('x-v1-user-id', activeUser.id)
      .expect(200);

    expect(response.body.queues).toEqual({
      openReports: 2,
      activeDisputes: 3,
      pendingPayments: 4,
      refundRequests: 5,
      settlementReviews: 6,
      payoutFailures: 1,
    });
  });

  it('blocks support admins from report mutations', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdmin);

    await request(app.getHttpServer())
      .post('/admin/reports/report-1/actions')
      .set('x-v1-user-id', activeUser.id)
      .send({ action: 'resolve', reason: '처리 완료' })
      .expect(403);

    expect(prisma.v1OpsReport.findUnique).not.toHaveBeenCalled();
  });

  it('requires a non-empty trimmed reason before report action service lookup', async () => {
    await request(app.getHttpServer())
      .post('/admin/reports/report-1/actions')
      .set('x-v1-user-id', activeUser.id)
      .send({ action: 'resolve', reason: '   ' })
      .expect(400);

    expect(prisma.v1AdminUser.findUnique).not.toHaveBeenCalled();
    expect(prisma.v1OpsReport.findUnique).not.toHaveBeenCalled();
  });
});

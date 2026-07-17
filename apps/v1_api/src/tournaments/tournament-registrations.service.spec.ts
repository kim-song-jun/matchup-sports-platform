/**
 * tournament-registrations.service.spec.ts
 *
 * Contract tests for the team-unit registration state machine: manager+ gate,
 * tournament open/deadline guards, submit agreements + payment-method rules,
 * and cancel-request transitions. Asserts observable behaviour only.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TournamentPaymentExpiryService } from './tournament-payment-expiry.service';
import { TournamentRegistrationsService } from './tournament-registrations.service';

const manager = { id: 'manager-user', email: 'm@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

function openTournament(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    status: 'open',
    entryFee: 120000,
    bankName: '국민은행',
    bankAccount: '123-456',
    bankHolder: '팀밋',
    teamCount: 8,
    registrationDeadlineAt: null,
    deletedAt: null,
    ...overrides,
  };
}
function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1', tournamentId: 'tournament-1', teamId: 'team-1', appliedByUserId: 'manager-user',
    status: 'draft', depositorName: null, agreedRules: false, agreedPrivacy: false, agreedRefund: false,
    agreedMediaConsent: false, confirmedAt: null, rosterLockedAt: null, cancelRequestedAt: null,
    cancelPreviousStatus: null, cancelReason: null,
    createdAt: new Date('2026-06-14T00:00:00Z'), updatedAt: new Date('2026-06-14T00:00:00Z'), ...overrides,
  };
}
function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1', registrationId: 'reg-1', method: 'bank_transfer', provider: null, providerTxId: null,
    amount: 120000, status: 'ready', paidAt: null, cancelledAt: null, refundedAt: null,
    confirmedByAdminUserId: null, rawWebhookRef: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}
const validSubmit = { paymentMethod: 'bank_transfer' as const, depositorName: '홍길동', agreedRules: true, agreedPrivacy: true, agreedRefund: true };

describe('TournamentRegistrationsService', () => {
  let service: TournamentRegistrationsService;
  let prisma: {
    v1TeamMembership: { findFirst: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentRegistration: { findUnique: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock; count: jest.Mock };
    v1TournamentPayment: { upsert: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    v1TournamentPlayer: { count: jest.Mock; groupBy: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let notifications: { emitNotification: jest.Mock };

  beforeEach(async () => {
    prisma = {
      v1TeamMembership: { findFirst: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentRegistration: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      v1TournamentPayment: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      v1TournamentPlayer: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
      // R17-005 / R16-001 / R17-006: $queryRaw is called inside transactions for
      // SELECT FOR UPDATE; a no-op mock is sufficient for unit tests.
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));
    // 기본: 매니저 권한 통과
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      role: 'manager',
      team: { sportId: 'sport-futsal' },
    });

    notifications = { emitNotification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentRegistrationsService,
        TournamentPaymentExpiryService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(TournamentRegistrationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────────

  it('create: non-manager → 403', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toThrow(ForbiddenException);
  });

  it('create: tournament not open → 409 TOURNAMENT_NOT_OPEN', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ status: 'draft' }));
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_OPEN' },
    });
  });

  it('create: deadline passed → 409 REGISTRATION_DEADLINE_PASSED', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ registrationDeadlineAt: new Date('2000-01-01') }));
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'REGISTRATION_DEADLINE_PASSED' },
    });
  });

  it('create: already registered (active) → returns existing registration for managed team', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue({
      method: 'bank_transfer', status: 'paid', amount: 120000, paidAt: new Date('2026-06-14T01:00:00Z'),
      createdAt: new Date('2026-06-14T00:00:00Z'),
    });
    prisma.v1TournamentPlayer.count.mockResolvedValue(4);

    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).resolves.toMatchObject({
      id: 'reg-1',
      status: 'confirmed',
      playerCount: 4,
      payment: { method: 'bank_transfer', status: 'paid', amount: 120000 },
    });
  });

  it('create: manager + open + no existing → draft', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.create.mockResolvedValue(registrationRow());
    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });
    expect(result).toMatchObject({ id: 'reg-1', status: 'draft', playerCount: 0 });
  });

  it('create: managed team belongs to another sport → 409 TEAM_SPORT_MISMATCH', async () => {
    // Given: a futsal tournament and a running team managed by the caller.
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      role: 'manager',
      team: { sportId: 'sport-running' },
    });
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.create.mockResolvedValue(registrationRow());

    // When / Then: the registration boundary rejects the cross-sport team.
    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'TEAM_SPORT_MISMATCH' },
    });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
  });

  it('create: capacity full from confirmed plus payment-stage registrations → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);

    await expect(service.create(manager, 'tournament-1', { teamId: 'team-1' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
  });

  it('create: P2002 after race returns the team-scoped registration when it now exists', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tournament_id', 'team_id'] },
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(registrationRow({ id: 'race-reg-1' }));
    prisma.v1TournamentRegistration.create.mockRejectedValue(p2002);
    prisma.v1TournamentPlayer.count.mockResolvedValue(1);

    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });

    expect(result).toMatchObject({ id: 'race-reg-1', status: 'draft', playerCount: 1 });
  });

  it('create: P2002 without team-scoped row reports unique scope mismatch', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['tournament_id', 'applied_by_user_id'] },
    });
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    prisma.v1TournamentRegistration.create.mockRejectedValue(p2002);

    await expect(service.create(manager, 'tournament-1', { teamId: 'team-2' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_REGISTRATION_UNIQUE_SCOPE_MISMATCH' },
    });
  });

  it('create: existing draft → resumes same draft instead of ALREADY_REGISTERED', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ id: 'draft-reg-1' }));
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);

    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });

    expect(result).toMatchObject({ id: 'draft-reg-1', status: 'draft', playerCount: 2 });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('create: reactivates a previously cancelled registration (unique constraint) → draft', async () => {
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'draft' }));
    const result = await service.create(manager, 'tournament-1', { teamId: 'team-1' });
    expect(result).toMatchObject({ status: 'draft' });
    expect(prisma.v1TournamentRegistration.create).not.toHaveBeenCalled();
  });

  // ─── submit ───────────────────────────────────────────────────────────────────

  it('submit: not draft → 409 REGISTRATION_NOT_DRAFT', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_DRAFT' },
    });
  });

  it('submit: missing agreements → 400 AGREEMENTS_REQUIRED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    await expect(
      service.submit(manager, 'tournament-1', 'reg-1', { ...validSubmit, agreedRefund: false }),
    ).rejects.toMatchObject({ response: { code: 'AGREEMENTS_REQUIRED' } });
  });

  it('submit: bank_transfer without depositorName → 400 DEPOSITOR_NAME_REQUIRED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    await expect(
      service.submit(manager, 'tournament-1', 'reg-1', { ...validSubmit, depositorName: '   ' }),
    ).rejects.toMatchObject({ response: { code: 'DEPOSITOR_NAME_REQUIRED' } });
  });

  it('submit: paid bank transfer without account instructions is rejected before the payment clock starts', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(
      openTournament({ bankName: null, bankAccount: null, bankHolder: null }),
    );

    await expect(
      service.submit(manager, 'tournament-1', 'reg-1', validSubmit),
    ).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_PAYMENT_INSTRUCTIONS_MISSING' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
  });

  it('submit: draft team no longer matches the tournament sport → 409 TEAM_SPORT_MISMATCH', async () => {
    // Given: a draft registration whose managed team belongs to a different sport.
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({
      id: 'mem-1',
      role: 'manager',
      team: { sportId: 'sport-running' },
    });

    // When / Then: submission rechecks the current team and tournament contract.
    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'TEAM_SPORT_MISMATCH' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
  });

  it('submit: valid bank_transfer → awaiting_payment + payment(ready) created', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment', depositorName: '홍길동' }));
    const paymentCreatedAt = new Date('2026-06-14T00:00:00.000Z');
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow({ createdAt: paymentCreatedAt }));

    const result = await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);
    expect(result).toMatchObject({
      status: 'awaiting_payment',
      payment: {
        method: 'bank_transfer',
        status: 'ready',
        amount: 120000,
        paymentDueAt: '2026-06-14T02:00:00.000Z',
      },
      paymentInstructions: {
        bankName: '국민은행',
        bankAccount: '123-456',
        bankHolder: '팀밋',
      },
    });
    expect(prisma.v1TournamentPayment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ method: 'bank_transfer', amount: 120000, status: 'ready' }) }),
    );
  });

  it('submit: returns the account instructions re-read under the tournament lock', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst
      .mockResolvedValueOnce(openTournament({ bankAccount: 'before-lock' }))
      .mockResolvedValueOnce(openTournament({ bankAccount: 'after-lock' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'awaiting_payment', depositorName: '홍길동' }),
    );
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    const result = await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(result.paymentInstructions).toMatchObject({
      bankAccount: 'after-lock',
    });
  });

  it('submit: confirmed plus payment-stage registrations fill capacity → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);

    await expect(service.submit(manager, 'tournament-1', 'reg-1', validSubmit)).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          status: { in: ['awaiting_payment', 'payment_checking', 'paid', 'confirmed'] },
        }),
      }),
    );
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
    expect(prisma.v1TournamentPayment.upsert).not.toHaveBeenCalled();
  });

  it('submit: emits tournament_registration_submitted to the registration owner', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ appliedByUserId: 'original-applicant' }),
    );
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'awaiting_payment', appliedByUserId: 'original-applicant' }),
    );
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow());

    await service.submit(manager, 'tournament-1', 'reg-1', validSubmit);

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'original-applicant',
      'tournament_registration_submitted',
      'tournament-1',
    );
  });

  it('submit: pg method does not require depositorName', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.upsert.mockResolvedValue(paymentRow({ method: 'pg' }));
    const result = await service.submit(manager, 'tournament-1', 'reg-1', {
      paymentMethod: 'pg', agreedRules: true, agreedPrivacy: true, agreedRefund: true,
    });
    expect(result).toMatchObject({ payment: { method: 'pg' } });
  });

  // ─── cancel-request ─────────────────────────────────────────────────────────────

  it('cancel-request: draft → cancelled (self-service)', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'draft' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    const result = await service.cancelRequest(manager, 'tournament-1', 'reg-1', {});
    expect(result).toMatchObject({ status: 'cancelled' });
  });

  it('cancel-request: confirmed → cancel_requested (admin handles)', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }));
    const result = await service.cancelRequest(manager, 'tournament-1', 'reg-1', { reason: '사정' });
    expect(result).toMatchObject({ status: 'cancel_requested' });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
      }),
    );
  });

  it('cancel-request: already cancelled → 409 NOT_CANCELLABLE', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    await expect(service.cancelRequest(manager, 'tournament-1', 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_CANCELLABLE' },
    });
  });

  // ─── withdrawCancelRequest ─────────────────────────────────────────────────────

  it('withdrawCancelRequest: cancel_requested -> previous status and clears cancel fields', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({
        status: 'cancel_requested',
        cancelPreviousStatus: 'confirmed',
        cancelRequestedAt: new Date('2026-06-15T00:00:00Z'),
        cancelReason: '사정',
      }),
    );
    // R16-001 / R17-006: the function now reads the tournament inside the transaction
    // to guard against admin cancellation and over-capacity restoration.
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({
      method: 'bank_transfer',
      status: 'paid',
      amount: 120000,
      paidAt: null,
    }));

    const result = await service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1');

    expect(result).toMatchObject({ status: 'confirmed' });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'confirmed',
          cancelRequestedAt: null,
          cancelPreviousStatus: null,
          cancelReason: null,
        }),
      }),
    );
  });

  it('withdrawCancelRequest: non cancel_requested -> 409 NOT_WITHDRAWABLE', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    await expect(service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_CANCEL_REQUEST_NOT_WITHDRAWABLE' },
    });
  });

  it('withdrawCancelRequest: R16-001 — tournament cancelled → 409 TOURNAMENT_ALREADY_CANCELLED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    );
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ status: 'cancelled' }));
    await expect(service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_ALREADY_CANCELLED' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('withdrawCancelRequest: R17-006 — capacity full → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    // Restoring 'confirmed' (a CAPACITY_HOLD_STATUS) when already at capacity must fail.
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    );
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament({ teamCount: 8 }));
    prisma.v1TournamentRegistration.count.mockResolvedValue(8); // already at limit (excl. current reg)
    await expect(service.withdrawCancelRequest(manager, 'tournament-1', 'reg-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('get: unknown registration → 404', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);
    await expect(service.get(manager, 'tournament-1', 'ghost')).rejects.toThrow(NotFoundException);
  });

  // ─── getMyRegistration ───────────────────────────────────────────────────────

  it('getMyRegistration: returns the caller\'s most-recent registration', async () => {
    const row = registrationRow({ appliedByUserId: manager.id, status: 'awaiting_payment' });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(row);
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    const result = await service.getMyRegistration(manager, 'tournament-1');
    expect(result).toMatchObject({
      id: 'reg-1',
      appliedByUserId: manager.id,
      status: 'awaiting_payment',
      payment: { method: 'bank_transfer', status: 'ready', amount: 120000 },
      paymentInstructions: {
        bankName: '국민은행',
        bankAccount: '123-456',
        bankHolder: '팀밋',
      },
    });
    // Must query by tournamentId AND appliedByUserId — not by a different user's id
    expect(prisma.v1TournamentRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tournamentId: 'tournament-1', appliedByUserId: manager.id }),
      }),
    );
  });

  it('getMyRegistration: overdue awaiting-payment is cancelled before serialization', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-14T02:01:00.000Z'));
    const createdAt = new Date('2026-06-14T00:00:00.000Z');
    const overdueRegistration = registrationRow({ appliedByUserId: manager.id, status: 'awaiting_payment' });
    const overduePayment = paymentRow({ createdAt, status: 'ready' });
    const cancelledRegistration = registrationRow({
      appliedByUserId: manager.id,
      status: 'cancelled',
      cancelReason: '입금 안내 후 2시간 내 입금 확인이 없어 자동 취소됐어요.',
    });
    const cancelledPayment = paymentRow({
      createdAt,
      status: 'cancelled',
      cancelledAt: new Date('2026-06-14T02:01:00.000Z'),
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(overdueRegistration);
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(overduePayment);
    prisma.v1TournamentRegistration.update.mockResolvedValue(cancelledRegistration);
    prisma.v1TournamentPayment.update.mockResolvedValue(cancelledPayment);

    const result = await service.getMyRegistration(manager, 'tournament-1');

    expect(result).toMatchObject({
      status: 'cancelled',
      cancelReason: '입금 안내 후 2시간 내 입금 확인이 없어 자동 취소됐어요.',
      payment: {
        status: 'cancelled',
        paymentDueAt: '2026-06-14T02:00:00.000Z',
      },
    });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'cancelled',
          cancelReason: '입금 안내 후 2시간 내 입금 확인이 없어 자동 취소됐어요.',
        }),
      }),
    );
    expect(prisma.v1TournamentPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    jest.useRealTimers();
  });

  it('getMyRegistration: 404 TOURNAMENT_REGISTRATION_NOT_FOUND when no registration exists', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);
    await expect(service.getMyRegistration(manager, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_REGISTRATION_NOT_FOUND' },
    });
  });

  it('getMyRegistration: ignores registrations belonging to other users', async () => {
    // Simulate other user's registration being returned — should NOT happen because
    // the where clause filters by appliedByUserId. We verify by checking the query args.
    const otherUser = { id: 'other-user', email: 'o@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null); // correct: no result for this user
    await expect(service.getMyRegistration(otherUser, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_REGISTRATION_NOT_FOUND' },
    });
    expect(prisma.v1TournamentRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ appliedByUserId: otherUser.id }),
      }),
    );
  });

  it('getMyRegistrations: returns team-scoped registrations for joined teams', async () => {
    const rows = [
      {
        ...registrationRow({ id: 'reg-team-1', teamId: 'team-1', status: 'draft' }),
        payment: null,
        team: { id: 'team-1', name: '1번 팀' },
      },
      {
        ...registrationRow({ id: 'reg-team-2', teamId: 'team-2', status: 'awaiting_payment' }),
        payment: {
          method: 'bank_transfer', status: 'ready', amount: 120000, paidAt: null,
          createdAt: new Date('2026-06-14T00:00:00Z'),
        },
        team: { id: 'team-2', name: '2번 팀' },
      },
    ];
    prisma.v1TournamentRegistration.findMany.mockResolvedValue(rows);
    prisma.v1Tournament.findFirst.mockResolvedValue(openTournament());
    prisma.v1TournamentPlayer.groupBy.mockResolvedValue([
      { registrationId: 'reg-team-1', _count: { registrationId: 1 } },
      { registrationId: 'reg-team-2', _count: { registrationId: 3 } },
    ]);

    const result = await service.getMyRegistrations(manager, 'tournament-1');

    expect(result).toEqual([
      expect.objectContaining({ id: 'reg-team-1', teamId: 'team-1', teamName: '1번 팀', playerCount: 1 }),
      expect.objectContaining({
        id: 'reg-team-2',
        teamId: 'team-2',
        teamName: '2번 팀',
        playerCount: 3,
        paymentInstructions: {
          bankName: '국민은행',
          bankAccount: '123-456',
          bankHolder: '팀밋',
        },
      }),
    ]);
    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          OR: expect.arrayContaining([
            expect.objectContaining({ appliedByUserId: manager.id }),
            expect.objectContaining({
              team: expect.objectContaining({
                memberships: expect.objectContaining({
                  some: expect.objectContaining({ userId: manager.id, status: 'active' }),
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it('getMyRegistrations: returns an empty list when no managed team registration exists', async () => {
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);

    await expect(service.getMyRegistrations(manager, 'tournament-1')).resolves.toEqual([]);
    expect(prisma.v1TournamentPlayer.groupBy).not.toHaveBeenCalled();
  });
});

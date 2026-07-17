/**
 * admin-registrations.service.spec.ts
 *
 * Contract tests for admin registration management: admin-role gates, status
 * transition guards, confirm-payment atomic pair update, confirm/waitlist
 * idempotency, cancel with payment cascade, and roster lock/unlock rules.
 * Tests assert observable behaviour (return shape or thrown error), never mocks
 * for their own sake.
 */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TournamentPaymentExpiryService } from './tournament-payment-expiry.service';
import { AdminRegistrationsService } from './admin-registrations.service';

const opsAuth = { id: 'ops-user-id', email: 'ops@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const supportAuth = { id: 'support-user-id', email: 'support@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const nonAdminAuth = { id: 'plain-user-id', email: 'user@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

const opsAdminRecord = { id: 'ops-admin-id', userId: 'ops-user-id', adminRole: 'ops' as const, status: 'active' as const };
const supportAdminRecord = { id: 'support-admin-id', userId: 'support-user-id', adminRole: 'support' as const, status: 'active' as const };

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    appliedByUserId: 'manager-user',
    status: 'awaiting_payment',
    depositorName: '홍길동',
    agreedRules: true,
    agreedPrivacy: true,
    agreedRefund: true,
    agreedMediaConsent: false,
    confirmedByAdminUserId: null,
    confirmedAt: null,
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    cancelRequestedAt: null,
    cancelReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1',
    registrationId: 'reg-1',
    method: 'bank_transfer',
    provider: null,
    providerTxId: null,
    amount: 120000,
    status: 'ready',
    paidAt: null,
    cancelledAt: null,
    refundedAt: null,
    confirmedByAdminUserId: null,
    rawWebhookRef: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('AdminRegistrationsService', () => {
  let service: AdminRegistrationsService;
  let notifications: { emitNotification: jest.Mock };
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1Tournament: { findFirst: jest.Mock; findUnique: jest.Mock };
    v1TournamentRegistration: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock; count: jest.Mock };
    v1TournamentPayment: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    v1TournamentPlayer: { count: jest.Mock; findMany: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1Tournament: { findFirst: jest.fn(), findUnique: jest.fn() },
      v1TournamentRegistration: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      v1TournamentPayment: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      v1TournamentPlayer: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation((cb: (tx: typeof p) => Promise<unknown>) => cb(p));

    // 기본: 정원(teamCount=8) 충분, 현재 confirmed=0 → AREG-03 통과
    prisma.v1Tournament.findUnique.mockResolvedValue({ id: 'tournament-1', teamCount: 8 });

    notifications = { emitNotification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRegistrationsService,
        TournamentPaymentExpiryService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(AdminRegistrationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── admin-role gates ───────────────────────────────────────────────────────

  it('confirmPayment: non-admin → 403 PERMISSION_DENIED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);
    await expect(service.confirmPayment(nonAdminAuth, 'reg-1', {})).rejects.toThrow(ForbiddenException);
  });

  it('confirmPayment: support admin cannot mutate → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    await expect(service.confirmPayment(supportAuth, 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('confirm: support admin → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    await expect(service.confirm(supportAuth, 'reg-1', { decision: 'confirm' })).rejects.toThrow(ForbiddenException);
  });

  // ─── confirmPayment ─────────────────────────────────────────────────────────

  it('confirmPayment: registration not found → 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);
    await expect(service.confirmPayment(opsAuth, 'ghost', {})).rejects.toThrow(NotFoundException);
  });

  it('confirmPayment: wrong registration status → 409 REGISTRATION_STATUS_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'payment_checking' }));
    await expect(service.confirmPayment(opsAuth, 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'REGISTRATION_STATUS_INVALID' },
    });
    expect(prisma.v1TournamentPayment.update).not.toHaveBeenCalled();
  });

  it('confirmPayment: awaiting_payment → payment paid + registration payment_checking atomically', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'ready' }));
    prisma.v1TournamentPayment.update.mockResolvedValue(paymentRow({ status: 'paid', paidAt: new Date(), confirmedByAdminUserId: 'ops-admin-id' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'payment_checking' }));

    const result = await service.confirmPayment(opsAuth, 'reg-1', { note: '입금 확인' });

    expect(result).toMatchObject({ status: 'payment_checking', payment: { status: 'paid' } });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'payment_checking' }) }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'registration.confirm_payment' }) }),
    );
  });

  it('confirmPayment: overdue awaiting-payment is auto-cancelled and cannot be confirmed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-14T02:01:00.000Z'));
    const createdAt = new Date('2026-06-14T00:00:00.000Z');
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'ready', createdAt }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({
        status: 'cancelled',
        cancelReason: '입금 안내 후 2시간 내 입금 확인이 없어 자동 취소됐어요.',
      }),
    );
    prisma.v1TournamentPayment.update.mockResolvedValue(
      paymentRow({ status: 'cancelled', createdAt, cancelledAt: new Date('2026-06-14T02:01:00.000Z') }),
    );

    await expect(service.confirmPayment(opsAuth, 'reg-1', { note: '입금 확인' })).rejects.toMatchObject({
      response: {
        code: 'PAYMENT_DEADLINE_EXPIRED',
        message: '입금 안내 후 2시간이 지나 신청이 자동 취소됐어요.',
      },
    });

    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    expect(prisma.v1TournamentPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    jest.useRealTimers();
  });

  // ─── confirm ────────────────────────────────────────────────────────────────

  it('confirm: wrong status → 409 REGISTRATION_STATUS_INVALID', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    await expect(service.confirm(opsAuth, 'reg-1', { decision: 'confirm' })).rejects.toMatchObject({
      response: { code: 'REGISTRATION_STATUS_INVALID' },
    });
  });

  it('confirm: payment_checking + decision=confirm → confirmed + alreadyProcessed false', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'payment_checking' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed', confirmedAt: new Date() }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'confirm' });

    expect(result).toMatchObject({ status: 'confirmed', alreadyProcessed: false });
    expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ toStatus: 'confirmed' }) }),
    );
  });

  it('confirm: already confirmed → alreadyProcessed true (idempotent, no write)', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'confirm' });

    expect(result).toMatchObject({ status: 'confirmed', alreadyProcessed: true });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('confirm: paid + decision=waitlist → waitlisted', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'paid' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'waitlisted', confirmedAt: new Date() }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'waitlist' });
    expect(result).toMatchObject({ status: 'waitlisted', alreadyProcessed: false });
  });

  // AREG-03 정원 가드
  it('confirm: decision=confirm but capacity full → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'payment_checking' }));
    // 정원 8, 이미 confirmed 8팀 → 초과
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);
    prisma.v1Tournament.findUnique.mockResolvedValue({ id: 'tournament-1', teamCount: 8 });

    await expect(service.confirm(opsAuth, 'reg-1', { decision: 'confirm' })).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('confirm: decision=waitlist is NOT blocked by capacity check', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'paid' }));
    // 정원 초과 상태라도 waitlist는 통과
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);
    prisma.v1Tournament.findUnique.mockResolvedValue({ id: 'tournament-1', teamCount: 8 });
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'waitlisted', confirmedAt: new Date() }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'waitlist' });
    expect(result).toMatchObject({ status: 'waitlisted', alreadyProcessed: false });
  });

  // ─── cancel ─────────────────────────────────────────────────────────────────

  it('cancel: draft status → 409 REGISTRATION_NOT_CANCELLABLE', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'draft' }));
    await expect(service.cancel(opsAuth, 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_CANCELLABLE' },
    });
  });

  it('cancel: cancel_requested → cancelled + payment cancelled', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'cancel_requested' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));
    prisma.v1TournamentPayment.update.mockResolvedValue(paymentRow({ status: 'cancelled', cancelledAt: new Date() }));

    const result = await service.cancel(opsAuth, 'reg-1', { reason: '운영 취소' });

    expect(result).toMatchObject({ status: 'cancelled' });
    expect(prisma.v1TournamentPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'registration.cancel' }) }),
    );
  });

  it('cancel: already-refunded payment is not double-cancelled', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'refunded' }));

    await service.cancel(opsAuth, 'reg-1', {});

    // Payment already refunded — should NOT call payment.update
    expect(prisma.v1TournamentPayment.update).not.toHaveBeenCalled();
  });

  // ─── roster lock / unlock ───────────────────────────────────────────────────

  it('rosterLock: non-confirmed registration → 409 REGISTRATION_NOT_CONFIRMED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'waitlisted' }));
    await expect(service.rosterLock(opsAuth, 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_CONFIRMED' },
    });
  });

  it('rosterLock: confirmed → rosterLockedAt set + audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    const lockedAt = new Date();
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed', rosterLockedAt: lockedAt }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

    const result = await service.rosterLock(opsAuth, 'reg-1', { note: '명단 잠금' });

    expect(result.rosterLockedAt).toBe(lockedAt.toISOString());
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'registration.roster_lock' }) }),
    );
  });

  it('rosterLock: mixed quota failure returns counts and does not lock', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'confirmed' }),
    );
    prisma.v1Tournament.findUnique.mockResolvedValue({
      genderCategory: 'mixed',
      genderMinMale: 2,
      genderMaxMale: 4,
      genderMinFemale: 2,
      genderMaxFemale: 4,
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'female' },
    ]);

    await expect(service.rosterLock(opsAuth, 'reg-1', {})).rejects.toMatchObject({
      response: {
        code: 'TOURNAMENT_GENDER_QUOTA_NOT_MET',
        details: {
          male: { count: 5, min: 2, max: 4, ok: false },
          female: { count: 1, min: 2, max: 4, ok: false },
        },
      },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('rosterLock: mixed quota success locks inside the serialized transaction', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'confirmed' }),
    );
    prisma.v1Tournament.findUnique.mockResolvedValue({
      genderCategory: 'mixed',
      genderMinMale: 2,
      genderMaxMale: 4,
      genderMinFemale: 2,
      genderMaxFemale: 4,
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'female' },
      { genderSnapshot: 'female' },
    ]);
    const lockedAt = new Date();
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'confirmed', rosterLockedAt: lockedAt }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

    await expect(service.rosterLock(opsAuth, 'reg-1', {})).resolves.toMatchObject({
      rosterLockedAt: lockedAt.toISOString(),
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('rosterUnlock: removes rosterLockedAt', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed', rosterLockedAt: new Date() }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed', rosterLockedAt: null }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

    const result = await service.rosterUnlock(opsAuth, 'reg-1');
    expect(result.rosterLockedAt).toBeNull();
  });

  // ─── roster deadline override (grant / revoke) ─────────────────────────────

  it('grantRosterDeadlineOverride: sets rosterDeadlineOverrideAt + audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));
    const overrideAt = new Date();
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'confirmed', rosterDeadlineOverrideAt: overrideAt }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

    const result = await service.grantRosterDeadlineOverride(opsAuth, 'reg-1');

    expect(result.rosterDeadlineOverrideAt).toBe(overrideAt.toISOString());
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'registration.roster_deadline_override_grant' }),
      }),
    );
  });

  it('grantRosterDeadlineOverride: unknown registration → 404 REGISTRATION_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);

    await expect(service.grantRosterDeadlineOverride(opsAuth, 'ghost-reg')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_FOUND' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('revokeRosterDeadlineOverride: clears rosterDeadlineOverrideAt + audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'confirmed', rosterDeadlineOverrideAt: new Date() }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'confirmed', rosterDeadlineOverrideAt: null }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

    const result = await service.revokeRosterDeadlineOverride(opsAuth, 'reg-1');

    expect(result.rosterDeadlineOverrideAt).toBeNull();
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'registration.roster_deadline_override_revoke' }),
      }),
    );
  });

  it('revokeRosterDeadlineOverride: unknown registration → 404 REGISTRATION_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);

    await expect(service.revokeRosterDeadlineOverride(opsAuth, 'ghost-reg')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_FOUND' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  // ─── list ───────────────────────────────────────────────────────────────────

  it('list: tournament not found → 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue(null);
    await expect(service.list(opsAuth, 'ghost-tournament', {})).rejects.toThrow(NotFoundException);
  });

  it('list: returns items with payment + playerCount + pageInfo', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1' });
    const row = {
      ...registrationRow(),
      payment: paymentRow({ status: 'paid' }),
      _count: { players: 7 },
    };
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([row]);

    const result = await service.list(opsAuth, 'tournament-1', { limit: 20 });

    expect(result.items[0]).toMatchObject({
      id: 'reg-1',
      playerCount: 7,
      payment: { method: 'bank_transfer', status: 'paid', amount: 120000 },
    });
    expect(result.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  // ─── notification emissions ──────────────────────────────────────────────────

  it('confirmPayment: emits tournament_payment_confirmed to registrant', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'awaiting_payment', appliedByUserId: 'manager-user', tournamentId: 'tournament-1' }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'ready' }));
    prisma.v1TournamentPayment.update.mockResolvedValue(paymentRow({ status: 'paid', paidAt: new Date() }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'payment_checking' }));

    await service.confirmPayment(opsAuth, 'reg-1', { note: '입금 확인' });

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'manager-user',
      'tournament_payment_confirmed',
      'tournament-1',
      expect.any(String),
    );
  });

  it('confirm: decision=confirm emits tournament_registration_confirmed to registrant', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'payment_checking', appliedByUserId: 'manager-user', tournamentId: 'tournament-1' }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'confirmed', confirmedAt: new Date() }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    await service.confirm(opsAuth, 'reg-1', { decision: 'confirm' });

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'manager-user',
      'tournament_registration_confirmed',
      'tournament-1',
    );
  });

  it('confirm: decision=waitlist emits tournament_registration_waitlisted to registrant', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'paid', appliedByUserId: 'manager-user', tournamentId: 'tournament-1' }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'waitlisted', confirmedAt: new Date() }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    await service.confirm(opsAuth, 'reg-1', { decision: 'waitlist' });

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'manager-user',
      'tournament_registration_waitlisted',
      'tournament-1',
    );
  });

  it('cancel: emits tournament_registration_cancelled to registrant', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'confirmed', appliedByUserId: 'manager-user', tournamentId: 'tournament-1' }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));
    prisma.v1TournamentPayment.update.mockResolvedValue(paymentRow({ status: 'cancelled', cancelledAt: new Date() }));

    await service.cancel(opsAuth, 'reg-1', { reason: '운영 취소' });

    expect(notifications.emitNotification).toHaveBeenCalledWith(
      'manager-user',
      'tournament_registration_cancelled',
      'tournament-1',
    );
  });

  it('confirm: alreadyProcessed idempotent path does NOT emit notification', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'confirmed', appliedByUserId: 'manager-user' }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'confirm' });

    expect(result.alreadyProcessed).toBe(true);
    expect(notifications.emitNotification).not.toHaveBeenCalled();
  });
});

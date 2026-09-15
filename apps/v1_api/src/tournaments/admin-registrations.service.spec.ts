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
import { AdminRegistrationsService } from './admin-registrations.service';
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';

const opsAuth = { id: 'ops-user-id', email: 'ops@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const supportAuth = { id: 'support-user-id', email: 'support@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const nonAdminAuth = { id: 'plain-user-id', email: 'user@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

const opsAdminRecord = { id: 'ops-admin-id', userId: 'ops-user-id', adminRole: 'ops' as const, status: 'active' as const, user: { accountStatus: 'active' as const } };
const supportAdminRecord = { id: 'support-admin-id', userId: 'support-user-id', adminRole: 'support' as const, status: 'active' as const, user: { accountStatus: 'active' as const } };

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    tournament: { title: '테스트대회', kind: 'regular_tournament' },
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
    v1Tournament: { findFirst: jest.Mock };
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
      v1Tournament: { findFirst: jest.fn() },
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
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'tournament-1', teamCount: 8, kind: 'regular_tournament' }),
    );

    notifications = { emitNotification: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminRegistrationsService,
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

  it('confirmPayment: 입금 안내 후 오래 지난 awaiting_payment 신청도 자동 취소 없이 정상 확인된다', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-20T00:00:00.000Z'));
    const createdAt = new Date('2026-06-14T00:00:00.000Z');
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'awaiting_payment' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'ready', createdAt }));
    prisma.v1TournamentPayment.update.mockResolvedValue(
      paymentRow({ status: 'paid', createdAt, paidAt: new Date(), confirmedByAdminUserId: 'ops-admin-id' }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'payment_checking' }));

    const result = await service.confirmPayment(opsAuth, 'reg-1', { note: '입금 확인' });

    expect(result).toMatchObject({ status: 'payment_checking', payment: { status: 'paid' } });
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'payment_checking' } ) }),
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

  // 감사 finding(reg-confirm-reapply-state-machine #1): ADMIN_CONFIRMABLE_STATUSES에
  // waitlisted가 빠져 있어 대기 팀은 정원에 자리가 나도 취소 후 재신청 말고는 확정될
  // 방법이 없었다. waitlisted 신청건에 decision=confirm을 걸면 confirmed로 승격돼야 한다
  // (대기 승격, "자리가 나서 대기 팀을 confirmed로 올리는 것").
  it('confirm: waitlisted + decision=confirm → 대기 승격으로 confirmed', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'waitlisted' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(
      registrationRow({ status: 'confirmed', confirmedAt: new Date(), confirmedByAdminUserId: opsAdminRecord.id }),
    );
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'confirm' });

    expect(result).toMatchObject({ status: 'confirmed', alreadyProcessed: false });
    const call = prisma.v1TournamentRegistration.update.mock.calls[0][0];
    expect(call.data.status).toBe('confirmed');
    expect(call.data.confirmedAt).toBeInstanceOf(Date);
    expect(call.data.confirmedByAdminUserId).toBe(opsAdminRecord.id);
  });

  // AREG-03 정원 가드
  it('confirm: decision=confirm but capacity full → 409 TOURNAMENT_CAPACITY_FULL', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'payment_checking' }));
    // 정원 8, 이미 confirmed 8팀 → 초과
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'tournament-1', teamCount: 8, kind: 'regular_tournament' }),
    );

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
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'tournament-1', teamCount: 8, kind: 'regular_tournament' }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'waitlisted', confirmedAt: new Date() }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    const result = await service.confirm(opsAuth, 'reg-1', { decision: 'waitlist' });
    expect(result).toMatchObject({ status: 'waitlisted', alreadyProcessed: false });
  });

  // 감사 finding #47: decision과 무관하게 confirmedAt이 항상 채워져, 대기(waitlisted) 처리된
  // 팀도 참가 화면에 "확정일"이 함께 떴다. 실제 update() 호출 인자를 직접 검사한다 — 이
  // spec 파일의 기존 테스트들은 update.mockResolvedValue()로 반환값을 고정해 두고 있어서,
  // 호출 인자를 보지 않으면 confirmedAt이 잘못 채워져도 통과해 버린다.
  it('confirm: decision=waitlist does NOT set confirmedAt/confirmedByAdminUserId', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'paid' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'waitlisted' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    await service.confirm(opsAuth, 'reg-1', { decision: 'waitlist' });

    const call = prisma.v1TournamentRegistration.update.mock.calls[0][0];
    expect(call.data.status).toBe('waitlisted');
    expect(call.data).not.toHaveProperty('confirmedAt');
    expect(call.data).not.toHaveProperty('confirmedByAdminUserId');
  });

  it('confirm: decision=confirm DOES set confirmedAt/confirmedByAdminUserId', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'payment_checking' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed', confirmedAt: new Date() }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(paymentRow({ status: 'paid' }));

    await service.confirm(opsAuth, 'reg-1', { decision: 'confirm' });

    const call = prisma.v1TournamentRegistration.update.mock.calls[0][0];
    expect(call.data.status).toBe('confirmed');
    expect(call.data.confirmedAt).toBeInstanceOf(Date);
    expect(call.data.confirmedByAdminUserId).toBe(opsAdminRecord.id);
  });

  // ─── rejectCancelRequest (취소 요청 거부/잔류) ─────────────────────────────────
  // 감사 finding #48: 팀 자진 철회(withdrawCancelRequest, tournament-registrations.service.ts)엔
  // 이미 정원 재검증 가드가 있었는데 운영자 잔류 처리엔 빠져 있어, 정원을 넘는 확정 팀이
  // 생길 수 있었다.

  it('rejectCancelRequest: not cancel_requested → 409 NOT_CANCEL_REQUESTED', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'confirmed' }));

    await expect(service.rejectCancelRequest(opsAuth, 'reg-1')).rejects.toMatchObject({
      response: { code: 'NOT_CANCEL_REQUESTED' },
    });
  });

  it('rejectCancelRequest: restoring to confirmed when capacity is already full → 409 TOURNAMENT_CAPACITY_FULL, no write', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    );
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ teamCount: 8, kind: 'regular_tournament' }),
    );
    // 다른 8팀이 이미 정원 점유 상태(confirmed 등) → 잔류시키면 9번째가 된다.
    prisma.v1TournamentRegistration.count.mockResolvedValue(8);

    await expect(service.rejectCancelRequest(opsAuth, 'reg-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_CAPACITY_FULL' },
    });
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('rejectCancelRequest: restoring to confirmed with room in capacity → succeeds and restores status', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'confirmed' }),
    );
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ teamCount: 8, kind: 'regular_tournament' }),
    );
    prisma.v1TournamentRegistration.count.mockResolvedValue(6);
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'confirmed' }));

    const result = await service.rejectCancelRequest(opsAuth, 'reg-1');

    expect(result.status).toBe('confirmed');
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'confirmed' }) }),
    );
  });

  it('rejectCancelRequest: restoring to a non-capacity-hold status (e.g. draft) skips the capacity check entirely', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', cancelPreviousStatus: 'draft' }),
    );
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'draft' }));

    const result = await service.rejectCancelRequest(opsAuth, 'reg-1');

    expect(result.status).toBe('draft');
    // draft는 정원을 점유하지 않으므로 대회 조회/카운트 없이 바로 복원돼야 한다.
    expect(prisma.v1Tournament.findFirst).not.toHaveBeenCalled();
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

  it('cancel: 리그 거부는 사유가 없으면 400 — 팀에게 시즌을 못 뛰게 하는 조치다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', tournament: { title: '리그', kind: 'regular_league' } }),
    );

    await expect(service.cancel(opsAuth, 'reg-1', {})).rejects.toMatchObject({
      response: { code: 'LEAGUE_CANCEL_REASON_REQUIRED' },
    });
    // 막았으면 **아무것도 쓰지 않아야** 한다 — 던지기 전에 갱신이 나가면 사유 없는 취소가
    // 그대로 남는다.
    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('cancel: 공백만 있는 사유도 사유가 아니다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(
      registrationRow({ status: 'cancel_requested', tournament: { title: '리그', kind: 'regular_league' } }),
    );

    await expect(service.cancel(opsAuth, 'reg-1', { reason: '   ' })).rejects.toMatchObject({
      response: { code: 'LEAGUE_CANCEL_REASON_REQUIRED' },
    });
  });

  it('cancel: **대회**는 사유 없이도 그대로 취소된다 — 리그 규칙이 대회로 새면 안 된다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(registrationRow({ status: 'cancel_requested' }));
    prisma.v1TournamentRegistration.update.mockResolvedValue(registrationRow({ status: 'cancelled' }));
    prisma.v1TournamentPayment.findUnique.mockResolvedValue(null);

    await expect(service.cancel(opsAuth, 'reg-1', {})).resolves.toMatchObject({ status: 'cancelled' });
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
    prisma.v1Tournament.findFirst.mockResolvedValue({
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
    prisma.v1Tournament.findFirst.mockResolvedValue({
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

  // 대회 표면 봉쇄 — 리그 id 는 어드민 신청 목록으로 열리지 않는다.
  it('list: 리그 id 도 열린다 (D7) — 운영자가 리그 신청을 볼 수 있어야 확정할 수 있다', async () => {
    // 예전엔 여기서 404 로 막았다. 신청자 경로만 열고 이걸 닫아 두면 팀은 신청할 수 있는데
    // **운영자가 그 신청을 보지도 확정하지도 못한다** — 신청이 영영 미확정으로 쌓인다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'league-1', kind: 'regular_league' }),
    );
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);

    await expect(service.list(opsAuth, 'league-1', {})).resolves.toBeDefined();
    expect(prisma.v1TournamentRegistration.findMany).toHaveBeenCalled();
  });

  // ─── 자동 확정 명단 표시 (FE-4, 결함 #21) ────────────────────────────────────
  //
  // 시즌 시작까지 명단을 안 낸 팀은 잡이 현재 멤버로 명단을 만들고 `rosterAutoConfirmedAt`
  // 을 남기는데, 그 값이 **어떤 응답에도 실리지 않아** 운영자가 "팀이 낸 명단" 과
  // "시스템이 만든 명단" 을 구분할 수 없었다.

  /** 신청 1건짜리 목록을 세팅한다. */
  function arrangeOneRegistration() {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'league-1', kind: 'regular_league' }),
    );
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([
      {
        id: 'reg-1',
        tournamentId: 'league-1',
        teamId: 'team-1',
        appliedByUserId: 'user-1',
        status: 'confirmed',
        depositorName: null,
        agreedRules: true,
        agreedPrivacy: true,
        agreedRefund: true,
        agreedMediaConsent: true,
        confirmedByAdminUserId: null,
        confirmedAt: null,
        rosterLockedAt: null,
        rosterDeadlineOverrideAt: null,
        cancelRequestedAt: null,
        cancelReason: null,
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        payment: null,
        team: { name: 'A팀' },
        _count: { players: 6 },
      },
    ]);
  }

  it('list: 자동 확정된 명단이면 그 시각을 함께 준다', async () => {
    arrangeOneRegistration();
    prisma.$queryRaw.mockResolvedValue([
      { id: 'reg-1', roster_auto_confirmed_at: new Date('2026-09-01T00:00:00.000Z') },
    ]);

    const result = await service.list(opsAuth, 'league-1', {});
    expect(result.items[0]).toMatchObject({
      id: 'reg-1',
      rosterAutoConfirmedAt: '2026-09-01T00:00:00.000Z',
    });
  });

  it('list: 팀이 직접 낸 명단은 null 이다 — 배지가 잘못 붙으면 안 된다', async () => {
    arrangeOneRegistration();
    // 자동 확정 행이 없으면 raw 조회가 빈 배열을 준다(쿼리가 `IS NOT NULL` 로 거른다).
    prisma.$queryRaw.mockResolvedValue([]);

    const result = await service.list(opsAuth, 'league-1', {});
    expect(result.items[0].rosterAutoConfirmedAt).toBeNull();
  });

  it('list: 신청이 하나도 없으면 자동 확정 조회를 아예 하지 않는다', async () => {
    // 빈 배열로 `= ANY(...)` 를 만들면 헛돈다 — 물어볼 것이 없으면 묻지 않는다.
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({ id: 'league-1', kind: 'regular_league' }),
    );
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockClear();

    await service.list(opsAuth, 'league-1', {});
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('list: 없는 id 는 여전히 404 — 조회가 사라진 것은 아니다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1Tournament.findFirst.mockImplementation(kindAwareFindFirst(null));
    prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);

    await expect(service.list(opsAuth, 'missing-1', {})).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
    expect(prisma.v1TournamentRegistration.findMany).not.toHaveBeenCalled();
  });

  it('list: 대회 id 와 kind=null(R1 이전 행)은 그대로 열린다', async () => {
    for (const kind of ['regular_tournament', null]) {
      jest.clearAllMocks();
      prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
      prisma.v1Tournament.findFirst.mockImplementation(
        kindAwareFindFirst({ id: 'tournament-1', kind }),
      );
      prisma.v1TournamentRegistration.findMany.mockResolvedValue([]);
      await expect(service.list(opsAuth, 'tournament-1', {})).resolves.toBeDefined();
    }
  });

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
      expect.any(String),
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
      expect.any(String),
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
      expect.any(String),
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

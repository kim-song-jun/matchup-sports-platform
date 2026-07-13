import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1TournamentPayment, V1TournamentRegistration } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminCancelRegistrationDto,
  AdminConfirmPaymentDto,
  AdminConfirmRegistrationDto,
  AdminRegistrationListQueryDto,
  AdminRosterLockDto,
} from './dto/admin-registration.dto';
import {
  getTournamentPaymentDueAt,
  TournamentPaymentExpiryService,
} from './tournament-payment-expiry.service';

/** 어드민이 취소 처리할 수 있는 신청 상태 목록. */
const ADMIN_CANCELLABLE_STATUSES: V1TournamentRegistration['status'][] = [
  'cancel_requested',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
];

/** 확정/대기 처리 가능 상태 목록. */
const ADMIN_CONFIRMABLE_STATUSES: V1TournamentRegistration['status'][] = [
  'payment_checking',
  'paid',
];

@Injectable()
export class AdminRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly notifications: NotificationsService,
    private readonly paymentExpiry: TournamentPaymentExpiryService,
  ) {}

  async list(user: V1AuthUser, tournamentId: string, query: AdminRegistrationListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const limit = query.limit ?? 20;

    // 대회 존재 여부 간단 확인 (deleted 포함 어드민은 볼 수 있어야 함).
    const tournament = await this.prisma.v1Tournament.findFirst({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const where: Prisma.V1TournamentRegistrationWhereInput = {
      tournamentId,
      ...(query.status ? { status: query.status } : {}),
    };

    const rows = await this.prisma.v1TournamentRegistration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        payment: true,
        team: { select: { name: true } },
        _count: { select: { players: { where: { removedAt: null } } } },
      },
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;
    const resolvedItems = await Promise.all(
      pageItems.map(async (row) => ({
        row,
        expiry: await this.paymentExpiry.expireIfOverdue(row, row.payment ?? null),
      })),
    );

    return {
      items: resolvedItems.map(({ row, expiry }) => ({
        ...this.serialize(expiry.registration, expiry.payment, row._count.players),
        teamName: row.team?.name ?? null,
      })),
      pageInfo: {
        nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null,
        hasNext,
      },
    };
  }

  async confirmPayment(user: V1AuthUser, registrationId: string, dto: AdminConfirmPaymentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);
    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const expiry = await this.paymentExpiry.expireIfOverdue(registration, payment ?? null);
    if (expiry.expired) {
      throw new ConflictException({
        code: 'PAYMENT_DEADLINE_EXPIRED',
        message: '입금 안내 후 2시간이 지나 신청이 자동 취소됐어요.',
      });
    }

    if (expiry.registration.status !== 'awaiting_payment') {
      throw new ConflictException({
        code: 'REGISTRATION_STATUS_INVALID',
        message: '현재 상태에서는 입금 확인을 할 수 없어요.',
      });
    }

    if (!payment) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_FOUND',
        message: '결제 정보를 찾을 수 없어요.',
      });
    }
    if (expiry.payment?.status !== 'ready') {
      throw new ConflictException({
        code: 'PAYMENT_STATUS_INVALID',
        message: '이미 처리된 결제예요.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.v1TournamentPayment.update({
        where: { registrationId },
        data: {
          status: 'paid',
          paidAt: new Date(),
          confirmedByAdminUserId: admin.id,
        },
      });
      const updatedRegistration = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { status: 'payment_checking' },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.confirm_payment',
          targetType: 'tournament_registration',
          targetId: registrationId,
          reason: dto.note ?? null,
          beforeJson: { registrationStatus: expiry.registration.status, paymentStatus: payment.status },
          afterJson: { registrationStatus: 'payment_checking', paymentStatus: 'paid' },
          fromStatus: expiry.registration.status,
          toStatus: 'payment_checking',
        },
        tx,
      );
      return { updatedRegistration, updatedPayment };
    });

    // 알림: 신청자에게 입금 확인 안내 (fire-and-forget — 트랜잭션 실패와 무관)
    void this.notifications.emitNotification(
      registration.appliedByUserId,
      'tournament_payment_confirmed',
      registration.tournamentId,
      '운영진 확정을 기다려 주세요.',
    );

    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result.updatedRegistration, result.updatedPayment, playerCount);
  }

  async confirm(user: V1AuthUser, registrationId: string, dto: AdminConfirmRegistrationDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    // 멱등: 이미 목표 상태이면 alreadyProcessed 반환.
    const targetStatus = dto.decision === 'confirm' ? 'confirmed' : 'waitlisted';
    if (registration.status === targetStatus) {
      const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
      const playerCount = await this.countPlayers(registrationId);
      return { alreadyProcessed: true, ...this.serialize(registration, payment ?? null, playerCount) };
    }

    if (!ADMIN_CONFIRMABLE_STATUSES.includes(registration.status)) {
      throw new ConflictException({
        code: 'REGISTRATION_STATUS_INVALID',
        message: '현재 상태에서는 확정·대기 처리를 할 수 없어요.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // AREG-03: confirm 분기에서 정원 초과 여부 확인.
      if (dto.decision === 'confirm') {
        const confirmedCount = await tx.v1TournamentRegistration.count({
          where: { tournamentId: registration.tournamentId, status: 'confirmed' },
        });
        const tournament = await tx.v1Tournament.findUnique({
          where: { id: registration.tournamentId },
          select: { teamCount: true },
        });
        if (tournament && confirmedCount >= tournament.teamCount) {
          throw new ConflictException({
            code: 'TOURNAMENT_CAPACITY_FULL',
            message: '정원이 모두 찼어요. 더 확정할 수 없어요.',
          });
        }
      }

      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: targetStatus,
          confirmedAt: new Date(),
          confirmedByAdminUserId: admin.id,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.confirm',
          targetType: 'tournament_registration',
          targetId: registrationId,
          reason: dto.note ?? null,
          beforeJson: { status: registration.status },
          afterJson: { status: targetStatus, decision: dto.decision },
          fromStatus: registration.status,
          toStatus: targetStatus,
        },
        tx,
      );
      return updated;
    });

    // 알림: 신청자에게 확정/대기 결과 안내 (fire-and-forget — 트랜잭션 실패와 무관)
    void this.notifications.emitNotification(
      registration.appliedByUserId,
      dto.decision === 'confirm'
        ? 'tournament_registration_confirmed'
        : 'tournament_registration_waitlisted',
      registration.tournamentId,
    );

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return { alreadyProcessed: false, ...this.serialize(result, payment ?? null, playerCount) };
  }

  async cancel(user: V1AuthUser, registrationId: string, dto: AdminCancelRegistrationDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    if (!ADMIN_CANCELLABLE_STATUSES.includes(registration.status)) {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CANCELLABLE',
        message: '현재 상태에서는 취소할 수 없어요.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        // 팀이 남긴 취소 요청 사유는 어드민이 별도 사유를 주지 않는 한 보존한다 (감사 추적)
        data: { status: 'cancelled', cancelPreviousStatus: null, cancelReason: dto.reason ?? registration.cancelReason ?? null },
      });

      // 결제가 있고 아직 cancelled 아니면 payment도 cancelled로 변경.
      // refund는 운영 수동 처리 — refundedAt 설정 안 함.
      const payment = await tx.v1TournamentPayment.findUnique({ where: { registrationId } });
      let updatedPayment: V1TournamentPayment | null = null;
      if (payment && payment.status !== 'cancelled' && payment.status !== 'refunded') {
        updatedPayment = await tx.v1TournamentPayment.update({
          where: { registrationId },
          data: { status: 'cancelled', cancelledAt: new Date() },
        });
      } else {
        updatedPayment = payment;
      }

      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.cancel',
          targetType: 'tournament_registration',
          targetId: registrationId,
          reason: dto.reason ?? null,
          beforeJson: { status: registration.status },
          afterJson: { status: 'cancelled' },
          fromStatus: registration.status,
          toStatus: 'cancelled',
        },
        tx,
      );
      return { updated, updatedPayment };
    });

    // 알림: 신청자에게 취소 안내 (fire-and-forget — 트랜잭션 실패와 무관)
    void this.notifications.emitNotification(
      registration.appliedByUserId,
      'tournament_registration_cancelled',
      registration.tournamentId,
    );

    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result.updated, result.updatedPayment ?? null, playerCount);
  }

  /**
   * 취소 요청 거부(잔류) — cancel_requested 상태의 신청을 이전 상태로 되돌린다.
   * cancelReason은 감사 추적을 위해 유지한다(팀이 왜 취소하려 했는지 보존).
   * cancelRequestedAt은 초기화한다 — 남겨두면 목록 UI가 되돌린 이후에도 "취소 요청" 배지를 계속 표시함.
   */
  async rejectCancelRequest(user: V1AuthUser, registrationId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    if (registration.status !== 'cancel_requested') {
      throw new ConflictException({
        code: 'NOT_CANCEL_REQUESTED',
        message: '취소 요청 상태가 아니에요.',
      });
    }

    const restoredStatus = registration.cancelPreviousStatus ?? 'confirmed';

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: restoredStatus,
          cancelPreviousStatus: null,
          cancelRequestedAt: null,
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'tournament.registration.cancel_reject',
          targetType: 'tournament_registration',
          targetId: registrationId,
          beforeJson: { status: registration.status },
          afterJson: { status: restoredStatus },
          fromStatus: registration.status,
          toStatus: restoredStatus,
        },
        tx,
      );
      return updated;
    });

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result, payment ?? null, playerCount);
  }

  async rosterLock(user: V1AuthUser, registrationId: string, dto: AdminRosterLockDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    if (registration.status !== 'confirmed') {
      // 경고: confirmed 아닌 상태에서도 잠금을 기술적으로 막지는 않으나 권장하지 않음.
      // 여기서는 confirmed 상태에서만 허용하는 엄격 정책 적용.
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CONFIRMED',
        message: '확정된 신청만 명단을 잠글 수 있어요.',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { rosterLockedAt: new Date() },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.roster_lock',
          targetType: 'tournament_registration',
          targetId: registrationId,
          reason: dto.note ?? null,
          afterJson: { rosterLockedAt: updated.rosterLockedAt?.toISOString() },
        },
        tx,
      );
      return updated;
    });

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result, payment ?? null, playerCount);
  }

  async rosterUnlock(user: V1AuthUser, registrationId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { rosterLockedAt: null },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.roster_unlock',
          targetType: 'tournament_registration',
          targetId: registrationId,
          afterJson: { rosterLockedAt: null },
        },
        tx,
      );
      return updated;
    });

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result, payment ?? null, playerCount);
  }

  /**
   * 명단 제출 마감 예외 부여 — 대회 rosterDeadlineAt이 지나도 이 팀(신청건)은 명단을 계속 수정할 수 있게 한다.
   * status 제약 없음(취소된 신청에도 기술적으로 부여 가능하나 실무상 무해).
   */
  async grantRosterDeadlineOverride(user: V1AuthUser, registrationId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadRegistration(registrationId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { rosterDeadlineOverrideAt: new Date() },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.roster_deadline_override_grant',
          targetType: 'tournament_registration',
          targetId: registrationId,
          afterJson: { rosterDeadlineOverrideAt: updated.rosterDeadlineOverrideAt?.toISOString() },
        },
        tx,
      );
      return updated;
    });

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result, payment ?? null, playerCount);
  }

  /** 명단 제출 마감 예외 취소(rosterDeadlineOverrideAt = null). */
  async revokeRosterDeadlineOverride(user: V1AuthUser, registrationId: string) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    await this.loadRegistration(registrationId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { rosterDeadlineOverrideAt: null },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'registration.roster_deadline_override_revoke',
          targetType: 'tournament_registration',
          targetId: registrationId,
          afterJson: { rosterDeadlineOverrideAt: null },
        },
        tx,
      );
      return updated;
    });

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result, payment ?? null, playerCount);
  }

  private async loadRegistration(registrationId: string): Promise<V1TournamentRegistration> {
    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: '신청 내역을 찾을 수 없어요.',
      });
    }
    return registration;
  }

  private countPlayers(registrationId: string) {
    return this.prisma.v1TournamentPlayer.count({ where: { registrationId, removedAt: null } });
  }

  private serialize(
    row: V1TournamentRegistration,
    payment: V1TournamentPayment | null,
    playerCount: number,
  ) {
    return {
      id: row.id,
      tournamentId: row.tournamentId,
      teamId: row.teamId,
      appliedByUserId: row.appliedByUserId,
      status: row.status,
      depositorName: row.depositorName,
      agreedRules: row.agreedRules,
      agreedPrivacy: row.agreedPrivacy,
      agreedRefund: row.agreedRefund,
      agreedMediaConsent: row.agreedMediaConsent,
      confirmedByAdminUserId: row.confirmedByAdminUserId,
      confirmedAt: row.confirmedAt?.toISOString() ?? null,
      rosterLockedAt: row.rosterLockedAt?.toISOString() ?? null,
      rosterDeadlineOverrideAt: row.rosterDeadlineOverrideAt?.toISOString() ?? null,
      cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      playerCount,
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
            paidAt: payment.paidAt?.toISOString() ?? null,
            paymentDueAt: getTournamentPaymentDueAt(payment).toISOString(),
            confirmedByAdminUserId: payment.confirmedByAdminUserId,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

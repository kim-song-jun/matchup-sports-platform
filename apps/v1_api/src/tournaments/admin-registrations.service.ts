import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1TournamentPayment, V1TournamentRegistration } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminCancelRegistrationDto,
  AdminConfirmPaymentDto,
  AdminConfirmRegistrationDto,
  AdminRegistrationListQueryDto,
  AdminRosterLockDto,
} from './dto/admin-registration.dto';

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
  ) {}

  async list(user: V1AuthUser, tournamentId: string, query: AdminRegistrationListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const limit = query.limit ?? 20;

    // 대회 존재 여부 간단 확인 (deleted 포함 어드민은 볼 수 있어야 함).
    const tournament = await this.prisma.v1Tournament.findFirst({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament was not found' });
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
        _count: { select: { players: { where: { removedAt: null } } } },
      },
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageItems.map((row) =>
        this.serialize(row, row.payment ?? null, row._count.players),
      ),
      pageInfo: {
        nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null,
        hasNext,
      },
    };
  }

  async confirmPayment(user: V1AuthUser, registrationId: string, dto: AdminConfirmPaymentDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    if (registration.status !== 'awaiting_payment') {
      throw new ConflictException({
        code: 'REGISTRATION_STATUS_INVALID',
        message: `Cannot confirm payment: registration is in status ${registration.status}`,
      });
    }

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    if (!payment) {
      throw new ConflictException({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Payment record was not found for this registration',
      });
    }
    if (payment.status !== 'ready') {
      throw new ConflictException({
        code: 'PAYMENT_STATUS_INVALID',
        message: `Payment is already in status ${payment.status}`,
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
          beforeJson: { registrationStatus: registration.status, paymentStatus: payment.status },
          afterJson: { registrationStatus: 'payment_checking', paymentStatus: 'paid' },
          fromStatus: registration.status,
          toStatus: 'payment_checking',
        },
        tx,
      );
      return { updatedRegistration, updatedPayment };
    });

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
        message: `Cannot confirm/waitlist registration in status ${registration.status}`,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
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
        message: `Registration in status ${registration.status} cannot be cancelled by admin`,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { status: 'cancelled', cancelReason: dto.reason ?? null },
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

    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result.updated, result.updatedPayment ?? null, playerCount);
  }

  async rosterLock(user: V1AuthUser, registrationId: string, dto: AdminRosterLockDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const registration = await this.loadRegistration(registrationId);

    if (registration.status !== 'confirmed') {
      // 경고: confirmed 아닌 상태에서도 잠금을 기술적으로 막지는 않으나 권장하지 않음.
      // 여기서는 confirmed 상태에서만 허용하는 엄격 정책 적용.
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CONFIRMED',
        message: 'Roster can only be locked for confirmed registrations',
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

  private async loadRegistration(registrationId: string): Promise<V1TournamentRegistration> {
    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'REGISTRATION_NOT_FOUND',
        message: 'Registration was not found',
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
      cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
      playerCount,
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            amount: payment.amount,
            paidAt: payment.paidAt?.toISOString() ?? null,
            confirmedByAdminUserId: payment.confirmedByAdminUserId,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

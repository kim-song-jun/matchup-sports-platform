import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1Tournament, V1TournamentPayment, V1TournamentRegistration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  CancelRegistrationRequestDto,
  CreateRegistrationDto,
  SubmitRegistrationDto,
} from './dto/tournament-registration.dto';

/** cancel-request로 어드민 처리가 필요한 상태(이미 운영에 반영됨). */
const CANCELLABLE_VIA_REQUEST: V1TournamentRegistration['status'][] = [
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
];

@Injectable()
export class TournamentRegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 팀장 또는 운영진(manager+)만 대회 신청을 관리할 수 있다. */
  private async assertTeamManager(teamId: string, userId: string) {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: {
        teamId,
        userId,
        status: 'active',
        role: { in: ['owner', 'manager'] },
        team: { status: 'active', deletedAt: null },
      },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 매니저만 신청을 관리할 수 있어요.',
      });
    }
  }

  private async loadOpenTournament(tournamentId: string): Promise<V1Tournament> {
    const tournament = await this.prisma.v1Tournament.findFirst({
      where: { id: tournamentId, deletedAt: null },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    if (tournament.status !== 'open') {
      throw new ConflictException({ code: 'TOURNAMENT_NOT_OPEN', message: '지금은 참가 신청을 받지 않아요.' });
    }
    if (tournament.registrationDeadlineAt && tournament.registrationDeadlineAt.getTime() < Date.now()) {
      throw new ConflictException({ code: 'REGISTRATION_DEADLINE_PASSED', message: '신청이 마감됐어요.' });
    }
    return tournament;
  }

  async create(user: V1AuthUser, tournamentId: string, dto: CreateRegistrationDto) {
    await this.loadOpenTournament(tournamentId);
    await this.assertTeamManager(dto.teamId, user.id);

    const existing = await this.prisma.v1TournamentRegistration.findUnique({
      where: { tournamentId_teamId: { tournamentId, teamId: dto.teamId } },
    });
    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException({
        code: 'ALREADY_REGISTERED',
        message: '이미 신청한 대회예요. 내 신청에서 확인해 주세요.',
      });
    }

    // 취소된 신청이 남아있으면(unique 제약) draft로 재활성화, 없으면 신규 생성.
    const registration = existing
      ? await this.prisma.v1TournamentRegistration.update({
          where: { id: existing.id },
          data: {
            status: 'draft',
            appliedByUserId: user.id,
            depositorName: null,
            agreedRules: false,
            agreedPrivacy: false,
            agreedRefund: false,
            agreedMediaConsent: false,
            cancelRequestedAt: null,
            cancelReason: null,
          },
        })
      : await this.prisma.v1TournamentRegistration.create({
          data: { tournamentId, teamId: dto.teamId, appliedByUserId: user.id, status: 'draft' },
        });

    return this.serialize(registration, null, 0);
  }

  async submit(user: V1AuthUser, tournamentId: string, registrationId: string, dto: SubmitRegistrationDto) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    if (registration.status !== 'draft') {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_DRAFT',
        message: '이미 제출된 신청이에요.',
      });
    }
    if (!dto.agreedRules || !dto.agreedPrivacy || !dto.agreedRefund) {
      throw new BadRequestException({
        code: 'AGREEMENTS_REQUIRED',
        message: '필수 동의 항목에 모두 동의해 주세요.',
      });
    }
    if (dto.paymentMethod === 'bank_transfer' && !dto.depositorName?.trim()) {
      throw new BadRequestException({
        code: 'DEPOSITOR_NAME_REQUIRED',
        message: '계좌이체는 입금자명을 입력해 주세요.',
      });
    }

    // 제출 시점에 대회가 여전히 open·마감 전인지 재확인(draft 보관 중 마감됐을 수 있음).
    const tournament = await this.loadOpenTournament(tournamentId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: 'awaiting_payment',
          depositorName: dto.paymentMethod === 'bank_transfer' ? dto.depositorName!.trim() : null,
          agreedRules: dto.agreedRules,
          agreedPrivacy: dto.agreedPrivacy,
          agreedRefund: dto.agreedRefund,
          agreedMediaConsent: dto.agreedMediaConsent ?? false,
        },
      });
      const payment = await tx.v1TournamentPayment.upsert({
        where: { registrationId },
        create: {
          registrationId,
          method: dto.paymentMethod,
          amount: tournament.entryFee,
          status: 'ready',
          provider: dto.paymentMethod === 'pg' ? 'toss' : null,
        },
        update: {
          method: dto.paymentMethod,
          amount: tournament.entryFee,
          status: 'ready',
          provider: dto.paymentMethod === 'pg' ? 'toss' : null,
          paidAt: null,
          cancelledAt: null,
          refundedAt: null,
        },
      });
      return { updated, payment };
    });

    const playerCount = await this.prisma.v1TournamentPlayer.count({
      where: { registrationId, removedAt: null },
    });
    return this.serialize(result.updated, result.payment, playerCount);
  }

  async cancelRequest(
    user: V1AuthUser,
    tournamentId: string,
    registrationId: string,
    dto: CancelRegistrationRequestDto,
  ) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);

    // draft는 운영 반영 전이라 즉시 취소(self-service). 그 이후 상태는 어드민 처리 대기.
    if (registration.status === 'draft') {
      const cancelled = await this.prisma.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { status: 'cancelled', cancelRequestedAt: new Date(), cancelReason: dto.reason ?? null },
      });
      return this.serialize(cancelled, null, 0);
    }
    if (!CANCELLABLE_VIA_REQUEST.includes(registration.status)) {
      throw new ConflictException({
        code: 'REGISTRATION_NOT_CANCELLABLE',
        message: '현재 상태에서는 취소할 수 없어요.',
      });
    }

    const updated = await this.prisma.v1TournamentRegistration.update({
      where: { id: registrationId },
      data: { status: 'cancel_requested', cancelRequestedAt: new Date(), cancelReason: dto.reason ?? null },
    });
    return this.serialize(updated, null, await this.countPlayers(registrationId));
  }

  async get(user: V1AuthUser, tournamentId: string, registrationId: string) {
    const registration = await this.loadRegistration(tournamentId, registrationId);
    await this.assertTeamManager(registration.teamId, user.id);
    const [payment, playerCount] = await Promise.all([
      this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } }),
      this.countPlayers(registrationId),
    ]);
    return this.serialize(registration, payment, playerCount);
  }

  /**
   * 로그인 유저 본인의 신청 조회 — registrationId 없이 tournamentId만으로 호출 가능.
   * appliedByUserId 기준으로 가장 최근 non-deleted 신청을 반환한다.
   * 없으면 404 TOURNAMENT_REGISTRATION_NOT_FOUND.
   */
  async getMyRegistration(user: V1AuthUser, tournamentId: string) {
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { tournamentId, appliedByUserId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!registration) {
      throw new NotFoundException({
        code: 'TOURNAMENT_REGISTRATION_NOT_FOUND',
        message: '신청 내역이 없어요.',
      });
    }
    const registrationId = registration.id;
    const [payment, playerCount] = await Promise.all([
      this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } }),
      this.countPlayers(registrationId),
    ]);
    return this.serialize(registration, payment, playerCount);
  }

  private async loadRegistration(tournamentId: string, registrationId: string): Promise<V1TournamentRegistration> {
    const registration = await this.prisma.v1TournamentRegistration.findFirst({
      where: { id: registrationId, tournamentId },
    });
    if (!registration) {
      throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: '신청 내역을 찾을 수 없어요.' });
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
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

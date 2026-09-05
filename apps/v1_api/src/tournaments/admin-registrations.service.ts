import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, V1CompetitionKind, V1TournamentPayment, V1TournamentRegistration } from '@prisma/client';
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
  findLeagueAdmissionBlocker,
  leagueAdmissionBlockerMessage,
} from '../league-matches/league-team-admission';
import { capacityLimitOf, isCapacityFull } from './registration-capacity';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface, LEAGUE_KINDS } from './tournament-surface-lookup';
import { readRosterAutoConfirmedAt } from './registration-auto-confirm';

/** 어드민이 취소 처리할 수 있는 신청 상태 목록. */
const ADMIN_CANCELLABLE_STATUSES: V1TournamentRegistration['status'][] = [
  'cancel_requested',
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
  'waitlisted',
];

/**
 * 확정/대기 처리 가능 상태 목록. `waitlisted`가 포함돼야 대기 승격(자리가 나서 대기 팀을
 * confirmed로 올리는 것)이 가능하다 — 감사 finding(reg-confirm-reapply-state-machine #1):
 * 이 배열에 waitlisted가 빠져 있어 대기 팀은 취소 후 재신청 말고는 확정될 방법이 없었다.
 */
const ADMIN_CONFIRMABLE_STATUSES: V1TournamentRegistration['status'][] = [
  'payment_checking',
  'paid',
  'waitlisted',
];

/**
 * 정원 한 자리를 점유하는 상태 목록. tournament-registrations.service.ts의 동일 이름 상수와
 * 같은 목록이다 — 그 파일은 이 배치(T-reg-roster-state-machine)의 ownedFiles 밖이라 공유
 * export로 승격하지 않고 여기 그대로 중복 정의한다. **상태값이 바뀌면 두 곳을 함께 고친다**
 * (감사 finding #48: 팀 자진 철회(withdrawCancelRequest, R17-006)에는 이미 이 가드가 있었는데
 * 운영자 잔류 처리(rejectCancelRequest)에는 빠져 있어 정원을 넘는 확정 팀이 생길 수 있었다).
 */
const CAPACITY_HOLD_STATUSES: V1TournamentRegistration['status'][] = [
  'awaiting_payment',
  'payment_checking',
  'paid',
  'confirmed',
];

@Injectable()
export class AdminRegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: V1AuthUser, tournamentId: string, query: AdminRegistrationListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    const limit = query.limit ?? 20;

    // 대회 존재 여부 간단 확인 (deleted 포함 어드민은 볼 수 있어야 함).
    const tournament = await findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, { where: { id: tournamentId } });
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

    // **자동 확정 명단인지 알려 준다.** 시즌 시작까지 명단을 안 낸 팀은 잡이 현재 멤버로
    // 명단을 만드는데(`rosterAutoConfirmedAt`), 그 값이 어떤 응답에도 없어서 운영자는
    // 눈앞의 명단이 팀이 낸 것인지 시스템이 만든 것인지 구분할 수 없었다 — 자동 확정
    // 명단은 "팀이 검토한 적 없는 명단" 이라 운영 판단이 달라진다.
    //
    // **리그일 때만 묻는다.** 자동 확정 잡은 리그 전용이라 대회 신청에는 이 값이 절대
    // 없는데, 그때도 raw 쿼리를 돌리면 목록을 열 때마다 헛도는 왕복이 하나씩 붙는다.
    // 종류는 위에서 이미 읽었다 — 새로 조회하지 않는다.
    const autoConfirmedAt =
      tournament.kind === V1CompetitionKind.regular_league
        ? await readRosterAutoConfirmedAt(
            this.prisma,
            pageItems.map((row) => row.id),
          )
        : new Map<string, string>();

    return {
      items: pageItems.map((row) => ({
        ...this.serialize(row, row.payment ?? null, row._count.players),
        teamName: row.team?.name ?? null,
        // 자동 확정이 아니면 `null` — 맵에 없는 것이 곧 "팀이 직접 낸 명단" 이다.
        rosterAutoConfirmedAt: autoConfirmedAt.get(row.id) ?? null,
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

    if (registration.status !== 'awaiting_payment') {
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
    if (payment.status !== 'ready') {
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
          beforeJson: { registrationStatus: registration.status, paymentStatus: payment.status },
          afterJson: { registrationStatus: 'payment_checking', paymentStatus: 'paid' },
          fromStatus: registration.status,
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
      `"${registration.tournament.title}" 대회 운영진 확정을 기다려 주세요.`,
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
        // 대회를 **먼저** 읽는다 — 상한이 없으면(정규 리그) COUNT 자체를 건너뛴다.
        const tournament = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
          where: { id: registration.tournamentId },
          select: { teamCount: true, kind: true },
        });
        const confirmedCount =
          tournament === null || capacityLimitOf(tournament) === null
            ? 0
            : await tx.v1TournamentRegistration.count({
                where: { tournamentId: registration.tournamentId, status: 'confirmed' },
              });
        if (tournament && isCapacityFull(tournament, confirmedCount)) {
          throw new ConflictException({
            code: 'TOURNAMENT_CAPACITY_FULL',
            message: '정원이 모두 찼어요. 더 확정할 수 없어요.',
          });
        }
      }

      // 리그 확정은 **리그 축 로스터도 만든다** (D7, contract 전까지 역방향 dual-write).
      //
      // 리그 순위·대진·승강은 전부 `V1LeagueTeam` 을 읽는다 — 통합 축 등록만 `confirmed` 로
      // 두면 운영자 화면엔 "확정" 이 뜨는데 **그 팀은 순위표에도 대진 생성 대상에도 없다.**
      // 에러가 아니라 조용한 누락이라 대진을 짜고 나서야 드러난다.
      //
      // 판정은 `findLeagueAdmissionBlocker` 를 지난다 — 어드민 `addTeam` 과 같은 함수다.
      // 신청 시점에 통과했어도 확정까지 사이에 팀이 해체되거나 형제 티어에 들어갈 수
      // 있으므로 **여기서 다시** 본다.
      if (dto.decision === 'confirm') {
        const leagueMirror = await findTournamentOnSurface(tx, LEAGUE_KINDS, {
          where: { id: registration.tournamentId },
          select: { id: true },
        });
        if (leagueMirror !== null) {
          const blocker = await findLeagueAdmissionBlocker(tx, {
            leagueId: registration.tournamentId,
            teamId: registration.teamId,
          });
          // 이미 로스터에 있으면 통과시킨다 — 백필로 들어온 팀이나 어드민이 손으로 넣은
          // 팀의 신청을 확정하는 것은 정상이고, 그때 막으면 확정 자체가 불가능해진다.
          if (blocker !== null && blocker.kind !== 'ALREADY_IN_LEAGUE') {
            throw new ConflictException({
              code: 'LEAGUE_TEAM_INVALID',
              message: leagueAdmissionBlockerMessage(blocker),
            });
          }
          // BE-5 drop: 예전엔 확정과 함께 레거시 로스터 행을 만들었다. 이제 로스터 =
          // confirmed 등록이라, 바로 아래에서 이 등록의 status 를 confirmed 로 옮기는 것이
          // 곧 참가다 — 여기서 따로 만들 것이 없다. (`blocker` 검사는 그대로 남는다:
          // 확정 직전에 팀이 해체됐거나 형제 티어에 들어간 경우를 여기서 막는다.)
        }
      }

      const updated = await tx.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: {
          status: targetStatus,
          // 감사 finding #47: 이전에는 decision과 무관하게 항상 confirmedAt을 채워, '대기(waitlist)'
          // 처리된 팀도 참가 화면에 "확정일"이 표시됐다 — 팀이 대회 참가가 확정된 줄 알고 선수
          // 소집·이동을 준비하게 된다. confirmedAt은 실제로 '확정'된 경우에만 의미가 있다.
          ...(dto.decision === 'confirm'
            ? { confirmedAt: new Date(), confirmedByAdminUserId: admin.id }
            : {}),
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
      dto.decision === 'confirm'
        ? `"${registration.tournament.title}" 대회 참가가 확정됐어요.`
        : `"${registration.tournament.title}" 대회 대기자 명단에 등록됐어요.`,
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

    // ## 정규 리그는 거부 사유가 필수다 (D9) — 대회는 선택 그대로
    // DTO 에서 `@IsNotEmpty()` 로 막지 않는 이유는 **같은 DTO 를 대회도 쓰기 때문**이다.
    // 거기서 막으면 대회 운영이 함께 바뀐다. `kind` 로 갈라 리그에서만 요구한다.
    //
    // 리그 거부는 팀이 그 시즌을 통째로 못 뛰게 되는 조치라, 나중에 "왜 떨어졌나" 를
    // 답할 수 있어야 한다(정본: "정원 초과는 운영자가 **사유와 함께** 조정").
    if (registration.tournament.kind === V1CompetitionKind.regular_league && !dto.reason?.trim()) {
      throw new BadRequestException({
        code: 'LEAGUE_CANCEL_REASON_REQUIRED',
        message: '리그 참가를 거부하려면 사유를 입력해 주세요.',
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
      `"${registration.tournament.title}" 대회 참가 신청이 취소됐어요.`,
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
      // 감사 finding #48: 잔류 처리도 팀 자진 철회(withdrawCancelRequest)와 같은 '이전 상태로
      // 복원' 동작이라 같은 위험(정원 초과)을 안는다 — R17-006과 동일한 가드를 여기도 건다.
      // FOR UPDATE로 대회 row를 잠가 두 관리자가 동시에 마지막 자리를 처리해도 안전하게 만든다.
      if (CAPACITY_HOLD_STATUSES.includes(restoredStatus)) {
        await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${registration.tournamentId} FOR UPDATE`;
        const tournament = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
          where: { id: registration.tournamentId, deletedAt: null },
          select: { teamCount: true, kind: true },
        });
        if (!tournament) {
          throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
        }
        const reservedCount =
          capacityLimitOf(tournament) === null
            ? 0
            : await tx.v1TournamentRegistration.count({
                where: {
                  tournamentId: registration.tournamentId,
                  id: { not: registrationId },
                  status: { in: CAPACITY_HOLD_STATUSES },
                },
              });
        if (isCapacityFull(tournament, reservedCount)) {
          throw new ConflictException({
            code: 'TOURNAMENT_CAPACITY_FULL',
            message: '정원이 가득 차 취소 요청을 잔류 처리할 수 없어요.',
          });
        }
      }

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
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM "v1_tournament_registrations"
        WHERE id = ${registrationId}
        FOR UPDATE
      `;
      const registration = await tx.v1TournamentRegistration.findUnique({
        where: { id: registrationId },
      });
      if (!registration) {
        throw new NotFoundException({
          code: 'REGISTRATION_NOT_FOUND',
          message: '신청 내역을 찾을 수 없어요.',
        });
      }
      if (registration.status !== 'confirmed') {
        throw new ConflictException({
          code: 'REGISTRATION_NOT_CONFIRMED',
          message: '확정된 신청만 명단을 잠글 수 있어요.',
        });
      }

      const tournament = await findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
        where: { id: registration.tournamentId },
        select: {
          genderCategory: true,
          genderMinMale: true,
          genderMaxMale: true,
          genderMinFemale: true,
          genderMaxFemale: true,
        },
      });
      if (!tournament) {
        throw new NotFoundException({
          code: 'TOURNAMENT_NOT_FOUND',
          message: '대회를 찾을 수 없어요.',
        });
      }

      if (tournament.genderCategory === 'mixed') {
        const roster = await tx.v1TournamentPlayer.findMany({
          where: { registrationId, removedAt: null },
          select: { genderSnapshot: true },
        });
        const maleCount = roster.filter((player) => player.genderSnapshot === 'male').length;
        const femaleCount = roster.filter((player) => player.genderSnapshot === 'female').length;
        const male = this.genderQuotaVerdict(
          maleCount,
          tournament.genderMinMale,
          tournament.genderMaxMale,
        );
        const female = this.genderQuotaVerdict(
          femaleCount,
          tournament.genderMinFemale,
          tournament.genderMaxFemale,
        );

        if (!male.ok || !female.ok) {
          throw new ConflictException({
            code: 'TOURNAMENT_GENDER_QUOTA_NOT_MET',
            message: '성별 인원 조건을 충족하지 않아 명단을 확정할 수 없어요.',
            details: { male, female },
          });
        }
      }

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const payment = await this.prisma.v1TournamentPayment.findUnique({ where: { registrationId } });
    const playerCount = await this.countPlayers(registrationId);
    return this.serialize(result, payment ?? null, playerCount);
  }

  private genderQuotaVerdict(count: number, min: number | null, max: number | null) {
    return {
      count,
      min,
      max,
      ok: (min === null || count >= min) && (max === null || count <= max),
    };
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

  private async loadRegistration(
    registrationId: string,
  ): Promise<
    V1TournamentRegistration & { tournament: { title: string; kind: V1CompetitionKind | null } }
  > {
    const registration = await this.prisma.v1TournamentRegistration.findUnique({
      where: { id: registrationId },
      // `kind` 를 함께 싣는다 — 리그에만 걸리는 규칙(D9 거부 사유)이 이 값을 봐야 하는데,
      // 따로 조회하면 왕복이 하나 늘고 표면 게이트에 자리가 하나 더 생긴다. 이 조회는
      // 등록 id 로 시작하므로 **종류를 게이트로 쓰는 자리가 아니다**(무엇인지만 묻는다).
      include: { tournament: { select: { title: true, kind: true } } },
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
            confirmedByAdminUserId: payment.confirmedByAdminUserId,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

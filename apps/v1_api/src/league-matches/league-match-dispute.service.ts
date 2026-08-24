import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { LEAGUE_RESULT_DISPUTE_WINDOW_MS } from './league-result-dispute.constants';
import { LeagueMatchAdminService } from './league-match-admin.service';
import { LeagueMatchResultEntryService } from './league-match-result-entry.service';
import {
  FileLeagueMatchDisputeDto,
  RejectLeagueMatchDisputeDto,
  ResolveLeagueMatchDisputeDto,
} from './dto/league-match-dispute.dto';

/**
 * D2 (E2/E3/E4, 2026-08-24 사용자 확정): 리그 경기 결과 확정 후 이의 제기 + 운영자
 * 수락(정정/무효)/거부.
 *
 * - **제기**: 참가 두 팀(host/opponent)의 owner/manager만 -- 인가는
 *   `GamesService.assertTeamResultDisputeFileAuthority`(resolveActor 단일 지점)를
 *   그대로 통과시킨다. 확정(officialAt) 후 7일이 지났거나, 승강이 이미 확정된
 *   리그(E3)면 거부한다.
 * - **수락**: 정정은 이미 있는 `LeagueMatchResultEntryService.correctResult`를,
 *   무효는 `GamesService.voidTeamMatchResult`(D2 신규)를 그대로 재사용한다 --
 *   새 상태 전이 로직을 여기서 만들지 않는다. 처리 후 리그가 completed 였다면
 *   `LeagueMatchAdminService.revertCompletionInTx`로 active 로 되돌린다(승강 확정
 *   전이라는 전제는 위 파일 단계 검증이 이미 보장한다 -- 확정됐으면 애초에 이의
 *   제기가 막혔을 것이다).
 * - **거부**: 상태만 바꾼다. 결과에는 아무 영향이 없다.
 *
 * 순위표에서 무효 처리된 경기를 빼는 로직은 여기에 없다 -- `voidTeamMatchResult`의
 * doc comment 가 설명하듯 구조적으로 자동이다.
 */
@Injectable()
export class LeagueMatchDisputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
    private readonly notifications: NotificationsService,
    private readonly leagueAdmin: LeagueMatchAdminService,
    private readonly resultEntry: LeagueMatchResultEntryService,
  ) {}

  async fileDispute(user: V1AuthUser, leagueId: string, teamMatchId: string, dto: FileLeagueMatchDisputeDto) {
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({
      where: { id: teamMatchId, leagueId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        game: { select: { id: true, currentOfficialRevisionId: true } },
      },
    });
    if (teamMatch === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '이 리그의 대진이 아니에요.' });
    }
    if (teamMatch.game === null || teamMatch.game.currentOfficialRevisionId === null) {
      throw new ConflictException({
        code: 'LEAGUE_RESULT_NOT_OFFICIAL',
        message: '아직 확정된 결과가 없어 이의를 제기할 수 없어요.',
      });
    }
    const { actorUserId, teamId } = await this.games.assertTeamResultDisputeFileAuthority(user, teamMatch.game.id);
    // resolveActor의 team_result_dispute_file은 이미 host/opponent 멤버십만
    // 통과시키므로 이 분기는 방어적이다(실제로 도달하지 않는다).
    if (teamId !== teamMatch.hostTeamId && teamId !== teamMatch.approvedApplicantTeamId) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이 대진의 참가팀만 이의를 제기할 수 있어요.' });
    }

    const revision = await this.prisma.v1GameResultRevision.findUnique({
      where: { id: teamMatch.game.currentOfficialRevisionId },
      select: { id: true, state: true, officialAt: true },
    });
    if (revision === null || revision.state !== 'OFFICIAL' || revision.officialAt === null) {
      throw new ConflictException({
        code: 'LEAGUE_RESULT_NOT_OFFICIAL',
        message: '아직 확정된 결과가 없어 이의를 제기할 수 없어요.',
      });
    }
    const disputeDeadline = new Date(revision.officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS);
    if (new Date() > disputeDeadline) {
      throw new ConflictException({
        code: 'LEAGUE_RESULT_DISPUTE_WINDOW_EXPIRED',
        message: '결과 확정 후 7일이 지나 이의를 제기할 수 없어요.',
      });
    }
    // E3: 승강이 확정된 리그는 이의 제기 자체를 막는다. commitPromotions가 만드는
    // V1LeaguePromotion 행 존재 여부가 그 판정 근거다(league-series-admin.service.ts).
    const promotionCommitted = await this.prisma.v1LeaguePromotion.findFirst({
      where: { fromLeagueId: leagueId },
      select: { id: true },
    });
    if (promotionCommitted !== null) {
      throw new ConflictException({
        code: 'LEAGUE_PROMOTION_ALREADY_COMMITTED',
        message: '승강이 이미 확정된 리그는 이의를 제기할 수 없어요.',
      });
    }
    const existingOpen = await this.prisma.v1LeagueMatchDispute.findFirst({
      where: { teamMatchId, status: 'open' },
      select: { id: true },
    });
    if (existingOpen !== null) {
      throw new ConflictException({
        code: 'LEAGUE_RESULT_DISPUTE_ALREADY_OPEN',
        message: '이미 처리 대기 중인 이의가 있어요.',
      });
    }

    const dispute = await this.prisma.v1LeagueMatchDispute.create({
      data: {
        leagueId,
        teamMatchId,
        resultRevisionId: revision.id,
        raisedByUserId: actorUserId,
        raisedByTeamId: teamId,
        reason: dto.reason,
      },
    });
    this.notifyAdmins(teamMatchId);
    return {
      id: dispute.id,
      leagueId,
      teamMatchId,
      status: 'open' as const,
      createdAt: dispute.createdAt,
    };
  }

  async resolveDispute(user: V1AuthUser, disputeId: string, dto: ResolveLeagueMatchDisputeDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const dispute = await this.prisma.v1LeagueMatchDispute.findUnique({ where: { id: disputeId } });
    if (dispute === null) {
      throw new NotFoundException({ code: 'LEAGUE_RESULT_DISPUTE_NOT_FOUND', message: '이의를 찾을 수 없어요.' });
    }
    if (dispute.status !== 'open') {
      // Task 69/73과 같은 idempotent 계약: 이미 처리된 이의는 조용히 현재 상태를 반환한다.
      return { id: dispute.id, status: dispute.status, resolution: dispute.resolution, alreadyProcessed: true };
    }

    if (dto.resolution === 'correction') {
      await this.resultEntry.correctResult(user, dispute.leagueId, dispute.teamMatchId, {
        homeScore: dto.homeScore!,
        awayScore: dto.awayScore!,
        reason: dto.note,
      });
    } else {
      await this.applyVoid(user, dispute.teamMatchId, disputeId, dto.note);
    }

    const alreadyClosed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.v1LeagueMatchDispute.updateMany({
        where: { id: disputeId, status: 'open' },
        data: {
          status: 'accepted',
          resolution: dto.resolution,
          resolutionNote: dto.note,
          resolvedByAdminUserId: admin.id,
          resolvedAt: new Date(),
        },
      });
      if (updated.count === 0) return true;
      // R6/D-3: 전 대진이 확정돼 completed로 자동 전이했던 리그라도, 이의 수락으로
      // 결과가 바뀌었으니(정정) 또는 이 경기가 순위표에서 빠졌으니(무효) active로
      // 되돌려야 다음 확정 사이클(승강 확정 전 재검토)이 다시 열린다.
      await this.leagueAdmin.revertCompletionInTx(tx, admin, dispute.leagueId, `이의 수락(${dto.resolution}) 처리로 자동 되돌림: ${dto.note}`);
      return false;
    });

    return {
      id: disputeId,
      status: 'accepted' as const,
      resolution: dto.resolution,
      alreadyProcessed: alreadyClosed,
    };
  }

  async rejectDispute(user: V1AuthUser, disputeId: string, dto: RejectLeagueMatchDisputeDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const updated = await this.prisma.v1LeagueMatchDispute.updateMany({
      where: { id: disputeId, status: 'open' },
      data: {
        status: 'rejected',
        resolutionNote: dto.note,
        resolvedByAdminUserId: admin.id,
        resolvedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      const existing = await this.prisma.v1LeagueMatchDispute.findUnique({ where: { id: disputeId } });
      if (existing === null) {
        throw new NotFoundException({ code: 'LEAGUE_RESULT_DISPUTE_NOT_FOUND', message: '이의를 찾을 수 없어요.' });
      }
      return { id: disputeId, status: existing.status, alreadyProcessed: true };
    }
    return { id: disputeId, status: 'rejected' as const, alreadyProcessed: false };
  }

  async listDisputes(status?: 'open' | 'accepted' | 'rejected') {
    return this.prisma.v1LeagueMatchDispute.findMany({
      where: status === undefined ? {} : { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * 무효 경로의 최소 재개(resumability): `voidTeamMatchResult`가 성공한 직후,
   * dispute 행을 accepted로 갱신하기 전에 요청이 끊기면(네트워크 장애 등) 재시도가
   * `RESULT_VOID_NO_OFFICIAL_REVISION`(이미 VOID라 다시 무효화할 공식 결과가 없음)로
   * 실패한다 -- 이 경우 "이미 적용된 것"으로 보고 그대로 진행한다(정정 경로가
   * `correctResultOnce`에서 이미 하는 것과 같은 종류의 재시도 흡수). 그 외 원인의
   * 실패는 그대로 전파한다.
   */
  private async applyVoid(user: V1AuthUser, teamMatchId: string, disputeId: string, note: string): Promise<void> {
    const teamMatch = await this.prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: teamMatchId },
      select: { game: { select: { id: true, version: true } } },
    });
    const gameId = teamMatch.game?.id;
    if (gameId === undefined) {
      throw new ConflictException({ code: 'LEAGUE_FIXTURE_NOT_MATCHED', message: '상대팀이 확정되지 않은 대진은 처리할 수 없어요.' });
    }
    try {
      await this.games.voidTeamMatchResult(user, gameId, `league-dispute:${disputeId}:void`, {
        expectedVersion: teamMatch.game!.version,
        clientCommandId: `league-dispute:${disputeId}:void`,
        reason: note,
      });
    } catch (error) {
      if (
        error instanceof ConflictException &&
        (error.getResponse() as { code?: unknown }).code === 'RESULT_VOID_NO_OFFICIAL_REVISION'
      ) {
        return;
      }
      throw error;
    }
  }

  /**
   * 운영자(owner/ops, active) 전원에게 신규 이의를 알린다 --
   * `game-result-submitted-escalation.service.ts`의 `notifyLeagueEscalation`이 raw
   * SQL로 하는 것과 같은 수신자 판정(admin_role IN ('owner','ops'), 계정 active)을
   * `NotificationsService`를 통해 재사용한다(이 서비스는 정식 DI 컨텍스트라 raw SQL
   * 대신 기존 알림 경로를 그대로 쓸 수 있다).
   */
  private notifyAdmins(teamMatchId: string): void {
    this.notifications.emitToManyDeferred(
      async () =>
        (
          await this.prisma.v1AdminUser.findMany({
            where: {
              adminRole: { in: ['owner', 'ops'] },
              status: 'active',
              revokedAt: null,
              user: { accountStatus: 'active' },
            },
            select: { userId: true },
          })
        ).map((admin) => admin.userId),
      'league_result_dispute_filed',
      teamMatchId,
    );
  }
}

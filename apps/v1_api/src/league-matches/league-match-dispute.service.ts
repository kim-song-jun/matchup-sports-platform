import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminContextService } from '../common/admin-context.service';
import { GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { NotificationEventType, NotificationsService } from '../notifications/notifications.service';
import { judgeLeagueDisputeEligibility } from './league-result-dispute-eligibility';
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
    // E3: 승강이 확정된 리그는 이의 제기 자체를 막는다. commitPromotions가 만드는
    // V1LeaguePromotion 행 존재 여부가 그 판정 근거다(league-series-admin.service.ts).
    // U3: 이 판정(기간 만료·승강 확정)은 team-matches.service.ts의 상세 응답이 미리
    // 보여주는 disputeBlockedReason과 **같은 순수 함수**(league-result-dispute-eligibility.ts)를
    // 공유한다 -- 여기서 새로 로직을 만들면 화면과 서버가 다른 답을 낼 수 있다.
    const promotionCommitted = await this.prisma.v1LeaguePromotion.findFirst({
      where: { fromLeagueId: leagueId },
      select: { id: true },
    });
    const { blockedReason } = judgeLeagueDisputeEligibility({
      officialAt: revision.officialAt,
      now: new Date(),
      promotionCommitted: promotionCommitted !== null,
    });
    if (blockedReason === 'window_expired') {
      throw new ConflictException({
        code: 'LEAGUE_RESULT_DISPUTE_WINDOW_EXPIRED',
        message: '결과 확정 후 7일이 지나 이의를 제기할 수 없어요.',
      });
    }
    if (blockedReason === 'promotion_committed') {
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
    // 리그 알림 문구 전용화(2026-08-25) 문제 2: 이의를 낸 팀이 아닌 상대 팀에도 알린다.
    // hostTeamId/approvedApplicantTeamId 는 이 함수 앞부분에서 이미 조회해 뒀으니
    // 재조회하지 않는다 -- teamId(필자 팀)와 다른 쪽이 상대 팀이다.
    const opposingTeamId = teamId === teamMatch.hostTeamId ? teamMatch.approvedApplicantTeamId : teamMatch.hostTeamId;
    this.notifyOpposingTeam(opposingTeamId, teamMatchId, `"${dto.reason}" 사유로 이의가 접수됐어요.`);
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

    if (!alreadyClosed) {
      const isCorrection = dto.resolution === 'correction';
      this.notifyBothTeams(
        dispute.teamMatchId,
        isCorrection ? 'league_match_dispute_corrected' : 'league_match_dispute_voided',
        `"${dto.note}" 사유로 결과가 ${isCorrection ? '정정' : '무효 처리'}됐어요.`,
      );
    }

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
    // updateMany는 갱신된 행의 필드를 돌려주지 않으므로(count만) 알림에 필요한
    // teamMatchId를 별도로 읽는다 -- resolveDispute가 이미 dispute 행을 findUnique로
    // 읽어 두는 것과 같은 이유(updateMany의 원자적 status='open' 가드는 유지하면서
    // 부가 정보만 추가로 조회).
    const dispute = await this.prisma.v1LeagueMatchDispute.findUniqueOrThrow({
      where: { id: disputeId },
      select: { teamMatchId: true },
    });
    this.notifyBothTeams(dispute.teamMatchId, 'league_match_dispute_rejected', `"${dto.note}" 사유로 이의가 받아들여지지 않았어요.`);
    return { id: disputeId, status: 'rejected' as const, alreadyProcessed: false };
  }

  async listDisputes(user: V1AuthUser, status?: 'open' | 'accepted' | 'rejected') {
    // 읽기 전용이라 getActiveAdmin(변경 권한까지는 요구하지 않음) — 같은 모듈의
    // LeagueMatchAdminService.list() 와 동일한 게이트다.
    await this.adminContext.getActiveAdmin(user.id);
    const [disputes, grouped] = await Promise.all([
      this.prisma.v1LeagueMatchDispute.findMany({
        where: status === undefined ? {} : { status },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      // 상태 탭 카운트는 현재 status 필터와 무관하게 전체 분포여야 한다 — 필터된
      // where 를 재사용하면 활성 탭 외 두 탭이 항상 0으로 보인다.
      this.prisma.v1LeagueMatchDispute.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);
    const counts: Record<'open' | 'accepted' | 'rejected', number> = { open: 0, accepted: 0, rejected: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    return { items: await this.enrichDisputeRows(disputes), counts };
  }

  /**
   * 어드민 이의 목록 화면은 리그 제목 · 대진 팀 이름 매치업 · 제기 팀 이름을 사람이 읽을
   * 수 있는 형태로 보여줘야 하는데, `V1LeagueMatchDispute`는 leagueId/teamMatchId/
   * raisedByTeamId 셋 다 FK 관계가 없는 평문 문자열이다(스키마 주석 참고 — 신뢰
   * 무결성보다 최소 풋프린트를 택함). 이의 건수만큼 반복 조회하면 N+1이 되므로,
   * `league-match-admin.service.ts`의 listTeams()/detail()과 같은 패턴으로 리그·
   * 대진·팀을 각각 단일 IN 조회로 모아 온다.
   */
  private async enrichDisputeRows(
    disputes: Array<{
      id: string;
      leagueId: string;
      teamMatchId: string;
      raisedByTeamId: string;
      reason: string;
      status: 'open' | 'accepted' | 'rejected';
      resolution: 'correction' | 'void' | null;
      resolutionNote: string | null;
      resolvedAt: Date | null;
      createdAt: Date;
    }>,
  ) {
    if (disputes.length === 0) return [];

    const leagueIds = [...new Set(disputes.map((dispute) => dispute.leagueId))];
    const teamMatchIds = [...new Set(disputes.map((dispute) => dispute.teamMatchId))];
    const [leagues, teamMatches] = await Promise.all([
      this.prisma.v1League.findMany({ where: { id: { in: leagueIds } }, select: { id: true, title: true } }),
      this.prisma.v1TeamMatch.findMany({
        where: { id: { in: teamMatchIds } },
        select: {
          id: true,
          hostTeamId: true,
          approvedApplicantTeamId: true,
          // 처리 모달의 정정 경로가 "전(현재 공식 스코어) → 후(입력값)" 비교를 보여주려면
          // 여기서 currentOfficialRevisionId 를 미리 가져와야 한다 — 이의별로 다시 조회하면
          // N+1이라 아래에서 리비전 id 를 모아 v1GameOfficialFact 를 단일 IN 조회한다
          // (league-match-admin.service.ts detail() 과 같은 패턴).
          game: { select: { id: true, currentOfficialRevisionId: true } },
        },
      }),
    ]);
    const leagueById = new Map(leagues.map((league) => [league.id, league]));
    const teamMatchById = new Map(teamMatches.map((teamMatch) => [teamMatch.id, teamMatch]));

    const teamIds = [
      ...new Set([
        ...disputes.map((dispute) => dispute.raisedByTeamId),
        ...teamMatches.flatMap((teamMatch) =>
          [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId].filter((id): id is string => id !== null),
        ),
      ]),
    ];
    const officialRevisionIds = teamMatches
      .map((teamMatch) => teamMatch.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const [teams, facts] = await Promise.all([
      teamIds.length === 0
        ? Promise.resolve([])
        : this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
      officialRevisionIds.length === 0
        ? Promise.resolve([])
        : this.prisma.v1GameOfficialFact.findMany({
            where: { revisionId: { in: officialRevisionIds } },
            select: { gameId: true, homeScore: true, awayScore: true },
          }),
    ]);
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));

    return disputes.map((dispute) => {
      const teamMatch = teamMatchById.get(dispute.teamMatchId);
      const fact = teamMatch?.game ? factByGameId.get(teamMatch.game.id) : undefined;
      return {
        id: dispute.id,
        leagueId: dispute.leagueId,
        leagueTitle: leagueById.get(dispute.leagueId)?.title ?? '(삭제된 리그)',
        teamMatchId: dispute.teamMatchId,
        homeTeamName: teamMatch ? teamNameById.get(teamMatch.hostTeamId) ?? '(삭제된 팀)' : '(삭제된 대진)',
        awayTeamName:
          teamMatch?.approvedApplicantTeamId != null
            ? teamNameById.get(teamMatch.approvedApplicantTeamId) ?? '(삭제된 팀)'
            : '(삭제된 대진)',
        reason: dispute.reason,
        raisedByTeamId: dispute.raisedByTeamId,
        raisedByTeamName: teamNameById.get(dispute.raisedByTeamId) ?? '(삭제된 팀)',
        status: dispute.status,
        resolution: dispute.resolution,
        resolutionNote: dispute.resolutionNote,
        resolvedAt: dispute.resolvedAt,
        createdAt: dispute.createdAt,
        currentHomeScore: fact?.homeScore ?? null,
        currentAwayScore: fact?.awayScore ?? null,
      };
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

  /**
   * 리그 알림 문구 전용화(2026-08-25) 문제 2, 접수 시점: 이의를 낸 팀이 아닌 상대 팀의
   * owner/manager(active)에게 알린다. 호출부가 이미 hostTeamId/approvedApplicantTeamId를
   * 조회해 뒀으므로 어느 쪽이 "상대"인지는 여기서 다시 묻지 않고 그대로 받는다 --
   * opposingTeamId가 null이면(상대팀이 확정되지 않은 대진) 아무 것도 하지 않는다
   * (실제로는 이의 제기 자체가 공식 결과를 전제하므로 도달하지 않는 방어적 분기다).
   */
  private notifyOpposingTeam(opposingTeamId: string | null, teamMatchId: string, body: string): void {
    if (opposingTeamId === null) return;
    this.notifyTeamMembers([opposingTeamId], teamMatchId, 'league_match_dispute_received', body);
  }

  /**
   * 리그 알림 문구 전용화(2026-08-25) 문제 2, 처리 시점: 정정/무효/거부 결과를 양 팀
   * (host + approvedApplicant) owner/manager(active) 전원에게 알린다. resolveDispute/
   * rejectDispute 호출 시점에는 팀 id가 아직 없으므로(dispute 행에는 teamMatchId만
   * 있다), 팀 조회 자체도 emitToManyDeferred의 fire-and-forget 클로저 안에서
   * 수행한다 -- notifyOpposingTeam처럼 호출부가 이미 알고 있는 값이 아니라서
   * notifyTeamMembers처럼 미리 팀 id를 받을 수 없다.
   */
  private notifyBothTeams(teamMatchId: string, type: NotificationEventType, body: string): void {
    this.notifications.emitToManyDeferred(
      async () => {
        const teamMatch = await this.prisma.v1TeamMatch.findUnique({
          where: { id: teamMatchId },
          select: { hostTeamId: true, approvedApplicantTeamId: true },
        });
        const teamIds = [teamMatch?.hostTeamId, teamMatch?.approvedApplicantTeamId].filter(
          (id): id is string => id !== undefined && id !== null,
        );
        return this.resolveTeamMemberUserIds(teamIds);
      },
      type,
      teamMatchId,
      body,
    );
  }

  /** teamIds 전원(host/opponent 여러 팀 가능)의 active owner/manager userId 목록. */
  private async resolveTeamMemberUserIds(teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return [];
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    return [...new Set(memberships.map((m) => m.userId))];
  }

  private notifyTeamMembers(teamIds: string[], teamMatchId: string, type: NotificationEventType, body: string): void {
    if (teamIds.length === 0) return;
    this.notifications.emitToManyDeferred(
      () => this.resolveTeamMemberUserIds(teamIds),
      type,
      teamMatchId,
      body,
    );
  }
}

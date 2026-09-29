import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import type { GameRosterBatchDto, GameRosterBatchOp } from './dto/team-game-roster.dto';
import { buildTeamRosterMatrix } from './game-roster-matrix';
import { syncPreparedGameSideRoster } from './game-roster-sync';
import { GameRosterService } from './game-roster.service';
import { resolveTeamRosterAccess } from './team-roster-access';
import { loadTeamRosterColumns } from './team-roster-columns';

export interface GameRosterBatchResult {
  readonly gameId: string;
  readonly sideId: string;
  readonly userId: string;
  readonly op: GameRosterBatchOp;
  readonly alreadyApplied: boolean;
}

/** Task 178 팀 B·어드민 — 한 팀의 선수 × 시작 전 대회·리그 경기 표와 일괄 변경. */
@Injectable()
export class TeamGameRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gameRoster: GameRosterService,
    private readonly staffAccess: TournamentStaffAccessService,
  ) {}

  // 조회는 DB 를 바꾸지 않는다(리그 명단 자동 채움은 동기화 쓰기 경로에서만).
  getTeamMatrix(user: V1AuthUser, teamId: string) {
    return this.prisma.$transaction(async (tx) => {
      const access = await resolveTeamRosterAccess(tx, teamId, user.id);
      if (access === null || access.viewerRole === 'TEAM_MEMBER') {
        throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '팀장·매니저만 경기 명단을 관리할 수 있어요.' });
      }
      const columns = await loadTeamRosterColumns(tx, { teamId, competitionId: null, now: new Date() });
      return {
        teamId,
        viewerRole: access.viewerRole,
        ...buildTeamRosterMatrix({ columns, canWrite: access.writeRole !== null }),
      };
    });
  }

  /**
   * 어드민 참가 신청 화면의 팀 행 펼침. 플랫폼 어드민(support 는 읽기만)과 그 대회 스태프가 본다 —
   * 참가 신청 목록과 같은 어드민 선에 스태프 읽기를 더했다. 쓰기는 경기 단위 API 를 쓴다.
   */
  getRegistrationMatrix(user: V1AuthUser, competitionId: string, registrationId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 권한을 먼저 본다 — 신청 id 가 어느 대회 것인지를 권한 없는 사람에게 404/403 차이로 알려 주지 않는다.
      const viewer = await this.resolveCompetitionViewer(user.id, competitionId);
      const registration = await tx.v1TournamentRegistration.findFirst({
        where: { id: registrationId, tournamentId: competitionId },
        select: { teamId: true },
      });
      if (registration === null) {
        throw new NotFoundException({ code: 'REGISTRATION_NOT_FOUND', message: '참가 신청을 찾을 수 없어요.' });
      }
      const columns = await loadTeamRosterColumns(tx, { teamId: registration.teamId, competitionId, now: new Date() });
      return {
        registrationId,
        teamId: registration.teamId,
        competitionId,
        viewerRole: viewer.viewerRole,
        ...buildTeamRosterMatrix({ columns, canWrite: viewer.canWrite }),
      };
    });
  }

  /**
   * 여러 경기·선수의 빼기·되돌리기를 한 트랜잭션으로. 권한은 경기마다 그 사이드 기준으로 다시 보고,
   * 시작된 경기가 하나라도 섞이면 아무것도 쓰지 않는다(409).
   */
  applyBatch(user: V1AuthUser, teamId: string, dto: GameRosterBatchDto) {
    const keys = dto.changes.map((change) => `${change.gameId}:${change.userId}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException({
        code: 'ROSTER_BATCH_DUPLICATE_CHANGE',
        message: '같은 경기·선수의 변경이 두 번 들어 있어요.',
      });
    }
    if (dto.changes.some((change) => change.op === 'REVOKE' && change.reason !== undefined)) {
      throw new BadRequestException({
        code: 'ROSTER_BATCH_REASON_ON_REVOKE',
        message: '되돌리기에는 사유를 붙이지 않아요.',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const team = await tx.v1Team.findFirst({ where: { id: teamId, deletedAt: null }, select: { id: true } });
      if (team === null) throw new NotFoundException({ code: 'TEAM_NOT_FOUND', message: '팀을 찾을 수 없어요.' });
      const gameIds = [...new Set(dto.changes.map((change) => change.gameId))];
      const sides = await tx.v1GameSide.findMany({
        where: { gameId: { in: gameIds }, teamId },
        select: { id: true, gameId: true },
      });
      const sideIdByGame = new Map(sides.map((side) => [side.gameId, side.id]));
      const missing = gameIds.filter((gameId) => !sideIdByGame.has(gameId));
      if (missing.length > 0) {
        throw new NotFoundException({
          code: 'GAME_SIDE_NOT_FOUND',
          message: '이 팀이 뛰는 경기가 아니에요.',
          details: { gameIds: missing },
        });
      }
      const accessByGame = new Map<string, Awaited<ReturnType<GameRosterService['authorizeSide']>>>();
      for (const gameId of gameIds) {
        const target = { gameId, sideId: sideIdByGame.get(gameId)! };
        accessByGame.set(gameId, await this.gameRoster.authorizeSide(tx, user.id, target, 'write'));
      }
      await this.gameRoster.lockScheduledGames(
        tx,
        gameIds.map((gameId) => ({ gameId, sideId: sideIdByGame.get(gameId)! })),
      );

      const results: GameRosterBatchResult[] = [];
      const touched = new Set<string>();
      for (const change of dto.changes) {
        const target = { gameId: change.gameId, sideId: sideIdByGame.get(change.gameId)! };
        const { alreadyApplied } =
          change.op === 'EXCLUDE'
            ? await this.gameRoster.applyExclude(
                tx,
                { userId: user.id, role: accessByGame.get(change.gameId)!.writeRole! },
                target,
                { userId: change.userId, reason: change.reason },
              )
            : await this.gameRoster.applyRevoke(tx, user.id, target, change.userId);
        if (!alreadyApplied) touched.add(change.gameId);
        results.push({ ...target, userId: change.userId, op: change.op, alreadyApplied });
      }
      for (const gameId of touched) {
        await syncPreparedGameSideRoster(tx, { gameId, sideId: sideIdByGame.get(gameId)! });
      }
      return { teamId, results };
    });
  }

  private async resolveCompetitionViewer(
    userId: string,
    competitionId: string,
  ): Promise<{ viewerRole: 'ADMIN' | 'STAFF'; canWrite: boolean }> {
    const admin = await this.prisma.v1AdminUser.findUnique({
      where: { userId },
      select: { adminRole: true, status: true, revokedAt: true, user: { select: { accountStatus: true } } },
    });
    if (admin !== null && admin.status === 'active' && admin.revokedAt === null && admin.user.accountStatus === 'active') {
      return { viewerRole: 'ADMIN', canWrite: admin.adminRole !== 'support' };
    }
    // 스태프가 아니면 STAFF_SCOPE_DENIED(403) 로 끝난다. 쓰기 가능 여부는 경기 단위 인가와 같은 액션으로 본다.
    await this.staffAccess.assertAccess({ userId, action: 'read', resource: { tournamentId: competitionId } });
    const canWrite = await this.staffAccess
      .assertAccess({ userId, action: 'lineup_mutate', resource: { tournamentId: competitionId } })
      .then(
        () => true,
        (error: unknown) => {
          if (error instanceof ForbiddenException) return false;
          throw error;
        },
      );
    return { viewerRole: 'STAFF', canWrite };
  }
}

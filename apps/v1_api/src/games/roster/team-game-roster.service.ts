import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import type { GameRosterBatchDto, GameRosterBatchOp } from './dto/team-game-roster.dto';
import { buildTeamRosterMatrix } from './game-roster-matrix';
import { isUnmigratedTeamAuthoredLineup, syncLockedCompetitionTeam, syncPreparedGameSideRoster, upcomingCompetitionGameWhere } from './game-roster-sync';
import { loadGameRosterContext } from './game-roster-loader';
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

/** Task 179 팀 B·어드민 — 한 팀의 선수 × 시작 전 대회·리그 경기 표와 일괄 변경. */
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
    const keys = dto.changes.map((change) => `${change.gameId}:${change.userId}:${change.op === "SET_GOALKEEPER" ? "ROLE" : "ATTENDANCE"}`);
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
    if (dto.changes.some((change) => change.op === "SET_GOALKEEPER" ? typeof change.goalkeeper !== "boolean" || change.reason !== undefined : change.goalkeeper !== undefined)) {
      throw new BadRequestException({ code: "ROSTER_BATCH_INVALID_GOALKEEPER", message: "골키퍼 지정 값을 확인해 주세요." });
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
      const roleScopes = new Map<string, string>();
      const roleKeys = new Set<string>();
      for (const change of dto.changes.filter((row) => row.op === 'SET_GOALKEEPER')) {
        const context = await loadGameRosterContext(tx, { gameId: change.gameId, sideId: sideIdByGame.get(change.gameId)! });
        if (context === null || context.teamId !== teamId) throw new ConflictException({ code: 'COMMAND_CONCURRENCY_CONFLICT', message: '경기 팀이 바뀌었어요. 새로고침해 주세요.' });
        // A competition-wide default needs competition-wide authority, not a single assigned fixture.
        if (accessByGame.get(change.gameId)!.writeRole === 'STAFF') {
          await this.staffAccess.assertAccess({ userId: user.id, action: 'lineup_mutate', resource: { tournamentId: context.competitionId } });
        }
        const key = context.competitionId + ':' + change.userId;
        if (roleKeys.has(key)) throw new BadRequestException({ code: 'ROSTER_BATCH_DUPLICATE_CHANGE', message: '같은 대회·선수의 골키퍼 변경은 한 번만 보내 주세요.' });
        roleKeys.add(key);
        roleScopes.set(change.gameId, context.competitionId);
      }
      const competitionIds = [...new Set(roleScopes.values())].sort();
      const affected = competitionIds.length === 0 ? [] : await tx.v1Game.findMany({
        where: { OR: competitionIds.map((id) => upcomingCompetitionGameWhere(id, teamId, new Date())) },
        select: { id: true, sides: { where: { teamId }, select: { id: true } } },
      });
      for (const game of affected) if (game.sides[0]) sideIdByGame.set(game.id, game.sides[0].id);
      const lockedIds = [...new Set([...gameIds, ...affected.map((game) => game.id)])];
      await this.gameRoster.lockScheduledGames(tx, lockedIds.map((gameId) => ({ gameId, sideId: sideIdByGame.get(gameId)! })));
      // Propagation must not silently skip an old team-authored league lineup.
      for (const game of affected) {
        const context = await loadGameRosterContext(tx, { gameId: game.id, sideId: sideIdByGame.get(game.id)! });
        if (context === null || context.teamId !== teamId || !competitionIds.includes(context.competitionId)) throw new ConflictException({ code: 'COMMAND_CONCURRENCY_CONFLICT', message: '경기 팀이 바뀌었어요. 새로고침해 주세요.' });
        if (!context.isLeague) continue;
        const latest = await tx.v1GameLineup.findFirst({ where: { gameId: game.id, sideId: context.sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
        if (latest !== null && await isUnmigratedTeamAuthoredLineup(tx, game.id, context.sideId, latest)) throw new ConflictException({ code: 'ROSTER_GOALKEEPER_MIGRATION_REQUIRED', message: '기존 경기 명단을 옮긴 뒤 골키퍼를 바꿀 수 있어요. 운영진에게 문의해 주세요.' });
      }

      const results: GameRosterBatchResult[] = [];
      const touched = new Set<string>();
      for (const change of dto.changes) {
        const target = { gameId: change.gameId, sideId: sideIdByGame.get(change.gameId)!, teamId };
        const actor = { userId: user.id, role: accessByGame.get(change.gameId)!.writeRole! };
        const { alreadyApplied } =
          change.op === "SET_GOALKEEPER"
            ? await this.gameRoster.applyGoalkeeper(tx, actor, target, change.userId, change.goalkeeper!)
            : change.op === 'EXCLUDE'
            ? await this.gameRoster.applyExclude(tx, actor, target, { userId: change.userId, reason: change.reason })
            : await this.gameRoster.applyRevoke(tx, actor, target, change.userId);
        if (!alreadyApplied) touched.add(change.gameId);
        results.push({ gameId: target.gameId, sideId: target.sideId, userId: change.userId, op: change.op, alreadyApplied });
      }
      const changedCompetitions = new Set([...touched].flatMap((gameId) => roleScopes.has(gameId) ? [roleScopes.get(gameId)!] : []));
      for (const competitionId of [...changedCompetitions].sort()) {
        await syncLockedCompetitionTeam(tx, { competitionId, teamId }, new Set(lockedIds));
      }
      for (const gameId of touched) {
        if (!roleScopes.has(gameId)) await syncPreparedGameSideRoster(tx, { gameId, sideId: sideIdByGame.get(gameId)! });
      }
      return { teamId, results, affectedGames: lockedIds.map((gameId) => ({ gameId, sideId: sideIdByGame.get(gameId)! })) };
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

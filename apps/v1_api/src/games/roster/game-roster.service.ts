import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  V1GameRosterAdjustmentAction,
  V1GameSourceType,
  V1GameState,
  type V1GameRosterAdjustment,
} from '@prisma/client';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { participantDisplayName } from '../../tournaments/participant-display-name';
import { selectLineupParticipantsWithDraftFallback } from '../core/latest-lineup-participants';
import { GamesService } from '../games.service';
import type { CreateGameRosterAdjustmentDto } from './dto/game-roster-adjustment.dto';
import type { GameRosterActorRole } from './game-roster-computation';
import { loadGameRoster, loadJerseyRegistrationId } from './game-roster-loader';
import { isUnmigratedTeamAuthoredLineup, lockRosterWriteScope, syncPreparedGameSideRoster } from './game-roster-sync';
import { buildGameRosterView, decideGameRosterAccess, type GameRosterAccess, type GameRosterView } from './game-roster-view';
import { competitionOpponentName } from './team-roster-columns';

type Tx = Prisma.TransactionClient;

interface SideTarget {
  readonly gameId: string;
  readonly sideId: string;
}

/** 인가를 받은 때의 사이드 팀. 잠근 뒤 이 팀이 아니면 쓰지 않는다. */
export interface TeamSideTarget extends SideTarget {
  readonly teamId: string;
}

export type GameRosterSideAccess = GameRosterAccess & { readonly teamId: string };

export type TeamGameRosterView = GameRosterView & { readonly opponentName: string | null };

export interface GameRosterAdjustmentView {
  readonly id: string;
  readonly userId: string;
  readonly reason: string | null;
  readonly actorRole: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export interface GameRosterHistoryEvent {
  readonly type: 'EXCLUDE' | 'REVOKE';
  readonly adjustmentId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly reason: string | null;
  /** 사이드 팀이 바뀌어 자동으로 되돌린 기록은 userId null · role SYSTEM. */
  readonly actor: { userId: string | null; displayName: string; role: string | null };
  readonly at: Date;
}

function adjustmentView(row: V1GameRosterAdjustment): GameRosterAdjustmentView {
  return {
    id: row.id,
    userId: row.userId,
    reason: row.reason,
    actorRole: row.actorRole,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
  };
}

function rosterNotAvailable(message: string) {
  return new NotFoundException({ code: 'GAME_ROSTER_NOT_AVAILABLE', message });
}

// 인가는 잠그기 전에 읽은 사이드 팀 기준이다. 그 사이 진출·대진 수정으로 팀이 바뀌었으면 쓰지 않는다.
function assertSideTeamUnchanged(target: TeamSideTarget, currentTeamId: string | null): void {
  if (currentTeamId === target.teamId) return;
  throw new ConflictException({
    code: 'COMMAND_CONCURRENCY_CONFLICT',
    message: '경기 팀이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요.',
    details: { gameId: target.gameId, sideId: target.sideId },
  });
}

/** 계정 id → 화면 표시 이름. 없는 계정은 맵에서 빠진다. */
export async function loadDisplayNames(tx: Tx, userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const users = await tx.v1User.findMany({
    where: { id: { in: ids } },
    select: { id: true, profile: { select: { nickname: true, displayName: true } } },
  });
  return new Map(users.map((row) => [row.id, participantDisplayName({ user: { profile: row.profile } })]));
}

/** Task 179 — 대회·리그 경기 한 사이드의 명단 조회와 경기별 빼기·되돌리기. */
@Injectable()
export class GameRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  // 조회는 DB 를 바꾸지 않는다(리그 명단 자동 채움은 동기화 쓰기 경로에서만). 인가와 계산을 한 트랜잭션에서 읽는다.
  getRoster(user: V1AuthUser, target: SideTarget): Promise<GameRosterView> {
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorizeSide(tx, user.id, target, 'read');
      return this.readView(tx, target, access);
    });
  }

  /** 팀·경기로 그 팀 사이드를 찾아 `getRoster` 와 같은 인가·본문으로 읽는다. */
  getTeamGameRoster(user: V1AuthUser, input: { teamId: string; gameId: string }): Promise<TeamGameRosterView> {
    return this.prisma.$transaction(async (tx) => {
      const game = await tx.v1Game.findUnique({
        where: { id: input.gameId },
        select: {
          sides: { where: { teamId: input.teamId }, select: { id: true } },
          teamMatch: {
            select: { hostTeamId: true, hostTeam: { select: { name: true } }, approvedApplicantTeam: { select: { name: true } } },
          },
        },
      });
      if (game === null) throw new NotFoundException({ code: 'GAME_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
      const side = game.sides[0];
      if (side === undefined) throw rosterNotAvailable('이 팀이 뛰는 경기가 아니에요.');
      const target = { gameId: input.gameId, sideId: side.id };
      const access = await this.authorizeSide(tx, user.id, target, 'read');
      // 찾은 뒤 인가하는 사이 대진 수정으로 사이드 팀이 바뀌었으면 다른 팀 명단을 이 팀 경로로 주지 않는다.
      if (access.teamId !== input.teamId) throw rosterNotAvailable('이 팀이 뛰는 경기가 아니에요.');
      const view = await this.readView(tx, target, access);
      return {
        ...view,
        opponentName: game.teamMatch === null ? null : competitionOpponentName(game.teamMatch, input.teamId),
      };
    });
  }

  listAdjustments(user: V1AuthUser, target: SideTarget) {
    return this.prisma.$transaction(async (tx) => {
      const { teamId } = await this.authorizeSide(tx, user.id, target, 'read');
      const rows = await tx.v1GameRosterAdjustment.findMany({
        where: { gameId: target.gameId, sideId: target.sideId, teamId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const names = await loadDisplayNames(
        tx,
        rows.flatMap((row) => [row.userId, row.actorUserId, ...(row.revokedByUserId === null ? [] : [row.revokedByUserId])]),
      );
      const name = (userId: string) => names.get(userId) ?? '알 수 없음';
      const events: GameRosterHistoryEvent[] = [];
      for (const row of rows) {
        const common = { adjustmentId: row.id, userId: row.userId, displayName: name(row.userId), reason: row.reason };
        events.push({
          ...common,
          type: 'EXCLUDE',
          actor: { userId: row.actorUserId, displayName: name(row.actorUserId), role: row.actorRole },
          at: row.createdAt,
        });
        if (row.revokedAt !== null) {
          const revoker = row.revokedByUserId;
          events.push({
            ...common,
            type: 'REVOKE',
            actor: { userId: revoker, displayName: revoker === null ? '시스템' : name(revoker), role: row.revokedByRole },
            at: row.revokedAt,
          });
        }
      }
      events.sort((a, b) => a.at.getTime() - b.at.getTime());
      return { gameId: target.gameId, sideId: target.sideId, teamId, events };
    });
  }

  exclude(user: V1AuthUser, target: SideTarget, dto: CreateGameRosterAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorizeSide(tx, user.id, target, 'write');
      await this.lockScheduledGames(tx, [target]);
      const result = await this.applyExclude(
        tx,
        { userId: user.id, role: access.writeRole! },
        { ...target, teamId: access.teamId },
        dto,
      );
      if (!result.alreadyApplied) await syncPreparedGameSideRoster(tx, target);
      return { ...result, roster: await this.readView(tx, target, access) };
    });
  }

  revoke(user: V1AuthUser, target: SideTarget, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorizeSide(tx, user.id, target, 'write');
      await this.lockScheduledGames(tx, [target]);
      const result = await this.applyRevoke(
        tx,
        { userId: user.id, role: access.writeRole! },
        { ...target, teamId: access.teamId },
        userId,
      );
      if (!result.alreadyApplied) await syncPreparedGameSideRoster(tx, target);
      return { ...result, roster: await this.readView(tx, target, access) };
    });
  }

  /**
   * EXCLUDE 한 건. 명단 동기화는 하지 않는다 — 호출자가 바뀐 사이드마다 한 번 돌린다.
   * 이미 활성이면 첫 행을 그대로 돌려준다(사유를 덮지 않는다). 호출자가 경기를 잠갔다.
   */
  async applyExclude(
    tx: Tx,
    actor: { userId: string; role: GameRosterActorRole },
    target: TeamSideTarget,
    input: { userId: string; reason?: string | null },
  ): Promise<{ alreadyApplied: boolean; adjustment: GameRosterAdjustmentView }> {
    const loaded = await loadGameRoster(tx, target);
    if (loaded === null) throw rosterNotAvailable('참가 명단이 확정되지 않은 팀이에요.');
    assertSideTeamUnchanged(target, loaded.context.teamId);
    if (!loaded.base.some((entry) => entry.userId === input.userId)) {
      throw new UnprocessableEntityException({
        code: 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER',
        message: '이 팀의 참가 명단에 없는 선수예요.',
        details: { gameId: target.gameId, userId: input.userId },
      });
    }
    const existing = await tx.v1GameRosterAdjustment.findFirst({
      where: { gameId: target.gameId, sideId: target.sideId, teamId: target.teamId, userId: input.userId, revokedAt: null },
    });
    if (existing !== null) return { alreadyApplied: true, adjustment: adjustmentView(existing) };
    const created = await tx.v1GameRosterAdjustment.create({
      data: {
        gameId: target.gameId,
        sideId: target.sideId,
        teamId: target.teamId,
        userId: input.userId,
        action: V1GameRosterAdjustmentAction.EXCLUDE,
        reason: input.reason ?? null,
        actorUserId: actor.userId,
        actorRole: actor.role,
      },
    });
    return { alreadyApplied: false, adjustment: adjustmentView(created) };
  }

  /** 활성 EXCLUDE 되돌리기 한 건. 동기화는 호출자 몫이다. 호출자가 경기를 잠갔다. */
  async applyRevoke(
    tx: Tx,
    actor: { userId: string; role: GameRosterActorRole },
    target: TeamSideTarget,
    userId: string,
  ): Promise<{ alreadyApplied: boolean }> {
    const side = await tx.v1GameSide.findUnique({ where: { id: target.sideId }, select: { teamId: true } });
    assertSideTeamUnchanged(target, side?.teamId ?? null);
    const existing = await tx.v1GameRosterAdjustment.findFirst({
      where: { gameId: target.gameId, sideId: target.sideId, teamId: target.teamId, userId, revokedAt: null },
    });
    if (existing === null) return { alreadyApplied: true };
    await tx.v1GameRosterAdjustment.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedByUserId: actor.userId, revokedByRole: actor.role },
    });
    return { alreadyApplied: false };
  }

  /**
   * 사이드는 요청 값이 아니라 경기에서 다시 찾는다. 팀 권한은 **그 사이드 팀**의 멤버십으로만 준다 —
   * 경기 인가(`resolveActor`)의 팀 분기는 두 팀 중 어느 팀 매니저든 통과시키기 때문이다.
   */
  async authorizeSide(
    tx: Tx,
    userId: string,
    target: SideTarget,
    mode: 'read' | 'write',
  ): Promise<GameRosterSideAccess> {
    const game = await tx.v1Game.findUnique({
      where: { id: target.gameId },
      select: {
        sourceType: true,
        teamMatch: { select: { deletedAt: true, tournamentId: true, leagueId: true } },
        sides: { where: { id: target.sideId }, select: { teamId: true } },
      },
    });
    const teamMatch = game?.teamMatch ?? null;
    if (game === null || game.sourceType !== V1GameSourceType.TEAM_MATCH || teamMatch === null || teamMatch.deletedAt !== null) {
      throw new NotFoundException({ code: 'GAME_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    }
    if (teamMatch.tournamentId === null && teamMatch.leagueId === null) {
      throw rosterNotAvailable('대회·리그 경기에서만 경기 명단을 조정할 수 있어요.');
    }
    const side = game.sides[0];
    if (side === undefined) {
      throw new NotFoundException({ code: 'GAME_SIDE_NOT_FOUND', message: '경기의 팀 정보를 찾을 수 없어요.' });
    }
    if (side.teamId === null) throw rosterNotAvailable('팀이 정해진 뒤에 경기 명단을 볼 수 있어요.');

    const membership = await tx.v1TeamMembership.findUnique({
      where: { teamId_userId: { teamId: side.teamId, userId } },
      select: { role: true, status: true },
    });
    const sideMembershipRole = membership?.status === 'active' ? membership.role : null;
    const operator =
      sideMembershipRole === 'owner' || sideMembershipRole === 'manager'
        ? null
        : await this.games.resolveCompetitionOperator(tx, target.gameId, userId);
    const access = decideGameRosterAccess({ sideMembershipRole, operator });
    if (access === null || (mode === 'write' && access.writeRole === null)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '이 경기 명단을 바꿀 권한이 없어요.' });
    }
    return { ...access, teamId: side.teamId };
  }

  /**
   * 경기 시작 명령과 같은 행을 잠가, 조정이 시작 직후 경기에 끼어들지 않게 한다. 트랜잭션의 첫 잠금이다
   * (`lockRosterWriteScope` — 대회 행·빈 리그 명단 채우기가 경기보다 앞선다). 하나라도 시작됐으면 전부 거부한다.
   */
  async lockScheduledGames(tx: Tx, sides: readonly SideTarget[]): Promise<void> {
    const ids = [...new Set(sides.map((side) => side.gameId))];
    await lockRosterWriteScope(
      tx,
      ids,
      sides.map((side) => side.sideId),
    );
    const games = await tx.v1Game.findMany({ where: { id: { in: ids } }, select: { id: true, state: true } });
    const started = games.filter((game) => game.state !== V1GameState.SCHEDULED).map((game) => game.id);
    if (started.length > 0) {
      throw new ConflictException({
        code: 'LINEUP_DEADLINE_PASSED',
        message: '경기가 시작된 뒤에는 명단을 바꿀 수 없어요. 운영진에게 알려 주세요.',
        details: { gameIds: started },
      });
    }
  }

  private async readView(tx: Tx, target: SideTarget, access: GameRosterAccess): Promise<GameRosterView> {
    const loaded = await loadGameRoster(tx, target);
    if (loaded === null) throw rosterNotAvailable('참가 명단이 확정되지 않은 팀이에요.');
    const { context, computation } = loaded;

    const lineups = await tx.v1GameLineup.findMany({
      where: { gameId: target.gameId, sideId: target.sideId, invalidatedAt: null },
      orderBy: { revision: 'asc' },
    });
    const rows = await tx.v1GameParticipant.findMany({
      where: { lineupId: { in: lineups.map((lineup) => lineup.id) } },
      select: { id: true, sideId: true, lineupId: true, userId: true, displayNameSnapshot: true, jerseyNumber: true },
    });
    // 팀 배정 직후처럼 빈 리비전이 먼저 있을 수 있어, 명단이 처음 채워진 리비전을 대진 시점 명단으로 본다.
    const snapshotLineup = lineups.find((lineup) => rows.some((row) => row.lineupId === lineup.id));
    const fixtureSnapshotUserIds =
      snapshotLineup === undefined
        ? null
        : new Set(rows.flatMap((row) => (row.lineupId === snapshotLineup.id && row.userId !== null ? [row.userId] : [])));
    const latest = lineups.at(-1);
    const legacyLineupPending =
      context.isLeague && latest !== undefined
        ? await isUnmigratedTeamAuthoredLineup(tx, target.gameId, target.sideId, latest)
        : false;

    const displayNameByUserId = await loadDisplayNames(tx, [
      ...computation.excluded.map((row) => row.actorUserId),
      ...computation.unavailable.map((row) => row.actorUserId),
    ]);
    const jerseyRegistrationId = await loadJerseyRegistrationId(tx, context, {
      baseSource: loaded.baseSource,
      isTeamManager: access.viewerRole === 'TEAM_MANAGER',
    });
    return buildGameRosterView({
      context,
      access,
      baseSource: loaded.baseSource,
      jerseyRegistrationId,
      base: loaded.base,
      computation,
      fixtureSnapshotUserIds,
      legacyLineupPending,
      displayNameByUserId,
      // 시작된 경기는 공식 결과와 같은 셀렉터로 고른 기록 명단을 보여 준다(동기화는 시작 뒤 멈춘다).
      playedLineup:
        context.gameState === V1GameState.SCHEDULED ? null : selectLineupParticipantsWithDraftFallback(rows, lineups),
    });
  }
}

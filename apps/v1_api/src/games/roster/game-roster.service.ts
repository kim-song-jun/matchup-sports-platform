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
import { GamesService } from '../games.service';
import type { CreateGameRosterAdjustmentDto } from './dto/game-roster-adjustment.dto';
import { loadGameRoster } from './game-roster-loader';
import { isUnmigratedTeamAuthoredLineup, syncGameSideRoster } from './game-roster-sync';
import { buildGameRosterView, decideGameRosterAccess, type GameRosterAccess, type GameRosterView } from './game-roster-view';

type Tx = Prisma.TransactionClient;

interface SideTarget {
  readonly gameId: string;
  readonly sideId: string;
}

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
  /** 되돌리기는 누가 했는지만 남고 역할은 기록하지 않는다(role null). */
  readonly actor: { userId: string; displayName: string; role: string | null };
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

/** Task 176 — 대회·리그 경기 한 사이드의 명단 조회와 경기별 빼기·되돌리기. */
@Injectable()
export class GameRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  // 리그 기준 명단 로드가 명단 없는 확정 신청을 그 자리에서 채울 수 있어 조회도 트랜잭션 안에서 한다.
  getRoster(user: V1AuthUser, target: SideTarget): Promise<GameRosterView> {
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorize(tx, user.id, target, 'read');
      return this.readView(tx, target, access);
    });
  }

  listAdjustments(user: V1AuthUser, target: SideTarget) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, user.id, target, 'read');
      const rows = await tx.v1GameRosterAdjustment.findMany({
        where: { gameId: target.gameId, sideId: target.sideId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const names = await this.displayNames(
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
        if (row.revokedAt !== null && row.revokedByUserId !== null) {
          events.push({
            ...common,
            type: 'REVOKE',
            actor: { userId: row.revokedByUserId, displayName: name(row.revokedByUserId), role: null },
            at: row.revokedAt,
          });
        }
      }
      events.sort((a, b) => a.at.getTime() - b.at.getTime());
      return { gameId: target.gameId, sideId: target.sideId, events };
    });
  }

  exclude(user: V1AuthUser, target: SideTarget, dto: CreateGameRosterAdjustmentDto) {
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorize(tx, user.id, target, 'write');
      await this.lockScheduledGame(tx, target.gameId);
      const loaded = await loadGameRoster(tx, target);
      if (loaded === null) throw rosterNotAvailable('참가 명단이 확정되지 않은 팀이에요.');
      if (!loaded.base.some((entry) => entry.userId === dto.userId)) {
        throw new UnprocessableEntityException({
          code: 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER',
          message: '이 팀의 참가 명단에 없는 선수예요.',
        });
      }
      const existing = await tx.v1GameRosterAdjustment.findFirst({
        where: { gameId: target.gameId, sideId: target.sideId, userId: dto.userId, revokedAt: null },
      });
      if (existing !== null) {
        return { alreadyApplied: true, adjustment: adjustmentView(existing), roster: await this.readView(tx, target, access) };
      }
      const created = await tx.v1GameRosterAdjustment.create({
        data: {
          gameId: target.gameId,
          sideId: target.sideId,
          userId: dto.userId,
          action: V1GameRosterAdjustmentAction.EXCLUDE,
          reason: dto.reason ?? null,
          actorUserId: user.id,
          actorRole: access.writeRole!,
        },
      });
      await syncGameSideRoster(tx, target);
      return { alreadyApplied: false, adjustment: adjustmentView(created), roster: await this.readView(tx, target, access) };
    });
  }

  revoke(user: V1AuthUser, target: SideTarget, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const access = await this.authorize(tx, user.id, target, 'write');
      await this.lockScheduledGame(tx, target.gameId);
      const existing = await tx.v1GameRosterAdjustment.findFirst({
        where: { gameId: target.gameId, sideId: target.sideId, userId, revokedAt: null },
      });
      if (existing === null) {
        return { alreadyApplied: true, roster: await this.readView(tx, target, access) };
      }
      await tx.v1GameRosterAdjustment.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokedByUserId: user.id },
      });
      await syncGameSideRoster(tx, target);
      return { alreadyApplied: false, roster: await this.readView(tx, target, access) };
    });
  }

  /**
   * 사이드는 요청 값이 아니라 경기에서 다시 찾는다. 팀 권한은 **그 사이드 팀**의 멤버십으로만 준다 —
   * 경기 인가(`resolveActor`)의 팀 분기는 두 팀 중 어느 팀 매니저든 통과시키기 때문이다.
   */
  private async authorize(
    tx: Tx,
    userId: string,
    target: SideTarget,
    mode: 'read' | 'write',
  ): Promise<GameRosterAccess> {
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
    return access;
  }

  /** 경기 시작 명령과 같은 행을 잠가, 조정이 시작 직후 경기에 끼어들지 않게 한다. */
  private async lockScheduledGame(tx: Tx, gameId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
    const game = await tx.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { state: true } });
    if (game.state !== V1GameState.SCHEDULED) {
      throw new ConflictException({
        code: 'LINEUP_DEADLINE_PASSED',
        message: '경기가 시작된 뒤에는 명단을 바꿀 수 없어요. 운영진에게 알려 주세요.',
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
      select: { lineupId: true, userId: true },
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

    const displayNameByUserId = await this.displayNames(tx, [
      ...computation.excluded.map((row) => row.actorUserId),
      ...computation.unavailable.map((row) => row.actorUserId),
    ]);
    return buildGameRosterView({
      context,
      access,
      baseSource: loaded.baseSource,
      base: loaded.base,
      computation,
      fixtureSnapshotUserIds,
      legacyLineupPending,
      displayNameByUserId,
    });
  }

  private async displayNames(tx: Tx, userIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const users = await tx.v1User.findMany({
      where: { id: { in: ids } },
      select: { id: true, profile: { select: { nickname: true, displayName: true } } },
    });
    return new Map(users.map((row) => [row.id, participantDisplayName({ user: { profile: row.profile } })]));
  }
}

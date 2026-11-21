import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateInternalMatchDto,
  InternalMatchListQueryDto,
  InternalMatchPreviewDto,
  RecordInternalMatchResultDto,
} from './dto/team-internal-match.dto';
import { balanceTeams } from './team-balance';

type Tx = Prisma.TransactionClient;
type Viewer = { role: 'owner' | 'manager' | 'member' };

const sideName = (sideNumber: number) => `${sideNumber}팀`;

/**
 * 팀 내 경기(자체전). 읽기는 그 팀의 활성 팀원만, 쓰기(만들기·결과·삭제)는 팀장·매니저만.
 * 팀원이 아니면 목록·상세 모두 403 이다 — 화면에서 숨기는 것만으로는 주소로 열 수 있어서 서버가 막는다.
 */
@Injectable()
export class TeamInternalMatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: V1AuthUser, teamId: string, query: InternalMatchListQueryDto) {
    await this.requireMember(this.prisma, user, teamId);
    const rows = await this.prisma.v1TeamInternalMatch.findMany({
      where: { teamId },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      take: (query.limit ?? 20) + 1,
      include: { sides: { orderBy: { sideNumber: 'asc' } }, players: { select: { userId: true, sideId: true } } },
    });
    const limit = query.limit ?? 20;
    return {
      items: rows.slice(0, limit).map((row) => {
        const mine = row.players.find((player) => player.userId === user.id);
        return {
          id: row.id,
          playedAt: row.playedAt,
          resultRecorded: row.resultRecordedAt !== null,
          sides: row.sides.map((side) => ({
            sideNumber: side.sideNumber,
            name: side.name,
            score: side.score,
            playerCount: row.players.filter((player) => player.sideId === side.id).length,
          })),
          viewerSideNumber: row.sides.find((side) => side.id === mine?.sideId)?.sideNumber ?? null,
        };
      }),
      hasMore: rows.length > limit,
    };
  }

  async detail(user: V1AuthUser, teamId: string, matchId: string) {
    const viewer = await this.requireMember(this.prisma, user, teamId);
    return this.readDetail(this.prisma, teamId, matchId, user.id, viewer);
  }

  async preview(user: V1AuthUser, teamId: string, dto: InternalMatchPreviewDto) {
    this.assertActiveAccount(user);
    await this.requireManager(this.prisma, user, teamId);
    if (dto.userIds.length < dto.teamCount) {
      throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_TOO_FEW_PLAYERS', message: '팀 수보다 선수가 적어요' });
    }
    const members = await this.loadMembers(this.prisma, teamId, dto.userIds);
    const candidates = await this.loadCandidates(this.prisma, teamId, dto.userIds);
    const sides = balanceTeams(candidates, dto.teamCount, dto.seed ?? 0);
    return {
      seed: dto.seed ?? 0,
      sides: sides.map((ids, index) => ({
        sideNumber: index + 1,
        name: sideName(index + 1),
        players: ids.map((id) => ({ userId: id, name: members.get(id) ?? '팀원' })),
      })),
    };
  }

  async create(user: V1AuthUser, teamId: string, dto: CreateInternalMatchDto) {
    this.assertActiveAccount(user);
    const allIds = dto.sides.flatMap((side) => side.userIds);
    if (new Set(allIds).size !== allIds.length) {
      throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_DUPLICATE_PLAYER', message: '한 선수가 두 팀에 들어갈 수 없어요' });
    }
    const matchId = await this.prisma.$transaction(async (tx) => {
      await this.requireManager(tx, user, teamId);
      await this.loadMembers(tx, teamId, allIds);
      const match = await tx.v1TeamInternalMatch.create({
        data: { teamId, createdByUserId: user.id, playedAt: new Date(dto.playedAt) },
      });
      for (const [index, side] of dto.sides.entries()) {
        const created = await tx.v1TeamInternalMatchSide.create({
          data: { matchId: match.id, sideNumber: index + 1, name: sideName(index + 1) },
        });
        await tx.v1TeamInternalMatchPlayer.createMany({
          data: side.userIds.map((userId) => ({ matchId: match.id, sideId: created.id, userId })),
        });
      }
      return match.id;
    });
    return this.readDetail(this.prisma, teamId, matchId, user.id, { role: 'manager' });
  }

  async recordResult(user: V1AuthUser, teamId: string, matchId: string, dto: RecordInternalMatchResultDto) {
    this.assertActiveAccount(user);
    await this.prisma.$transaction(async (tx) => {
      await this.requireManager(tx, user, teamId);
      // 같은 경기의 결과를 두 운영진이 동시에 저장하면 득점(삭제 후 재생성)이 겹쳐 쌓인다 — 경기 행을 잠가 한 명씩 처리한다.
      await tx.$queryRaw`SELECT id FROM "v1_team_internal_matches" WHERE id = ${matchId} FOR UPDATE`;
      const match = await this.findMatch(tx, teamId, matchId);
      const sides = await tx.v1TeamInternalMatchSide.findMany({ where: { matchId }, orderBy: { sideNumber: 'asc' } });
      const players = await tx.v1TeamInternalMatchPlayer.findMany({ where: { matchId } });
      if (dto.scores.length !== sides.length) {
        throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_SCORE_COUNT', message: '팀 수와 점수 개수가 달라요' });
      }
      const goals = dto.goals ?? [];
      const goalsPerSide = new Map<number, number>();
      for (const goal of goals) {
        const side = sides[goal.sideNumber - 1];
        if (!side) throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_GOAL_SIDE', message: '없는 팀의 득점이에요' });
        const inSide = (userId: string) => players.some((player) => player.userId === userId && player.sideId === side.id);
        if (!inSide(goal.scorerUserId) || (goal.assistUserId != null && !inSide(goal.assistUserId))) {
          throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_GOAL_PLAYER', message: '득점·어시스트는 그 팀 선수만 고를 수 있어요' });
        }
        if (goal.assistUserId === goal.scorerUserId) {
          throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_GOAL_SELF_ASSIST', message: '득점자와 어시스트가 같을 수 없어요' });
        }
        goalsPerSide.set(goal.sideNumber, (goalsPerSide.get(goal.sideNumber) ?? 0) + 1);
      }
      for (const [sideNumber, count] of goalsPerSide) {
        if (count > dto.scores[sideNumber - 1]) {
          throw new UnprocessableEntityException({ code: 'INTERNAL_MATCH_GOAL_EXCEEDS_SCORE', message: `${sideNumber}팀 득점 기록이 점수보다 많아요` });
        }
      }
      for (const [index, side] of sides.entries()) {
        await tx.v1TeamInternalMatchSide.update({ where: { id: side.id }, data: { score: dto.scores[index] } });
      }
      await tx.v1TeamInternalMatchGoal.deleteMany({ where: { matchId } });
      await tx.v1TeamInternalMatchGoal.createMany({
        data: goals.map((goal, index) => ({
          matchId,
          sideId: sides[goal.sideNumber - 1].id,
          scorerUserId: goal.scorerUserId,
          assistUserId: goal.assistUserId ?? null,
          sortOrder: index,
        })),
      });
      await tx.v1TeamInternalMatch.update({
        where: { id: match.id },
        data: { resultRecordedAt: match.resultRecordedAt ?? new Date() },
      });
    });
    return this.readDetail(this.prisma, teamId, matchId, user.id, { role: 'manager' });
  }

  async remove(user: V1AuthUser, teamId: string, matchId: string) {
    this.assertActiveAccount(user);
    await this.prisma.$transaction(async (tx) => {
      await this.requireManager(tx, user, teamId);
      await this.findMatch(tx, teamId, matchId);
      await tx.v1TeamInternalMatch.delete({ where: { id: matchId } });
    });
    return { id: matchId, deleted: true };
  }

  private async readDetail(db: Tx | PrismaService, teamId: string, matchId: string, viewerUserId: string, viewer: Viewer) {
    const match = await db.v1TeamInternalMatch.findFirst({
      where: { id: matchId, teamId },
      include: {
        sides: { orderBy: { sideNumber: 'asc' } },
        players: true,
        goals: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!match) throw new NotFoundException({ code: 'NOT_FOUND', message: '팀 내 경기를 찾을 수 없어요' });
    const names = await this.userNames(db, [...match.players.map((p) => p.userId)]);
    const name = (userId: string) => names.get(userId) ?? '팀원';
    return {
      id: match.id,
      teamId: match.teamId,
      playedAt: match.playedAt,
      resultRecorded: match.resultRecordedAt !== null,
      canManage: viewer.role !== 'member',
      sides: match.sides.map((side) => ({
        sideNumber: side.sideNumber,
        name: side.name,
        score: side.score,
        players: match.players
          .filter((player) => player.sideId === side.id)
          .map((player) => ({ userId: player.userId, name: name(player.userId), isMe: player.userId === viewerUserId })),
      })),
      goals: match.goals.map((goal) => ({
        sideNumber: match.sides.find((side) => side.id === goal.sideId)?.sideNumber ?? 0,
        scorer: { userId: goal.scorerUserId, name: name(goal.scorerUserId) },
        assist: goal.assistUserId ? { userId: goal.assistUserId, name: name(goal.assistUserId) } : null,
      })),
    };
  }

  private async findMatch(tx: Tx, teamId: string, matchId: string) {
    const match = await tx.v1TeamInternalMatch.findFirst({ where: { id: matchId, teamId } });
    if (!match) throw new NotFoundException({ code: 'NOT_FOUND', message: '팀 내 경기를 찾을 수 없어요' });
    return match;
  }

  private async requireMember(db: Tx | PrismaService, user: V1AuthUser, teamId: string): Promise<Viewer> {
    const team = await db.v1Team.findFirst({ where: { id: teamId, status: 'active', deletedAt: null }, select: { id: true } });
    if (!team) throw new NotFoundException({ code: 'NOT_FOUND', message: '팀을 찾을 수 없어요' });
    const membership = await db.v1TeamMembership.findFirst({
      where: { teamId, userId: user.id, status: 'active' },
      select: { role: true },
    });
    if (!membership) throw new ForbiddenException({ code: 'TEAM_MEMBER_ONLY', message: '팀원만 볼 수 있어요' });
    return { role: membership.role };
  }

  private async requireManager(db: Tx | PrismaService, user: V1AuthUser, teamId: string): Promise<Viewer> {
    const viewer = await this.requireMember(db, user, teamId);
    if (viewer.role === 'member') {
      throw new ForbiddenException({ code: 'TEAM_MANAGER_ONLY', message: '팀장과 매니저만 할 수 있어요' });
    }
    return viewer;
  }

  /** 전원이 이 팀의 활성 팀원이어야 한다. 이름 맵(userId → 이름)을 돌려준다. */
  private async loadMembers(db: Tx | PrismaService, teamId: string, userIds: string[]) {
    const memberships = await db.v1TeamMembership.findMany({
      where: { teamId, status: 'active', userId: { in: userIds } },
      select: { userId: true },
    });
    if (memberships.length !== new Set(userIds).size) {
      throw new BadRequestException({ code: 'INTERNAL_MATCH_NOT_TEAM_MEMBER', message: '이 팀의 팀원만 고를 수 있어요' });
    }
    return this.userNames(db, userIds);
  }

  private async userNames(db: Tx | PrismaService, userIds: string[]) {
    const profiles = await db.v1UserProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, nickname: true, displayName: true },
    });
    return new Map(profiles.map((profile) => [profile.userId, profile.nickname ?? profile.displayName ?? '팀원']));
  }

  private async loadCandidates(db: Tx | PrismaService, teamId: string, userIds: string[]) {
    const team = await db.v1Team.findUniqueOrThrow({ where: { id: teamId }, select: { sportId: true } });
    const preferences = await db.v1UserSportPreference.findMany({
      where: { sportId: team.sportId, userId: { in: userIds } },
      select: { userId: true, preferredPosition: true, sportLevel: { select: { sortOrder: true } } },
    });
    const byUser = new Map(preferences.map((pref) => [pref.userId, pref]));
    return userIds.map((userId) => ({
      userId,
      level: byUser.get(userId)?.sportLevel?.sortOrder ?? null,
      position: byUser.get(userId)?.preferredPosition ?? null,
    }));
  }

  private assertActiveAccount(user: V1AuthUser): void {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '계정 상태 때문에 할 수 없어요' });
    }
  }
}

import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { resolveTeamMatchCompetitionConfig } from '../team-matches/resolve-team-match-competition-config';
import { generateRoundRobinFixtures } from './round-robin-schedule';
import { CreateTeamMatchSeriesDto, GenerateSeriesFixturesDto, UpdateSeriesFixtureDto } from './dto/team-match-series.dto';

const DEFAULT_TIE_BREAK_ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;
const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class TeamMatchSeriesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  async create(user: V1AuthUser, dto: CreateTeamMatchSeriesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const uniqueTeamIds = [...new Set(dto.teamIds)];
    if (uniqueTeamIds.length < 2) {
      throw new UnprocessableEntityException({
        code: 'SERIES_TEAM_INVALID',
        message: '리그는 서로 다른 팀 2개 이상이 필요해요.',
      });
    }
    const teams = await this.prisma.v1Team.findMany({
      where: { id: { in: uniqueTeamIds }, status: 'active', deletedAt: null },
      select: { id: true, sportId: true },
    });
    if (teams.length !== uniqueTeamIds.length || teams.some((team) => team.sportId !== dto.sportId)) {
      throw new UnprocessableEntityException({
        code: 'SERIES_TEAM_INVALID',
        message: '리그 종목과 일치하는 활성 팀만 등록할 수 있어요.',
      });
    }

    const series = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1TeamMatchSeries.create({
        data: {
          title: dto.title,
          sportId: dto.sportId,
          regionId: dto.regionId,
          createdByAdminUserId: admin.id,
          startsOn: new Date(dto.startsOn),
          endsOn: new Date(dto.endsOn),
          tieBreakJson: { order: DEFAULT_TIE_BREAK_ORDER },
          teams: { createMany: { data: uniqueTeamIds.map((teamId) => ({ teamId })) } },
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match_series.create',
          targetType: 'team_match_series',
          targetId: created.id,
          afterJson: { title: created.title, teamIds: uniqueTeamIds },
        },
        tx,
      );
      return created;
    });
    return { seriesId: series.id, title: series.title, state: series.state };
  }

  async list(user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    const rows = await this.prisma.v1TeamMatchSeries.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { teams: true, teamMatches: true } } },
    });
    return {
      items: rows.map((row) => ({
        seriesId: row.id,
        title: row.title,
        state: row.state,
        teamCount: row._count.teams,
        fixtureCount: row._count.teamMatches,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
      })),
    };
  }

  async detail(user: V1AuthUser, seriesId: string) {
    await this.adminContext.getActiveAdmin(user.id);
    const series = await this.loadSeries(seriesId);
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { seriesId },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true, startAt: true, placeName: true, status: true },
    });
    return {
      seriesId: series.id,
      title: series.title,
      state: series.state,
      teamIds: series.teams.map((entry) => entry.teamId),
      fixtures: fixtures.map((fixture) => ({
        teamMatchId: fixture.id,
        title: fixture.title,
        homeTeamId: fixture.hostTeamId,
        awayTeamId: fixture.approvedApplicantTeamId,
        startAt: fixture.startAt,
        placeName: fixture.placeName,
        status: fixture.status,
      })),
    };
  }

  async generateFixtures(user: V1AuthUser, seriesId: string, dto: GenerateSeriesFixturesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const series = await this.loadSeries(seriesId);
    if (series.teams.length < 2) {
      throw new UnprocessableEntityException({
        code: 'SERIES_TEAM_INVALID',
        message: '리그에 등록된 팀이 2개 미만이에요.',
      });
    }
    const config = await resolveTeamMatchCompetitionConfig(this.prisma, series.sportId);
    if (config === null) {
      throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '이 종목에 활성 경기 설정이 없어요.' });
    }
    const teamIds = series.teams.map((entry) => entry.teamId);
    const schedule = generateRoundRobinFixtures(teamIds, dto.weeksCount);

    const createdIds = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "v1_team_match_series" WHERE id = ${seriesId} FOR UPDATE`;
      const existingCount = await tx.v1TeamMatch.count({ where: { seriesId } });
      if (existingCount > 0) {
        throw new ConflictException({ code: 'SERIES_FIXTURES_EXIST', message: '이미 대진이 생성된 리그예요.' });
      }
      const teamsById = await this.loadTeamsWithMembers(tx, teamIds);
      const ids: string[] = [];
      for (const fixture of schedule) {
        const home = teamsById.get(fixture.homeTeamId)!;
        const away = teamsById.get(fixture.awayTeamId)!;
        const startAt = new Date(series.startsOn.getTime() + (fixture.round - 1) * WEEK_MS);
        const teamMatch = await tx.v1TeamMatch.create({
          data: {
            hostTeamId: home.id,
            createdByUserId: admin.userId,
            sportId: series.sportId,
            regionId: series.regionId,
            title: `${series.title} ${fixture.round}주차`,
            placeName: '장소 미정',
            startAt,
            status: 'matched',
            approvedApplicantTeamId: away.id,
            competitionConfigVersionId: config.id,
            seriesId: series.id,
          },
        });
        await this.games.createFromSourceInTransaction(
          tx,
          {
            sourceType: V1GameSourceType.TEAM_MATCH,
            sourceId: teamMatch.id,
            competitionConfigVersionId: config.id,
            sides: [
              { sideKey: V1GameSideKey.HOME, teamId: home.id, displayNameSnapshot: home.name },
              { sideKey: V1GameSideKey.AWAY, teamId: away.id, displayNameSnapshot: away.name },
            ],
            participants: [
              ...home.memberships.map((m) => ({
                sourceParticipantId: m.id,
                sideKey: V1GameSideKey.HOME,
                displayNameSnapshot: m.user.profile?.nickname ?? m.user.profile?.displayName ?? '팀원',
              })),
              ...away.memberships.map((m) => ({
                sourceParticipantId: m.id,
                sideKey: V1GameSideKey.AWAY,
                displayNameSnapshot: m.user.profile?.nickname ?? m.user.profile?.displayName ?? '팀원',
              })),
            ],
          },
          {
            actor: { actorType: 'USER', actorUserId: admin.userId, role: 'platform_ops' },
            expectedVersion: 0,
            durableCommandId: `series-fixture-create:${teamMatch.id}`,
            payloadHash: canonicalGameCommandPayloadHash({ teamMatchId: teamMatch.id, seriesId: series.id }),
          },
        );
        await tx.v1TeamMatchApplication.create({
          data: {
            teamMatchId: teamMatch.id,
            applicantTeamId: away.id,
            appliedByUserId: admin.userId,
            status: 'approved',
            reviewedByUserId: admin.userId,
            reviewedAt: new Date(),
            message: '리그 대진 자동 생성',
          },
        });
        ids.push(teamMatch.id);
      }
      if (ids.length > 0) {
        await tx.v1TeamMatchSeries.update({ where: { id: series.id }, data: { state: 'active' } });
      }
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match_series.generate_fixtures',
          targetType: 'team_match_series',
          targetId: seriesId,
          afterJson: { teamMatchIds: ids, weeksCount: dto.weeksCount },
        },
        tx,
      );
      return ids;
    });

    return { seriesId, createdCount: createdIds.length, teamMatchIds: createdIds };
  }

  async updateFixture(user: V1AuthUser, seriesId: string, teamMatchId: string, dto: UpdateSeriesFixtureDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    const teamMatch = await this.prisma.v1TeamMatch.findFirst({ where: { id: teamMatchId, seriesId } });
    if (teamMatch === null) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: '이 리그의 대진이 아니에요.' });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.v1TeamMatch.update({
        where: { id: teamMatchId },
        data: {
          ...(dto.startsAt === undefined ? {} : { startAt: new Date(dto.startsAt) }),
          ...(dto.placeName === undefined ? {} : { placeName: dto.placeName }),
          ...(dto.placeAddress === undefined ? {} : { placeAddress: dto.placeAddress }),
        },
      });
      await this.adminContext.logAdminAction(
        admin,
        {
          action: 'team_match_series.update_fixture',
          targetType: 'team_match',
          targetId: teamMatchId,
          afterJson: { startAt: result.startAt.toISOString(), placeName: result.placeName },
        },
        tx,
      );
      return result;
    });
    return { teamMatchId: updated.id, startAt: updated.startAt, placeName: updated.placeName, placeAddress: updated.placeAddress };
  }

  private async loadSeries(seriesId: string) {
    const series = await this.prisma.v1TeamMatchSeries.findUnique({
      where: { id: seriesId },
      include: { teams: { select: { teamId: true } } },
    });
    if (series === null) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    return series;
  }

  private async loadTeamsWithMembers(tx: Prisma.TransactionClient, teamIds: string[]) {
    const teams = await tx.v1Team.findMany({
      where: { id: { in: teamIds }, status: 'active', deletedAt: null },
      select: {
        id: true,
        name: true,
        memberships: {
          where: { status: 'active' },
          orderBy: { id: 'asc' },
          select: { id: true, user: { select: { profile: { select: { nickname: true, displayName: true } } } } },
        },
      },
    });
    return new Map(teams.map((team) => [team.id, team]));
  }
}

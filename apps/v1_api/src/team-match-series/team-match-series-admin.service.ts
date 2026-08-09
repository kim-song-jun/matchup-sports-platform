import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { resolveTeamMatchCompetitionConfig } from '../team-matches/resolve-team-match-competition-config';
import { generateRoundRobinFixtures, resolveFixtureStartAt } from './round-robin-schedule';
import { CreateTeamMatchSeriesDto, GenerateSeriesFixturesDto, UpdateSeriesFixtureDto } from './dto/team-match-series.dto';

const DEFAULT_TIE_BREAK_ORDER = ['points', 'goalDifference', 'goalsFor', 'headToHead'] as const;
const DEFAULT_FIXTURE_PLACE_NAME = '장소 미정';

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
    const teamIds = series.teams.map((entry) => entry.teamId);
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { seriesId },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true, startAt: true, placeName: true, status: true },
    });
    // 대진을 아직 안 만든 리그에서만 필요하다(일괄 생성 폼의 "기본 장소" 추천용) —
    // 이미 대진이 있으면 관리자는 개별 행을 고치므로 이 쿼리를 건너뛴다.
    const recentVenues = fixtures.length === 0 ? await this.loadRecentVenues(teamIds) : [];
    return {
      seriesId: series.id,
      title: series.title,
      state: series.state,
      teamIds,
      recentVenues,
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
      // 빈 문자열/공백만 있는 placeName 도 "미지정"으로 취급한다 — DTO 는 @IsOptional 문자열이라
      // 통과하고, ?? 는 ''를 대체하지 않아 그대로면 recentVenues 집계에서 조용히 빠지는 값이 저장된다.
      const trimmedPlaceName = dto.placeName?.trim();
      const placeName = trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME;
      const ids: string[] = [];
      for (const fixture of schedule) {
        const home = teamsById.get(fixture.homeTeamId)!;
        const away = teamsById.get(fixture.awayTeamId)!;
        const startAt = resolveFixtureStartAt(series.startsOn, fixture.round, dto.schedule);
        const teamMatch = await tx.v1TeamMatch.create({
          data: {
            hostTeamId: home.id,
            createdByUserId: admin.userId,
            sportId: series.sportId,
            regionId: series.regionId,
            title: `${series.title} ${fixture.round}주차`,
            placeName,
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
          afterJson: {
            teamMatchIds: ids,
            weeksCount: dto.weeksCount,
            schedule: dto.schedule ? { dayOfWeek: dto.schedule.dayOfWeek, time: dto.schedule.time } : null,
            // dto.placeName이 아니라 trim+기본값 폴백을 거쳐 실제로 저장된 placeName을 남긴다 —
            // 감사 로그가 요청 원문이 아니라 실제 결과와 일치해야 디버깅 시 혼선이 없다.
            placeName,
          },
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
      // generateFixtures와 동일하게: 빈/공백 문자열로 지우는 요청은 "미지정"으로 되돌린다 —
      // 그대로 저장하면 loadRecentVenues distinct 집계에서 조용히 빠지는 값이 남는다.
      const trimmedPlaceName = dto.placeName === undefined ? undefined : dto.placeName.trim();
      const result = await tx.v1TeamMatch.update({
        where: { id: teamMatchId },
        data: {
          ...(dto.startsAt === undefined ? {} : { startAt: new Date(dto.startsAt) }),
          ...(trimmedPlaceName === undefined ? {} : { placeName: trimmedPlaceName ? trimmedPlaceName : DEFAULT_FIXTURE_PLACE_NAME }),
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

  // 참가 팀들이 (이 리그든 다른 리그든, 일반 팀매치든) 과거에 실제로 썼던 장소를
  // 최신순으로 모아 distinct 5개까지 돌려준다 — 일괄 생성 폼의 "기본 장소" 추천 칩용.
  // v1_team_match는 리그 대진과 일반 팀매치가 같은 테이블이라 별도 이력 저장소가 필요 없다.
  private async loadRecentVenues(teamIds: string[]): Promise<string[]> {
    if (teamIds.length === 0) return [];
    const rows = await this.prisma.v1TeamMatch.findMany({
      where: {
        OR: [{ hostTeamId: { in: teamIds } }, { approvedApplicantTeamId: { in: teamIds } }],
        placeName: { notIn: ['', DEFAULT_FIXTURE_PLACE_NAME] },
      },
      orderBy: { startAt: 'desc' },
      select: { placeName: true },
      take: 30,
    });
    // 쓰기 경로는 이제 trim+폴백을 하지만, 그 이전에 만들어진 레거시 행에 앞뒤 공백이
    // 섞여 있을 수 있어 읽기 시점에도 한 번 더 trim한다(방어적 이중 처리).
    const distinct: string[] = [];
    for (const row of rows) {
      const trimmed = row.placeName?.trim();
      // DB 필터는 trim 전 원문 기준이라, '장소 미정 '처럼 trim하면 기본값과 같아지는
      // 레거시 값은 여기서 한 번 더 걸러야 한다.
      if (trimmed && trimmed !== DEFAULT_FIXTURE_PLACE_NAME && !distinct.includes(trimmed)) distinct.push(trimmed);
      if (distinct.length >= 5) break;
    }
    return distinct;
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

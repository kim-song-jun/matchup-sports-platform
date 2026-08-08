import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from '../games/public-records/public-consent';
import { calculateSeriesStandings, SeriesTieBreakCriterion } from './series-standings';

const PLAYER_RECORDS_LIMIT = 30;

@Injectable()
export class TeamMatchSeriesPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(seriesId: string) {
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
      startsOn: series.startsOn,
      endsOn: series.endsOn,
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

  async standings(seriesId: string) {
    const series = await this.loadSeries(seriesId);
    const teamIds = series.teams.map((entry) => entry.teamId);
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: { seriesId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
        game: { select: { id: true, currentOfficialRevisionId: true } },
      },
    });

    const currentRevisionIds = teamMatches
      .map((tm) => tm.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const facts = currentRevisionIds.length === 0
      ? []
      : await this.prisma.v1GameOfficialFact.findMany({
          where: { revisionId: { in: currentRevisionIds } },
          select: { gameId: true, homeScore: true, awayScore: true },
        });
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));

    const confirmedFixtures: Array<{ homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number }> = [];
    const pendingFixtures: Array<{ teamMatchId: string; homeTeamId: string; awayTeamId: string | null; startAt: Date }> = [];
    for (const tm of teamMatches) {
      const fact = tm.game === null ? undefined : factByGameId.get(tm.game.id);
      if (fact === undefined || tm.approvedApplicantTeamId === null) {
        pendingFixtures.push({ teamMatchId: tm.id, homeTeamId: tm.hostTeamId, awayTeamId: tm.approvedApplicantTeamId, startAt: tm.startAt });
        continue;
      }
      confirmedFixtures.push({ homeTeamId: tm.hostTeamId, awayTeamId: tm.approvedApplicantTeamId, homeScore: fact.homeScore, awayScore: fact.awayScore });
    }

    const tieBreakOrder = (series.tieBreakJson as { order?: SeriesTieBreakCriterion[] }).order ?? [
      'points', 'goalDifference', 'goalsFor', 'headToHead',
    ];
    const standings = calculateSeriesStandings({ teamIds, fixtures: confirmedFixtures, tieBreakOrder });

    return { seriesId: series.id, tieBreakOrder, standings, pendingFixtures };
  }

  // NOTE: assists is intentionally out of scope here. V1GameResultParticipant.assists
  // ships from the parallel T1 track (feat/v1-wave-b-recording) and isn't on this
  // branch's schema yet — selecting/reading it doesn't compile. Once T1 merges,
  // extend this method (and the response shape) to add an `assists` leaderboard
  // the same way `goals` is built below. Do not re-add an `assists` select/read
  // without first confirming `assists` exists on V1GameResultParticipant here.
  async playerRecords(seriesId: string) {
    const series = await this.loadSeries(seriesId);
    const teamMatchIds = (await this.prisma.v1TeamMatch.findMany({ where: { seriesId }, select: { id: true } })).map((tm) => tm.id);
    if (teamMatchIds.length === 0) return { seriesId: series.id, goals: [] };

    const games = await this.prisma.v1Game.findMany({
      where: { teamMatchId: { in: teamMatchIds }, currentOfficialRevisionId: { not: null } },
      select: { currentOfficialRevisionId: true },
    });
    const revisionIds = games.map((g) => g.currentOfficialRevisionId!).filter(Boolean);
    if (revisionIds.length === 0) return { seriesId: series.id, goals: [] };

    const participantRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: revisionIds } },
      select: { participantId: true, goals: true, resultRevision: { select: { officialAt: true } } },
    });

    const eligibility = await loadParticipantConsentEligibility(this.prisma, participantRows.map((row) => row.participantId));
    const totalsByUserId = new Map<string, { goals: number }>();
    for (const row of participantRows) {
      const eligibilityRow = eligibility.get(row.participantId);
      if (eligibilityRow === undefined) continue;
      const officialAt = row.resultRevision.officialAt;
      if (officialAt === null || !isParticipantPubliclyEligible(eligibilityRow, officialAt)) continue;
      const userId = eligibilityRow.linkedUserId!;
      const current = totalsByUserId.get(userId) ?? { goals: 0 };
      current.goals += row.goals;
      totalsByUserId.set(userId, current);
    }

    const userIds = [...totalsByUserId.keys()];
    const users = userIds.length === 0 ? [] : await this.prisma.v1User.findMany({ where: { id: { in: userIds } }, select: { id: true, profile: { select: { nickname: true } } } });
    const nicknameByUserId = new Map(users.map((u) => [u.id, u.profile?.nickname ?? null]));

    const rows = userIds.map((userId) => ({ userId, nickname: nicknameByUserId.get(userId) ?? null, ...totalsByUserId.get(userId)! }));
    return {
      seriesId: series.id,
      goals: [...rows].sort((a, b) => b.goals - a.goals).slice(0, PLAYER_RECORDS_LIMIT),
    };
  }

  private async loadSeries(seriesId: string) {
    const series = await this.prisma.v1TeamMatchSeries.findUnique({ where: { id: seriesId }, include: { teams: { select: { teamId: true } } } });
    if (series === null) {
      throw new NotFoundException({ code: 'SERIES_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    return series;
  }
}

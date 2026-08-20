import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from '../games/public-records/public-consent';
import { calculateLeagueStandings, LeagueTieBreakCriterion } from './league-standings';

const PLAYER_RECORDS_LIMIT = 30;

@Injectable()
export class LeagueMatchPublicService {
  constructor(private readonly prisma: PrismaService) {}

  async detail(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      orderBy: { startAt: 'asc' },
      select: { id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true, startAt: true, placeName: true, status: true },
    });
    return {
      leagueId: league.id,
      title: league.title,
      state: league.state,
      startsOn: league.startsOn,
      endsOn: league.endsOn,
      teamIds: league.teams.map((entry) => entry.teamId),
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

  async standings(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    const teamIds = league.teams.map((entry) => entry.teamId);
    const teamMatches = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
        status: true,
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
        // 취소된 대진은 앞으로 치러지지 않으므로 "예정 경기"로 영구 집계되지 않게 제외한다.
        // 공식 결과 fact가 이미 있는 경기는 이 분기에 들어오지 않아 status와 무관하게 confirmed로 남는다.
        if (tm.status === 'cancelled') continue;
        pendingFixtures.push({ teamMatchId: tm.id, homeTeamId: tm.hostTeamId, awayTeamId: tm.approvedApplicantTeamId, startAt: tm.startAt });
        continue;
      }
      confirmedFixtures.push({ homeTeamId: tm.hostTeamId, awayTeamId: tm.approvedApplicantTeamId, homeScore: fact.homeScore, awayScore: fact.awayScore });
    }

    const tieBreakOrder = (league.tieBreakJson as { order?: LeagueTieBreakCriterion[] }).order ?? [
      'points', 'goalDifference', 'goalsFor', 'headToHead',
    ];
    const standings = calculateLeagueStandings({ teamIds, fixtures: confirmedFixtures, tieBreakOrder });
    const teamNameById = new Map(league.teams.map((entry) => [entry.teamId, entry.team.name]));
    const teamLogoById = new Map(league.teams.map((entry) => [entry.teamId, entry.team.profile?.logoUrl ?? null]));
    const standingsWithTeamName = standings.map((row) => ({ ...row, teamName: teamNameById.get(row.teamId) ?? '', teamLogoUrl: teamLogoById.get(row.teamId) ?? null }));

    return { leagueId: league.id, tieBreakOrder, standings: standingsWithTeamName, pendingFixtures };
  }

  async playerRecords(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    const teamMatchIds = (await this.prisma.v1TeamMatch.findMany({ where: { leagueId }, select: { id: true } })).map((tm) => tm.id);
    if (teamMatchIds.length === 0) return { leagueId: league.id, goals: [], assists: [] };

    const games = await this.prisma.v1Game.findMany({
      where: { teamMatchId: { in: teamMatchIds }, currentOfficialRevisionId: { not: null } },
      select: { currentOfficialRevisionId: true },
    });
    const revisionIds = games.map((g) => g.currentOfficialRevisionId!).filter(Boolean);
    if (revisionIds.length === 0) return { leagueId: league.id, goals: [], assists: [] };

    const participantRows = await this.prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: { in: revisionIds } },
      select: { participantId: true, goals: true, assists: true, resultRevision: { select: { officialAt: true } } },
    });

    const eligibility = await loadParticipantConsentEligibility(this.prisma, participantRows.map((row) => row.participantId));
    const totalsByUserId = new Map<string, { goals: number; assists: number }>();
    for (const row of participantRows) {
      const eligibilityRow = eligibility.get(row.participantId);
      if (eligibilityRow === undefined) continue;
      // officialAt이 null이면(공식 확정 안 됨) 이 행은 애초에 집계 대상이 아니다 --
      // 동의 판정(isParticipantPubliclyEligible)은 시간 비교를 하지 않으므로
      // 이 null 체크는 그 판정과 무관한 별개의 "공식 결과인가" 게이트다.
      if (row.resultRevision.officialAt === null || !isParticipantPubliclyEligible(eligibilityRow)) continue;
      const userId = eligibilityRow.linkedUserId!;
      const current = totalsByUserId.get(userId) ?? { goals: 0, assists: 0 };
      current.goals += row.goals;
      current.assists += row.assists;
      totalsByUserId.set(userId, current);
    }

    const userIds = [...totalsByUserId.keys()];
    const users = userIds.length === 0 ? [] : await this.prisma.v1User.findMany({ where: { id: { in: userIds } }, select: { id: true, profile: { select: { nickname: true } } } });
    const nicknameByUserId = new Map(users.map((u) => [u.id, u.profile?.nickname ?? null]));

    const rows = userIds.map((userId) => ({ userId, nickname: nicknameByUserId.get(userId) ?? null, ...totalsByUserId.get(userId)! }));
    // 각 순위는 해당 기록이 1 이상인 선수만 노출한다 — 골 0개 선수가 득점 순위에 뜨면 안 된다.
    return {
      leagueId: league.id,
      goals: rows.filter((row) => row.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, PLAYER_RECORDS_LIMIT),
      assists: rows.filter((row) => row.assists > 0).sort((a, b) => b.assists - a.assists).slice(0, PLAYER_RECORDS_LIMIT),
    };
  }

  private async loadLeague(leagueId: string) {
    const league = await this.prisma.v1League.findUnique({
      where: { id: leagueId },
      include: { teams: { select: { teamId: true, team: { select: { name: true, profile: { select: { logoUrl: true } } } } } } },
    });
    if (league === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    return league;
  }
}

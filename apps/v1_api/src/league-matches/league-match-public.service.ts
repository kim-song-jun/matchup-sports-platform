import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isParticipantPubliclyEligible, loadParticipantConsentEligibility } from '../games/public-records/public-consent';
import { calculateLeagueStandings, LeagueTieBreakCriterion } from './league-standings';
import { ListLeagueMatchesQueryDto } from './dto/league-match.dto';

const PLAYER_RECORDS_LIMIT = 30;
const LEAGUE_LIST_DEFAULT_LIMIT = 20;
const LEAGUE_LIST_MAX_LIMIT = 50;

@Injectable()
export class LeagueMatchPublicService {
  constructor(private readonly prisma: PrismaService) {}

  // R5: 공개 리그 목록. team-matches.service.ts list()와 동일한 cursor 관례(take: limit+1,
  // 마지막 행을 잘라 hasNext 판정)를 따른다.
  //
  // 정렬 기본값은 createdAt desc(최근 개설순) -- tournaments-read.service.ts list()의
  // 기본 정렬과 동일하다. 처음에는 startsOn asc(개장일이 가까운 순)를 시도했지만, state
  // 기본 필터가 없어 draft/active/completed가 한 목록에 섞이는 이 엔드포인트에서는 함정이
  // 있다: 오래전에 끝난 completed 리그의 startsOn이 과거의 "이른" 날짜라 오름차순 맨 위로
  // 떠 버린다(발견 목록에서 가장 먼저 보여야 할 대상이 정반대로 뒤바뀜). createdAt desc는
  // 이 문제가 없고, id desc를 tie-break로 붙여 같은 시각에 만들어진 행(시드·일괄 생성)의
  // 상대 순서를 고정한다(tournaments 쪽과 동일한 이유 -- 안 붙이면 skip 기반 커서
  // 페이지네이션에서 행이 중복되거나 통째로 빠질 수 있다).
  // teamCount는 각 리그마다 별도 COUNT 쿼리를 날리는 대신 findMany의 _count select로
  // 한 번에 집계한다(N+1 없음) -- admin list()의 동일 패턴 재사용.
  async list(query: ListLeagueMatchesQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? LEAGUE_LIST_DEFAULT_LIMIT, 1), LEAGUE_LIST_MAX_LIMIT);
    const leagues = await this.prisma.v1League.findMany({
      where: {
        ...(query.sportId ? { sportId: query.sportId } : {}),
        ...(query.regionId ? { regionId: query.regionId } : {}),
        ...(query.state ? { state: query.state } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        state: true,
        startsOn: true,
        endsOn: true,
        // code는 프론트의 getSportAccent(code)/SportGlyph가 요구하는 키다 --
        // 대회 목록(V1TournamentListItem.sport)이 이미 같은 { code, name } 모양을
        // 쓰고 있어(apps/v1_web/src/types/api.ts) 같은 관례를 그대로 맞춘다.
        sport: { select: { id: true, code: true, name: true } },
        region: { select: { id: true, name: true } },
        _count: { select: { teams: true } },
      },
    });

    const pageItems = leagues.slice(0, limit);
    const hasNext = leagues.length > limit;

    return {
      items: pageItems.map((league) => ({
        leagueId: league.id,
        title: league.title,
        state: league.state,
        startsOn: league.startsOn,
        endsOn: league.endsOn,
        sport: { sportId: league.sport.id, code: league.sport.code, name: league.sport.name },
        region: { regionId: league.region.id, name: league.region.name },
        teamCount: league._count.teams,
      })),
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async detail(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: { leagueId },
      orderBy: { startAt: 'asc' },
      select: {
        id: true, title: true, hostTeamId: true, approvedApplicantTeamId: true, startAt: true, placeName: true, status: true,
        game: { select: { id: true, currentOfficialRevisionId: true } },
      },
    });

    // standings()와 동일한 패턴: 확정 리비전 id를 모아 v1_game_official_fact를
    // 단일 IN 조회로 가져온다(대진 수만큼 반복 조회하는 N+1을 만들지 않는다).
    const currentRevisionIds = fixtures
      .map((fixture) => fixture.game?.currentOfficialRevisionId ?? null)
      .filter((id): id is string => id !== null);
    const facts = currentRevisionIds.length === 0
      ? []
      : await this.prisma.v1GameOfficialFact.findMany({
          where: { revisionId: { in: currentRevisionIds } },
          select: { gameId: true, homeScore: true, awayScore: true },
        });
    const factByGameId = new Map(facts.map((fact) => [fact.gameId, fact]));

    return {
      leagueId: league.id,
      title: league.title,
      state: league.state,
      startsOn: league.startsOn,
      endsOn: league.endsOn,
      teamIds: league.teams.map((entry) => entry.teamId),
      fixtures: fixtures.map((fixture) => {
        const fact = fixture.game === null ? undefined : factByGameId.get(fixture.game.id);
        return {
          teamMatchId: fixture.id,
          title: fixture.title,
          homeTeamId: fixture.hostTeamId,
          awayTeamId: fixture.approvedApplicantTeamId,
          startAt: fixture.startAt,
          placeName: fixture.placeName,
          status: fixture.status,
          // 공식 결과가 아직 없으면(미확정 대진) null -- 0:0으로 오인되지 않게 명시적으로
          // nullable을 유지한다.
          homeScore: fact?.homeScore ?? null,
          awayScore: fact?.awayScore ?? null,
        };
      }),
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
      // [정책 변경 이력 — R8] 이 분기는 원래 "공식 결과 fact가 있으면 팀매치 status와
      // 무관하게 confirmed로 남긴다"는 의도된 동작이었다(이미 열린 경기의 결과는
      // 취소돼도 기록으로 남겨야 한다는 전제). 하지만 어드민은 팀매치를 자유롭게
      // cancelled로 바꿀 수 있어서, 오심·오입력 정정으로 취소된 경기가 여전히
      // 순위에 반영되는 상태가 만들어질 수 있었다 -- 취소한 경기가 순위표에 그대로
      // 남는 쪽이(정정이 반영되지 않는 것처럼 보임) 순위표 신뢰도를 해치는 더 큰
      // 운영 리스크이므로, cancelled는 fact 존재 여부와 무관하게 confirmed·pending
      // 양쪽에서 전부 제외하도록 뒤집는다. 취소된 대진은 앞으로도 치러지지 않으므로
      // "예정 경기"로도 영구 집계되지 않는다.
      if (tm.status === 'cancelled') continue;

      const fact = tm.game === null ? undefined : factByGameId.get(tm.game.id);
      if (fact === undefined || tm.approvedApplicantTeamId === null) {
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

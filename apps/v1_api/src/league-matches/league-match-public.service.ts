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
        // 티어는 목록에서도 필요하다 -- 이 목록은 "자기 수준의 리그를 고르는" 화면이라
        // 상세에 들어가야만 몇 부인지 알 수 있으면 고를 수가 없다(Task 153 시나리오 3).
        // 제목에 "1부"가 들어 있어서 읽히는 것에 기대면 안 된다: 제목은 운영자 자유입력이다.
        tier: true,
        seasonNo: true,
        seriesId: true,
        series: { select: { id: true, title: true } },
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
        // 단발 리그는 넷 다 null -- 티어가 "1부"인 게 아니라 티어 개념 자체가 없다는
        // 뜻이므로 상세 응답과 같은 규칙으로 null 을 유지하고, 화면은 null 이면 뱃지를
        // 아예 띄우지 않는다.
        seriesId: league.seriesId,
        tier: league.tier,
        tierLabel: league.tier === null ? null : `${league.tier}부`,
        seasonNo: league.seasonNo,
        seriesTitle: league.series?.title ?? null,
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
      // 시리즈에 속하지 않은 단발 리그는 셋 다 null 이다 — 화면은 null 이면 티어 뱃지를 띄우지 않는다.
      seriesId: league.seriesId,
      seriesTitle: league.series?.title ?? null,
      tier: league.tier,
      tierLabel: league.tier === null ? null : `${league.tier}부`,
      seasonNo: league.seasonNo,
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

    // 확정된 승강 결과를 순위표에 얹는다(Task 153 시나리오 4). V1LeaguePromotion 은
    // 그동안 createMany 로 쓰기만 하고 아무도 읽지 않는 테이블이었다 — 감사 추적을 위해
    // 만들었는데 정작 어디에도 드러나지 않았다. preview 단계에서는 행이 아예 만들어지지
    // 않으므로, 여기 값이 있다는 것은 곧 어드민이 최종 승인했다는 뜻이고, 확정 전(행 0건)
    // 에는 전부 null 이라 순위표 모양이 바뀌지 않는다.
    // 어드민 전용 필드(computedKind/overriddenByAdmin/overrideNote/결정자)는 노출하지 않는다 --
    // "왜 규칙과 다르게 조정했는지"는 운영 판단이라 공개 대상이 아니다(153 Security Notes).
    const promotions = await this.prisma.v1LeaguePromotion.findMany({
      where: { fromLeagueId: league.id },
      select: { teamId: true, kind: true, toTier: true },
    });
    const promotionByTeamId = new Map(promotions.map((row) => [row.teamId, row]));

    const standingsWithTeamName = standings.map((row) => {
      const promotion = promotionByTeamId.get(row.teamId);
      return {
        ...row,
        teamName: teamNameById.get(row.teamId) ?? '',
        teamLogoUrl: teamLogoById.get(row.teamId) ?? null,
        promotionKind: promotion?.kind ?? null,
        promotionToTier: promotion?.toTier ?? null,
        promotionToTierLabel: promotion === undefined ? null : `${promotion.toTier}부`,
      };
    });

    return {
      leagueId: league.id,
      tier: league.tier,
      tierLabel: league.tier === null ? null : `${league.tier}부`,
      tieBreakOrder,
      standings: standingsWithTeamName,
      pendingFixtures,
      // 이름은 dev 에 이미 머지된 #628 계약을 따른다(promotionDecided). 이 브랜치는
      // 한때 promotionsDecided 로 바꿨었지만, 그 사이 #628 이 dev 에 들어가 배포된
      // 계약이 되었으므로 새로 이름을 바꿀 이유가 없다 -- 통합 테스트도 이 이름을 본다.
      promotionDecided: promotions.length > 0,
    };
  }

  async playerRecords(leagueId: string) {
    const league = await this.loadLeague(leagueId);
    // 취소된 대진은 standings()와 동일한 기준으로 제외한다(R8). 이 필터가 없으면
    // "순위표에서는 빠진 경기의 득점이 득점 순위에는 남아 있는" 상태가 만들어져
    // 같은 화면 안에서 두 집계가 서로 다른 경기 집합을 쓰게 된다.
    const teamMatchIds = (
      await this.prisma.v1TeamMatch.findMany({
        where: { leagueId, status: { not: 'cancelled' } },
        select: { id: true },
      })
    ).map((tm) => tm.id);
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
      include: {
        teams: { select: { teamId: true, team: { select: { name: true, profile: { select: { logoUrl: true } } } } } },
        series: { select: { id: true, title: true, tierCount: true } },
      },
    });
    if (league === null) {
      throw new NotFoundException({ code: 'LEAGUE_NOT_FOUND', message: '리그를 찾을 수 없어요.' });
    }
    return league;
  }
}

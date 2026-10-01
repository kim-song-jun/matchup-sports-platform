import { ConflictException, Injectable } from '@nestjs/common';
import { V1GameLineupState, type Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
// 주차 규칙은 공용 모듈이 소유한다. 아래 private 메서드는 "DB 에서 형제 경기일을 모으는" 부분만
// 담당하므로 이름이 겹친다 — 별칭으로 구분한다.
import { resolveLeagueWeekNumbers as resolveWeekNumbersFromStartAts } from '../league-matches/league-week-number';
import { loadCompetitionRosterBase, loadGameRoster } from '../games/roster/game-roster-loader';
import { summarizeGameRoster, type GameRosterSummary } from '../games/roster/game-roster-matrix';
import { PrismaService } from '../prisma/prisma.service';
import { loadTeamCompetitionGameOrder } from '../tournaments/discipline/team-game-order';
import { tournamentRoundLabel } from '../tournaments/tournament-round-label';

/** 라인업이 아직 끝나지 않은 상태. 완료(SUBMITTED/LOCKED)는 아예 목록에 오르지 않는다. */
export type LineupTodoState = 'MISSING' | 'DRAFT';

/**
 * 라인업 상태 전체 — 완료까지 포함한다. `LineupTodoState` 를 넓히지 않고 따로 둔 이유:
 * 할 일 목록(홈 카드·알림 워커)은 완료를 **볼 일이 없는** 소비자라, 그 union 에 'DONE' 을
 * 얹으면 그쪽 코드가 절대 오지 않는 값을 분기해야 한다.
 */
export type TeamGameLineupState = LineupTodoState | 'DONE';

/**
 * 그 팀의 다가오는 경기 하나. 할 일(LineupTodo)과 **같은 수집 경로**에서 나오지만
 * 완료된 라인업도 포함한다 — 이건 "아직 할 일"이 아니라 "우리 팀 경기 목록"이라
 * 라인업을 이미 제출했어도 그 경기는 여전히 우리 경기다(전술보드 진입점이 이걸 쓴다).
 */
export type TeamUpcomingGame = Omit<LineupTodo, 'state'> & { lineupState: TeamGameLineupState };

export type LineupTodo = {
  source: 'TEAM_MATCH';
  /** TEAM_MATCH also carries regular-league rows, so tournamentId alone is not a discriminator. */
  competitionKind: 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';
  teamId: string;
  teamName: string;
  gameId: string;
  /**
   * 이 경기가 속한 **대회 또는 리그**. 대회 경기면 대회 id/제목, 리그 대진이면 리그
   * id/제목이 들어간다 — 어느 쪽인지는 `competitionKind`로 구분한다.
   *
   * 리그 값을 대회 이름의 자리에 싣는 것은 이 레포의 기존 관례다
   * (public-tournament-records.service.ts `getLeagueFixtureRecord` — 같은 화면·같은 소비자가
   * 분기 없이 하나의 필드를 읽게 하려는 것). 리그 전용 필드를 새로 만들면 소비자(알림
   * 워커·홈 카드)마다 "둘 중 채워진 쪽"을 고르는 분기가 늘어난다.
   *
   */
  tournamentId: string | null;
  tournamentTitle: string | null;
  /**
   * 화면·알림에 그대로 나가는 한 줄 라벨. 대회 경기는 "대회명 · 라운드", 리그 대진은
   * "리그명 N주차", 리그가 아닌 친선 팀매치는 '팀 매치' 고정이다.
   *
   * 리그의 주차는 `V1TeamMatch.title`에 박제된 값을 쓰지 않는다 — 그 제목은 대진 생성
   * 시점에 굳고 재일정(`updateFixture`)에서 갱신되지 않아서, 그대로 쓰면 같은 경기를
   * 공개 경기기록·어드민 영상 화면과 **다른 주차로 부르게 된다**. 저 두 화면과 같은
   * 규칙(KST 경기일 순번)으로 `startAt`에서 매번 파생한다.
   */
  title: string;
  opponentName: string | null;
  scheduledAt: Date | null;
  state: LineupTodoState;
  /** 대회·리그 = 경기 명단 화면(`rosterScreenPath`), 친선 = 참석명단 화면. */
  deepLink: string;
};

/** 대회·리그 경기의 "명단 확인" 대상 — 전날 알림이 쓴다. */
export type CompetitionRosterCheck = TeamUpcomingGame & { rosterSummary: GameRosterSummary };

/** 대회·리그 경기 명단 웹 화면. 알림 딥링크와 웹 라우트가 같은 값을 써야 한다. */
export function rosterScreenPath(teamId: string, gameId: string): string {
  return `/teams/${teamId}/games/${gameId}/roster`;
}

/**
 * "라인업을 넣어야 하는데 아직 안 된" 경기를 찾아낸다.
 *
 * 화면(홈·마이 페이지의 할 일 카드)과 워커(일일 리마인더)가 **같은 판정을 공유**해야
 * 한다. 둘이 각자 계산하면 "알림은 왔는데 화면엔 없다" 같은 어긋남이 생기고, 그때
 * 사용자는 둘 중 뭘 믿어야 할지 알 수 없다. 그래서 판정은 여기 한 곳에만 둔다.
 *
 * 다루지 않는 것:
 * - **대회·리그 경기**(Task 179 R1). 경기 명단은 참가 명단에서 계산되고 팀장은 빠질 사람만
 *   조정하므로 "제출" 할 일이 없다 — 전날 "명단 확인" 알림(`listCompetitionRosterChecks`)이 대신한다.
 * - **대진이 아직 안 잡힌 대회**. 참가가 확정돼도 상대와 시간이 정해지기 전에는 라인업을
 *   넣을 화면 자체가 없다. 재촉해봐야 할 수 있는 일이 없으므로 목록에 올리지 않는다.
 * - **이미 제출·잠긴 라인업**. 할 일이 아니다.
 * - **지나간 경기**. 킥오프가 지나면 어차피 직접 수정할 수 없다.
 */
@Injectable()
export class LineupTodoService {
  constructor(private readonly prisma: PrismaService) {}

  /** 이 사용자가 owner/manager로 있는 모든 팀의 미완료 참석명단(친선만). */
  async listForUser(user: V1AuthUser): Promise<{ items: LineupTodo[] }> {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { teamId: true },
    });
    const teamIds = memberships.map((membership) => membership.teamId);
    if (teamIds.length === 0) return { items: [] };
    return { items: await this.collect(teamIds, new Date()) };
  }

  /**
   * 워커용 — 팀을 가리지 않고 다가오는 모든 미완료 라인업을 모은다. 알림을 보낼지 말지는
   * 호출자가 시간대·중복 규칙으로 판단한다.
   */
  async listAllPending(now: Date): Promise<LineupTodo[]> {
    return this.collect(null, now);
  }

  /**
   * 한 팀의 **다가오는 경기 전부** — 라인업을 이미 제출했어도 포함한다.
   *
   * 할 일 목록과 갈리는 지점이 여기 하나다. 전술보드 진입점이 이걸 쓰는데, 할 일 규칙을
   * 그대로 쓰면 **팀이 라인업을 제출하는 순간 그 경기의 전술보드에 다시 못 들어간다** —
   * 전술은 제출 후에도 계속 고치는 것이라 그 동작은 틀렸다.
   *
   * 알려진 한계: `collect` 계열은 `now` 기준으로 앞으로의 경기만 모은다. 그래서 **끝난
   * 경기의 전술보드는 이 목록으로 열 수 없다.** 지금은 의도된 범위다(지난 경기 배치를
   * 다시 여는 화면이 아직 없다) — 이름에 `upcoming` 을 넣어 그 한계를 드러내 둔다.
   */
  async listUpcomingForTeam(teamId: string, now: Date): Promise<TeamUpcomingGame[]> {
    return this.collectWithLineupState([teamId], now);
  }

  /**
   * 여러 팀의 다가오는 경기를 시각순으로 한 번에 모은다(홈의 "다음 경기"). 팀이 없으면 빈 목록.
   * `startedWithinMs` 를 주면 킥오프가 그만큼 안쪽으로 지난 경기도 남긴다 — 결과가 나가면
   * 팀매치가 `completed` 가 되어 `status: matched` 조건에서 바로 빠진다.
   */
  async listUpcomingForTeams(
    teamIds: readonly string[],
    now: Date,
    options: { startedWithinMs?: number } = {},
  ): Promise<TeamUpcomingGame[]> {
    if (teamIds.length === 0) return [];
    return this.collectWithLineupState([...teamIds], now, options.startedWithinMs ?? 0);
  }

  /**
   * `[from, to)` 에 시작하는 대회·리그 경기의 팀별 계산된 명단 요약. 기준 명단이 없는 팀
   * (확정 신청 없는 대회 등)은 알릴 명단이 없으므로 빠진다.
   */
  async listCompetitionRosterChecks(from: Date, to: Date): Promise<CompetitionRosterCheck[]> {
    const games = (await this.collectWithLineupState(null, from)).filter(
      (game) => game.competitionKind !== 'FRIENDLY' && game.scheduledAt !== null && game.scheduledAt < to,
    );
    const byTeam = new Map<string, TeamUpcomingGame[]>();
    for (const game of games) byTeam.set(game.teamId, [...(byTeam.get(game.teamId) ?? []), game]);

    const checks: CompetitionRosterCheck[] = [];
    for (const [teamId, teamGames] of byTeam) {
      const rosters = await loadRosterSummaries(this.prisma, teamId, teamGames);
      for (const game of teamGames) {
        const summary = rosters.get(game.gameId)?.summary;
        if (summary) checks.push({ ...game, rosterSummary: summary });
      }
    }
    return checks;
  }

  // ─── internals ───────────────────────────────────────────────────────────

  /**
   * 수집 경로는 하나다 — 할 일 목록도 팀 경기 목록도 여기서 나온다. 두 벌로 복사하면
   * 한쪽만 고쳐지는 순간 홈 카드와 팀 화면이 서로 다른 경기를 보여주기 시작한다.
   * 완료(DONE) 를 걸러내는 것은 **호출자의 판단**이라 여기서 하지 않는다.
   */
  private async collectWithLineupState(
    teamIds: string[] | null,
    now: Date,
    startedWithinMs = 0,
  ): Promise<TeamUpcomingGame[]> {
    const candidates = await this.loadTeamMatches(teamIds, now, startedWithinMs);
    if (candidates.length === 0) return [];

    const states = await this.loadLineupStates(candidates.map((candidate) => ({
      gameId: candidate.gameId,
      teamId: candidate.teamId,
    })));

    const items = candidates.map((candidate) => ({
      ...candidate,
      lineupState: states.get(`${candidate.gameId}:${candidate.teamId}`) ?? ('MISSING' as const),
    }));
    items.sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity));
    return items;
  }

  private async collect(teamIds: string[] | null, now: Date): Promise<LineupTodo[]> {
    const rows = await this.collectWithLineupState(teamIds, now);
    const items: LineupTodo[] = [];
    for (const { lineupState, ...rest } of rows) {
      // 제출됐거나 잠긴 라인업은 할 일이 아니다.
      if (lineupState === 'DONE') continue;
      if (rest.competitionKind !== 'FRIENDLY') continue;
      items.push({ ...rest, state: lineupState });
    }
    return items;
  }

  private async loadTeamMatches(teamIds: string[] | null, now: Date, startedWithinMs: number) {
    const matches = await this.prisma.v1TeamMatch.findMany({
      where: {
        // 상대가 정해진 매치만 — 아직 모집 중이면 라인업을 짤 대상이 없다.
        status: 'matched',
        startAt: { gte: new Date(now.getTime() - startedWithinMs) },
        hostTeamId: { not: null },
        approvedApplicantTeamId: { not: null },
        game: { isNot: null },
        ...(teamIds !== null
          ? { OR: [{ hostTeamId: { in: teamIds } }, { approvedApplicantTeamId: { in: teamIds } }] }
          : {}),
      },
      select: {
        id: true,
        // `title`은 읽지 않는다 — 리그 대진의 라벨은 아래에서 리그명 + 파생 주차로 조립하고,
        // 친선 팀매치의 제목은 모집 문구라 라벨로 쓰지 않는다.
        startAt: true,
        hostTeamId: true,
        hostTeam: { select: { name: true } },
        approvedApplicantTeamId: true,
        approvedApplicantTeam: { select: { name: true } },
        leagueId: true,
        tournamentId: true,
        tournament: { select: { title: true } },
        tournamentDetails: { select: { round: true } },
        // 리그 제목은 관계로 가져온다 — Prisma 가 대진 목록에 딸린 리그를 id IN (...) 한 번으로
        // 모아 오므로 대진 수(최대 500)만큼 쿼리가 늘지 않는다.
        league: { select: { title: true } },
        game: { select: { id: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 500,
    });

    // Prisma keeps these columns nullable because tournament TBD slots share the
    // TeamMatch table. A slot without a scheduled time has no lineup action yet;
    // retain only scheduled rows for this actionable surface and narrow the type
    // before deriving league weeks.
    const scheduledMatches = matches.flatMap((match) =>
      match.startAt === null ? [] : [{ ...match, startAt: match.startAt }],
    );
    const weekNumberByTeamMatchId = await this.resolveLeagueWeekNumbers(scheduledMatches);

    const rows: Array<Omit<LineupTodo, 'state'>> = [];
    for (const match of scheduledMatches) {
      if (match.game === null) continue;
      // League creators temporarily carry both IDs for the shared TeamMatch row.
      // `leagueId` is the authoritative discriminator for those rows; checking
      // tournamentId first silently drops every such league todo as incomplete.
      const isLeagueMatch = match.leagueId !== null && match.leagueId !== undefined;
      const isTournamentMatch = !isLeagueMatch && match.tournamentId !== null && match.tournamentId !== undefined;
      // A canonical tournament row must have its bracket metadata and title. Do not
      // silently render it as a friendly match when an expand-phase row is incomplete.
      if (isTournamentMatch && (match.tournament === null || match.tournamentDetails === null)) {
        throw new ConflictException({
          code: 'TOURNAMENT_MATCH_METADATA_INCOMPLETE',
          message: '대회 경기의 라운드 정보가 아직 준비되지 않았어요.',
        });
      }
      if (match.hostTeamId === null || match.approvedApplicantTeamId === null) continue;
      const sides = [
        { teamId: match.hostTeamId, teamName: match.hostTeam?.name ?? null, opponentName: match.approvedApplicantTeam?.name ?? null },
        {
          teamId: match.approvedApplicantTeamId,
          teamName: match.approvedApplicantTeam?.name ?? null,
          opponentName: match.hostTeam?.name ?? null,
        },
      ];
      // 리그 대진의 라벨은 "<리그명> N주차"로 **여기서 조립한다**. 저장된
      // `V1TeamMatch.title`("<리그명> N주차 M경기")을 쓰지 않는 이유는 그 값이 대진 생성
      // 시점에 굳고 재일정에서 갱신되지 않기 때문이다 — 운영자가 경기를 앞당기면 제목만
      // 옛 주차로 남아, 같은 경기를 공개 경기기록·어드민 영상 화면과 다른 주차로 부르게 된다.
      // 그래서 주차는 저 화면들과 같은 규칙(KST 경기일 순번)으로 startAt에서 파생한다.
      // 그날의 경기 순번("M경기")도 붙이지 않는다. timing 을 지정한 리그는 한 팀이 하루에
      // 여러 경기를 뛰므로(팀당 하루 N경기) 순번이 행을 구분해 주긴 했지만, 그 값 역시
      // 제목과 함께 굳어 재일정 뒤에는 실제 킥오프 순서와 어긋난다 — 틀린 순번을 말하느니
      // 말하지 않는 편이 낫고, 주차를 파생하는 다른 화면들도 순번은 말하지 않는다. 같은 날
      // 여러 행이 서면 카드 아래줄의 "vs 상대"가 그대로 구분자 역할을 한다.
      // 친선 팀매치(leagueId 없음)는 사용자가 붙인 제목이 리그 맥락이 아니라 모집 문구라
      // 예전처럼 '팀 매치'로 둔다.
      const leagueTitle = match.league?.title ?? null;
      const tournamentTitle = match.tournament?.title ?? null;
      const competitionKind = isTournamentMatch ? 'TOURNAMENT' as const : leagueTitle === null ? 'FRIENDLY' as const : 'LEAGUE' as const;
      const weekNumber = weekNumberByTeamMatchId.get(match.id);
      const title = isTournamentMatch
        ? [tournamentTitle, tournamentRoundLabel(match.tournamentDetails!.round)].filter(Boolean).join(' · ')
        : leagueTitle === null || weekNumber === undefined ? '팀 매치' : `${leagueTitle} ${weekNumber}주차`;
      for (const side of sides) {
        if (side.teamId === null || side.teamName === null) continue;
        if (teamIds !== null && !teamIds.includes(side.teamId)) continue;
        rows.push({
          source: 'TEAM_MATCH',
          competitionKind,
          teamId: side.teamId,
          teamName: side.teamName,
          gameId: match.game.id,
          tournamentId: isTournamentMatch ? match.tournamentId! : match.leagueId,
          tournamentTitle: isTournamentMatch ? tournamentTitle : leagueTitle,
          title,
          opponentName: side.opponentName,
          scheduledAt: match.startAt,
          deepLink:
            competitionKind === 'FRIENDLY'
              ? `/team-matches/${match.id}/lineup`
              : rosterScreenPath(side.teamId, match.game.id),
        });
      }
    }
    return rows;
  }

  /**
   * 리그 대진의 "N주차" — 대진 제목에 박제된 주차 대신 `startAt`에서 매번 파생한다.
   *
   * 규칙은 공개 경기기록(`public-tournament-records.service.ts`의 `resolveLeagueWeekNumber`)·
   * 어드민 영상 화면(`league-fixture-videos.service.ts`)과 **완전히 같다**: 그 리그의 서로 다른
   * KST 경기일을 오름차순으로 세어 몇 번째 날인지가 곧 주차다. 같은 경기가 화면마다 다른
   * 주차로 불리면 안 되므로 규칙을 여기서 새로 만들지 않는다.
   *
   * 저쪽이 `startAt <= 대상`으로 범위를 좁히는 것은 비용 최적화일 뿐이다(뒤 날짜는 앞
   * 날짜의 순번을 바꾸지 못한다). 여기서는 여러 대진의 주차를 한 번에 구해야 하므로
   * 리그별 경기일 전체를 **리그 단위 한 번의 조회로** 모아 두고 각자 순번을 찾는다.
   */
  private async resolveLeagueWeekNumbers(
    matches: ReadonlyArray<{ id: string; leagueId: string | null; startAt: Date }>,
  ): Promise<Map<string, number>> {
    const leagueIds = [
      ...new Set(matches.map((match) => match.leagueId).filter((id): id is string => id !== null)),
    ];
    // 리그 대진이 하나도 없으면(친선만 있는 흔한 경우) 추가 왕복을 만들지 않는다.
    if (leagueIds.length === 0) return new Map();

    const siblings = await this.prisma.v1TeamMatch.findMany({
      // 취소된 대진도 경기일에 포함한다 — 위 두 화면이 쓰는 조건과 같아야 주차가 어긋나지 않는다.
      where: { leagueId: { in: leagueIds }, deletedAt: null },
      select: { leagueId: true, startAt: true },
    });

    const startAtsByLeagueId = new Map<string, Date[]>();
    for (const sibling of siblings) {
      if (sibling.leagueId === null) continue;
      if (sibling.startAt === null) {
        throw new Error('League TeamMatch is missing startAt');
      }
      const bucket = startAtsByLeagueId.get(sibling.leagueId);
      if (bucket === undefined) startAtsByLeagueId.set(sibling.leagueId, [sibling.startAt]);
      else bucket.push(sibling.startAt);
    }
    // 순번 규칙 자체는 공용 모듈이 소유한다 — 같은 규칙이 화면마다 복제되면서 새 소비처가
    // 저장된 제목을 쓰는 함정을 다시 밟은 전례가 있다(league-week-number.ts 헤더 참고).
    return resolveWeekNumbersFromStartAts(startAtsByLeagueId, matches);
  }

  /**
   * (경기, 팀)마다 라인업이 어디까지 됐는지 판정한다.
   *
   * 사이드별 **최신 revision** 하나만 본다. 정정 요청으로 다시 열린 초안이 있으면 그게
   * 최신이므로 자연히 "아직 안 끝남"으로 잡힌다 — 예전 제출본이 남아 있다고 해서 할 일이
   * 끝난 게 아니다.
   */
  private async loadLineupStates(
    keys: Array<{ gameId: string; teamId: string }>,
  ): Promise<Map<string, LineupTodoState | 'DONE'>> {
    const gameIds = [...new Set(keys.map((key) => key.gameId))];
    const [sides, lineups] = await Promise.all([
      this.prisma.v1GameSide.findMany({
        where: { gameId: { in: gameIds } },
        select: { id: true, gameId: true, teamId: true },
      }),
      // `distinct`로 사이드마다 최신 revision 한 행만 받는다 — 이 경로는 리마인더 스캔이
      // 15분마다 도는 곳이라, 전 revision을 받아 메모리에서 고르면 라인업을 자주 고치는
      // 팀이 늘어날수록 스캔 비용이 함께 자란다(Copilot 리뷰 지적). 정렬이 사이드별
      // revision 내림차순이므로 남는 행은 인메모리로 고르던 것과 같다.
      this.prisma.v1GameLineup.findMany({
        where: { gameId: { in: gameIds }, invalidatedAt: null },
        orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
        distinct: ['sideId'],
        select: { sideId: true, state: true },
      }),
    ]);

    const latestStateBySideId = new Map<string, V1GameLineupState>();
    for (const lineup of lineups) {
      if (!latestStateBySideId.has(lineup.sideId)) latestStateBySideId.set(lineup.sideId, lineup.state);
    }

    const result = new Map<string, LineupTodoState | 'DONE'>();
    for (const side of sides) {
      if (side.teamId === null) continue;
      const state = latestStateBySideId.get(side.id);
      result.set(
        `${side.gameId}:${side.teamId}`,
        state === undefined
          ? 'MISSING'
          : state === V1GameLineupState.DRAFT
            ? 'DRAFT'
            : 'DONE',
      );
    }
    return result;
  }
}

export interface GameRosterSummaryEntry {
  readonly teamMatchId: string | null;
  readonly sideId: string;
  readonly summary: GameRosterSummary | null;
  /** 계산된 출전자의 userId. `summary` 와 같은 계산에서 나오므로 함께 null 이다. */
  readonly participantUserIds: ReadonlySet<string> | null;
}

/** 한 팀의 경기들에 대한 사이드·계산된 명단 요약. 대회·리그만 요약이 있고 친선·기준 명단 없음은 null. */
export async function loadRosterSummaries(
  tx: Prisma.TransactionClient,
  teamId: string,
  games: readonly TeamUpcomingGame[],
): Promise<Map<string, GameRosterSummaryEntry>> {
  const sides = await tx.v1GameSide.findMany({
    where: { gameId: { in: games.map((game) => game.gameId) }, teamId },
    select: { id: true, gameId: true, game: { select: { teamMatchId: true } } },
  });
  const sideByGame = new Map(sides.map((side) => [side.gameId, side]));
  const preloaded = new Map<string, Awaited<ReturnType<typeof preload>>>();
  async function preload(competitionId: string, isLeague: boolean) {
    const scope = { competitionId, isLeague, teamId };
    const base = await loadCompetitionRosterBase(tx, scope);
    return { base, orderedGames: base === null ? [] : await loadTeamCompetitionGameOrder(tx, scope) };
  }

  const result = new Map<string, GameRosterSummaryEntry>();
  for (const game of games) {
    const side = sideByGame.get(game.gameId);
    if (side === undefined) continue;
    let summary: GameRosterSummary | null = null;
    let participantUserIds: ReadonlySet<string> | null = null;
    if (game.competitionKind !== 'FRIENDLY' && game.tournamentId !== null) {
      let cached = preloaded.get(game.tournamentId);
      if (cached === undefined) {
        cached = await preload(game.tournamentId, game.competitionKind === 'LEAGUE');
        preloaded.set(game.tournamentId, cached);
      }
      const loaded =
        cached.base === null ? null : await loadGameRoster(tx, { gameId: game.gameId, sideId: side.id }, cached);
      summary = loaded === null ? null : summarizeGameRoster(loaded.computation);
      participantUserIds = loaded === null ? null : new Set(loaded.computation.participants.map((entry) => entry.userId));
    }
    result.set(game.gameId, { teamMatchId: side.game.teamMatchId, sideId: side.id, summary, participantUserIds });
  }
  return result;
}

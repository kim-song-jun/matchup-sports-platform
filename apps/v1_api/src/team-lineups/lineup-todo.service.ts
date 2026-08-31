import { Injectable } from '@nestjs/common';
import { V1GameLineupState } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
// 주차 규칙은 공용 모듈이 소유한다. 아래 private 메서드는 "DB 에서 형제 경기일을 모으는" 부분만
// 담당하므로 이름이 겹친다 — 별칭으로 구분한다.
import { resolveLeagueWeekNumbers as resolveWeekNumbersFromStartAts } from '../league-matches/league-week-number';
import { PrismaService } from '../prisma/prisma.service';

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
  source: 'TOURNAMENT_FIXTURE' | 'TEAM_MATCH';
  teamId: string;
  teamName: string;
  gameId: string;
  /**
   * 이 경기가 속한 **대회 또는 리그**. 대회 경기면 대회 id/제목, 리그 대진이면 리그
   * id/제목이 들어간다 — 어느 쪽인지는 `source` 로 갈린다.
   *
   * 리그 값을 대회 이름의 자리에 싣는 것은 이 레포의 기존 관례다
   * (public-tournament-records.service.ts `getLeagueFixtureRecord` — 같은 화면·같은 소비자가
   * 분기 없이 하나의 필드를 읽게 하려는 것). 리그 전용 필드를 새로 만들면 소비자(알림
   * 워커·홈 카드)마다 "둘 중 채워진 쪽"을 고르는 분기가 늘어난다.
   *
   * 주의: 알림 워커는 이 값을 **대회 단위 묶음의 열쇠**로도 쓴다
   * (lineup-reminder.service.ts `buildDailyMessages`). 그쪽은 `source === 'TOURNAMENT_FIXTURE'`
   * 를 함께 보고 있으므로 리그 대진은 지금도 경기 단위로 묶인다 — 그 가드를 지우면
   * 리그 대진이 리그 단위로 묶여버리니 함께 고쳐야 한다.
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
  deepLink: string;
};

/**
 * "라인업을 넣어야 하는데 아직 안 된" 경기를 찾아낸다.
 *
 * 화면(홈·마이 페이지의 할 일 카드)과 워커(일일 리마인더)가 **같은 판정을 공유**해야
 * 한다. 둘이 각자 계산하면 "알림은 왔는데 화면엔 없다" 같은 어긋남이 생기고, 그때
 * 사용자는 둘 중 뭘 믿어야 할지 알 수 없다. 그래서 판정은 여기 한 곳에만 둔다.
 *
 * 다루지 않는 것:
 * - **대진이 아직 안 잡힌 대회**. 참가가 확정돼도 상대와 시간이 정해지기 전에는 라인업을
 *   넣을 화면 자체가 없다. 재촉해봐야 할 수 있는 일이 없으므로 목록에 올리지 않는다.
 * - **이미 제출·잠긴 라인업**. 할 일이 아니다.
 * - **지나간 경기**. 킥오프가 지나면 어차피 직접 수정할 수 없다.
 */
@Injectable()
export class LineupTodoService {
  constructor(private readonly prisma: PrismaService) {}

  /** 이 사용자가 owner/manager로 있는 모든 팀의 미완료 라인업. */
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

  // ─── internals ───────────────────────────────────────────────────────────

  /**
   * 수집 경로는 하나다 — 할 일 목록도 팀 경기 목록도 여기서 나온다. 두 벌로 복사하면
   * 한쪽만 고쳐지는 순간 홈 카드와 팀 화면이 서로 다른 경기를 보여주기 시작한다.
   * 완료(DONE) 를 걸러내는 것은 **호출자의 판단**이라 여기서 하지 않는다.
   */
  private async collectWithLineupState(
    teamIds: string[] | null,
    now: Date,
  ): Promise<TeamUpcomingGame[]> {
    const [fixtures, teamMatches] = await Promise.all([
      this.loadTournamentFixtures(teamIds, now),
      this.loadTeamMatches(teamIds, now),
    ]);
    const candidates = [...fixtures, ...teamMatches];
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
      items.push({ ...rest, state: lineupState });
    }
    return items;
  }

  private async loadTournamentFixtures(teamIds: string[] | null, now: Date) {
    const fixtures = await this.prisma.v1TournamentFixture.findMany({
      where: {
        status: 'scheduled',
        scheduledAt: { gte: now },
        game: { isNot: null },
        OR: [
          { homeRegistration: this.registrationFilter(teamIds) },
          { awayRegistration: this.registrationFilter(teamIds) },
        ],
      },
      select: {
        id: true,
        round: true,
        scheduledAt: true,
        tournamentId: true,
        tournament: { select: { title: true } },
        game: { select: { id: true } },
        homeRegistration: { select: { teamId: true, team: { select: { name: true } } } },
        awayRegistration: { select: { teamId: true, team: { select: { name: true } } } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 500,
    });

    const rows: Array<Omit<LineupTodo, 'state'>> = [];
    for (const fixture of fixtures) {
      if (fixture.game === null) continue;
      for (const side of ['home', 'away'] as const) {
        const mine = side === 'home' ? fixture.homeRegistration : fixture.awayRegistration;
        const opponent = side === 'home' ? fixture.awayRegistration : fixture.homeRegistration;
        if (mine?.teamId == null) continue;
        if (teamIds !== null && !teamIds.includes(mine.teamId)) continue;
        rows.push({
          source: 'TOURNAMENT_FIXTURE',
          teamId: mine.teamId,
          teamName: mine.team.name,
          gameId: fixture.game.id,
          tournamentId: fixture.tournamentId,
          tournamentTitle: fixture.tournament.title,
          // round는 자유 문자열 표시 라벨이라 그대로 이어 붙이기만 한다.
          title: [fixture.tournament.title, fixture.round].filter(Boolean).join(' · '),
          opponentName: opponent?.team.name ?? null,
          scheduledAt: fixture.scheduledAt,
          deepLink: `/tournaments/${fixture.tournamentId}/matches/${fixture.id}/lineup`,
        });
      }
    }
    return rows;
  }

  /** 참가가 확정된 등록만 본다 — 신청서를 넣기만 한 팀에게 라인업을 재촉할 수는 없다. */
  private registrationFilter(teamIds: string[] | null) {
    return {
      is: {
        status: 'confirmed' as const,
        ...(teamIds !== null ? { teamId: { in: teamIds } } : {}),
      },
    };
  }

  private async loadTeamMatches(teamIds: string[] | null, now: Date) {
    const matches = await this.prisma.v1TeamMatch.findMany({
      where: {
        // 상대가 정해진 매치만 — 아직 모집 중이면 라인업을 짤 대상이 없다.
        status: 'matched',
        startAt: { gte: now },
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
        // 리그 제목은 관계로 가져온다 — Prisma 가 대진 목록에 딸린 리그를 id IN (...) 한 번으로
        // 모아 오므로 대진 수(최대 500)만큼 쿼리가 늘지 않는다.
        league: { select: { title: true } },
        game: { select: { id: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 500,
    });

    const weekNumberByTeamMatchId = await this.resolveLeagueWeekNumbers(matches);

    const rows: Array<Omit<LineupTodo, 'state'>> = [];
    for (const match of matches) {
      if (match.game === null) continue;
      const sides = [
        { teamId: match.hostTeamId, teamName: match.hostTeam.name, opponentName: match.approvedApplicantTeam?.name ?? null },
        {
          teamId: match.approvedApplicantTeamId,
          teamName: match.approvedApplicantTeam?.name ?? null,
          opponentName: match.hostTeam.name,
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
      const weekNumber = weekNumberByTeamMatchId.get(match.id);
      const title =
        leagueTitle === null || weekNumber === undefined ? '팀 매치' : `${leagueTitle} ${weekNumber}주차`;
      for (const side of sides) {
        if (side.teamId === null || side.teamName === null) continue;
        if (teamIds !== null && !teamIds.includes(side.teamId)) continue;
        rows.push({
          source: 'TEAM_MATCH',
          teamId: side.teamId,
          teamName: side.teamName,
          gameId: match.game.id,
          tournamentId: match.leagueId,
          tournamentTitle: leagueTitle,
          title,
          opponentName: side.opponentName,
          scheduledAt: match.startAt,
          deepLink: `/team-matches/${match.id}/lineup`,
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
        where: { gameId: { in: gameIds } },
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

import { Injectable } from '@nestjs/common';
import { V1GameLineupState } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';

/** 라인업이 아직 끝나지 않은 상태. 완료(SUBMITTED/LOCKED)는 아예 목록에 오르지 않는다. */
export type LineupTodoState = 'MISSING' | 'DRAFT';

export type LineupTodo = {
  source: 'TOURNAMENT_FIXTURE' | 'TEAM_MATCH';
  teamId: string;
  teamName: string;
  gameId: string;
  /** 대회 경기일 때만 채워진다 — 알림을 대회 단위로 묶는 열쇠이기도 하다. */
  tournamentId: string | null;
  tournamentTitle: string | null;
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

  // ─── internals ───────────────────────────────────────────────────────────

  private async collect(teamIds: string[] | null, now: Date): Promise<LineupTodo[]> {
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

    const items: LineupTodo[] = [];
    for (const candidate of candidates) {
      const state = states.get(`${candidate.gameId}:${candidate.teamId}`);
      // 제출됐거나 잠긴 라인업은 할 일이 아니다.
      if (state === 'DONE') continue;
      items.push({ ...candidate, state: state ?? 'MISSING' });
    }
    items.sort((a, b) => (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity));
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
        startAt: true,
        hostTeamId: true,
        hostTeam: { select: { name: true } },
        approvedApplicantTeamId: true,
        approvedApplicantTeam: { select: { name: true } },
        game: { select: { id: true } },
      },
      orderBy: { startAt: 'asc' },
      take: 500,
    });

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
      for (const side of sides) {
        if (side.teamId === null || side.teamName === null) continue;
        if (teamIds !== null && !teamIds.includes(side.teamId)) continue;
        rows.push({
          source: 'TEAM_MATCH',
          teamId: side.teamId,
          teamName: side.teamName,
          gameId: match.game.id,
          tournamentId: null,
          tournamentTitle: null,
          title: '팀 매치',
          opponentName: side.opponentName,
          scheduledAt: match.startAt,
          deepLink: `/team-matches/${match.id}/lineup`,
        });
      }
    }
    return rows;
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
      this.prisma.v1GameLineup.findMany({
        where: { gameId: { in: gameIds } },
        orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
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

import { Injectable, NotFoundException } from '@nestjs/common';
import { V1CompetitionKind } from '@prisma/client';
import { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { loadCompetitionRosterBase } from '../../games/roster/game-roster-loader';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_COMPETITION_KINDS, findTournamentOnSurface } from '../tournament-surface-lookup';
import { isSuspensionImminent, suspensionRulesEnabled, type SuspensionVerdict } from './card-suspension';
import { readDisciplineForUpcomingKeys, type OrderedCompetitionGame } from './suspension-verdicts';
import { loadCompetitionMatchOrder, narrowToTeamGames } from './team-game-order';

export type AdminDisciplineStatus = 'SUSPENDED' | 'IMMINENT' | 'CARDS';

export interface AdminDisciplinePlayer {
  readonly userId: string;
  readonly displayName: string;
  readonly realName?: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly status: AdminDisciplineStatus;
  readonly yellowTotal: number;
  readonly redTotal: number;
  /** 이번 판정 기준 경기를 포함한 남은 정지 경기 수. SUSPENDED 가 아니면 0. */
  readonly remainingMatches: number;
  readonly reason: string | null;
  /** 그 팀이 아직 시작하지 않은 가장 이른 경기. 남은 경기가 없으면 null — 그때는 정지·임박을 판정하지 않는다. */
  readonly nextGame: {
    readonly teamMatchId: string;
    readonly gameId: string | null;
    readonly startAt: Date | null;
    readonly opponentName: string | null;
  } | null;
}

export interface AdminDisciplineOverview {
  readonly competitionId: string;
  readonly title: string;
  readonly kind: 'TOURNAMENT' | 'LEAGUE';
  /** 정지 규정이 둘 다 꺼진 대회·리그는 null — 카드 기록은 남아도 정지가 걸리지 않는다. */
  readonly rules: { readonly yellowAccumulationLimit: number | null; readonly redCardSuspensionMatches: number | null } | null;
  readonly summary: { readonly suspended: number; readonly imminent: number; readonly withCards: number };
  readonly players: AdminDisciplinePlayer[];
}

const AFTER_LAST_GAME_KEY = '__after-last-game__';
const STATUS_RANK: Record<AdminDisciplineStatus, number> = { SUSPENDED: 0, IMMINENT: 1, CARDS: 2 };

/**
 * 대회·리그의 징계 현황 — 플랫폼 어드민(owner·ops·support) 전용 한눈 보기(MD-QA #191).
 * 판정은 경기 명단과 같은 `evaluateSuspension` 이고, 각 팀의 "다음 경기"(아직 시작하지 않은 가장 이른 경기)를 기준으로 한다.
 */
@Injectable()
export class AdminDisciplineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async overview(user: V1AuthUser, competitionId: string): Promise<AdminDisciplineOverview> {
    await this.adminContext.getActiveAdmin(user.id);
    const competition = await findTournamentOnSurface(this.prisma, ALL_COMPETITION_KINDS, {
      where: { id: competitionId },
      select: { title: true, kind: true, yellowAccumulationLimit: true, redCardSuspensionMatches: true },
    });
    if (competition === null) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }
    const isLeague = competition.kind === V1CompetitionKind.regular_league;
    const kind = isLeague ? ('LEAGUE' as const) : ('TOURNAMENT' as const);
    const rules = {
      yellowAccumulationLimit: competition.yellowAccumulationLimit,
      redCardSuspensionMatches: competition.redCardSuspensionMatches,
    };
    const base = { competitionId, title: competition.title, kind };
    if (!suspensionRulesEnabled(rules)) {
      return { ...base, rules: null, summary: { suspended: 0, imminent: 0, withCards: 0 }, players: [] };
    }

    const matches = await loadCompetitionMatchOrder(this.prisma, { competitionId, isLeague });
    const teamIds = [...new Set(matches.flatMap((row) => [row.hostTeamId, row.approvedApplicantTeamId]).filter((id): id is string => id !== null))];
    const gameIds = matches.flatMap((row) => (row.game === null ? [] : [row.game.id]));
    const [teams, games] = await Promise.all([
      this.prisma.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
      gameIds.length === 0
        ? []
        : this.prisma.v1Game.findMany({ where: { id: { in: gameIds } }, select: { id: true, state: true } }),
    ]);
    const teamName = new Map(teams.map((team) => [team.id, team.name]));
    const gameState = new Map(games.map((game) => [game.id, game.state]));
    const matchById = new Map(matches.map((row) => [row.id, row]));

    const players: AdminDisciplinePlayer[] = [];
    for (const teamId of teamIds) {
      players.push(...(await this.teamPlayers({ competitionId, isLeague, teamId, rules, matches, gameState, matchById, teamName })));
    }

    const realNames = await this.loadRealNames(players.map((player) => player.userId));
    const named = players
      .map((player) => (realNames.has(player.userId) ? { ...player, realName: realNames.get(player.userId)! } : player))
      .sort(
        (a, b) =>
          STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
          a.teamName.localeCompare(b.teamName, 'ko') ||
          a.displayName.localeCompare(b.displayName, 'ko') ||
          a.userId.localeCompare(b.userId),
      );
    return {
      ...base,
      rules,
      summary: {
        suspended: named.filter((player) => player.status === 'SUSPENDED').length,
        imminent: named.filter((player) => player.status === 'IMMINENT').length,
        withCards: named.length,
      },
      players: named,
    };
  }

  private async teamPlayers(input: {
    competitionId: string;
    isLeague: boolean;
    teamId: string;
    rules: { yellowAccumulationLimit: number | null; redCardSuspensionMatches: number | null };
    matches: Awaited<ReturnType<typeof loadCompetitionMatchOrder>>;
    gameState: ReadonlyMap<string, string>;
    matchById: ReadonlyMap<string, Awaited<ReturnType<typeof loadCompetitionMatchOrder>>[number]>;
    teamName: ReadonlyMap<string, string>;
  }): Promise<AdminDisciplinePlayer[]> {
    const { competitionId, isLeague, teamId, rules } = input;
    const rosterBase = await loadCompetitionRosterBase(this.prisma, { competitionId, isLeague, teamId });
    if (rosterBase === null) return [];
    const ordered = narrowToTeamGames(input.matches, teamId);
    const next = ordered.find((game) => game.gameId === null || input.gameState.get(game.gameId) === 'SCHEDULED');
    // 남은 경기가 없으면 시즌 끝 가상 경기를 판정 기준으로 둬서 카드 누적만 읽는다(정지·임박은 의미가 없다).
    const orderedForRead: OrderedCompetitionGame[] = next === undefined ? [...ordered, { key: AFTER_LAST_GAME_KEY, gameId: null }] : ordered;
    const upcomingKey = next?.key ?? AFTER_LAST_GAME_KEY;
    const { verdictsByUpcomingKey } = await readDisciplineForUpcomingKeys(this.prisma, {
      competitionId,
      orderedGames: orderedForRead,
      upcomingKeys: [upcomingKey],
    });
    const verdicts = verdictsByUpcomingKey.get(upcomingKey) ?? new Map<string, SuspensionVerdict>();

    const nextMatch = next === undefined ? undefined : input.matchById.get(next.key);
    const opponentId = nextMatch === undefined ? null : nextMatch.hostTeamId === teamId ? nextMatch.approvedApplicantTeamId : nextMatch.hostTeamId;
    const nextGame =
      next === undefined || nextMatch === undefined
        ? null
        : {
            teamMatchId: next.key,
            gameId: next.gameId,
            startAt: nextMatch.startAt,
            opponentName: opponentId === null ? null : (input.teamName.get(opponentId) ?? null),
          };

    return rosterBase.entries.flatMap((entry) => {
      const verdict = verdicts.get(entry.userId);
      if (verdict === undefined || !entry.accountLinked) return [];
      const suspended = nextGame !== null && verdict.suspended;
      const imminent = nextGame !== null && !verdict.suspended && isSuspensionImminent(rules, verdict.yellowTotal);
      if (!suspended && !imminent && verdict.yellowTotal === 0 && verdict.redTotal === 0) return [];
      return [
        {
          userId: entry.userId,
          displayName: entry.displayNameSnapshot,
          teamId,
          teamName: input.teamName.get(teamId) ?? '팀',
          status: suspended ? ('SUSPENDED' as const) : imminent ? ('IMMINENT' as const) : ('CARDS' as const),
          yellowTotal: verdict.yellowTotal,
          redTotal: verdict.redTotal,
          remainingMatches: suspended ? verdict.remainingMatches : 0,
          reason: suspended ? verdict.reason : null,
          nextGame,
        },
      ];
    });
  }

  private async loadRealNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.v1User.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, profile: { select: { realName: true } } },
    });
    return new Map(
      users.flatMap((row) => {
        const realName = row.profile?.realName?.trim();
        return realName ? [[row.id, realName] as [string, string]] : [];
      }),
    );
  }
}

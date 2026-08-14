import { Injectable } from '@nestjs/common';
import { V1GameSourceType } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { parseLineupCatalog } from '../tournaments/competition-config/competition-config.parse';
import { assertTeamLineupManager } from './team-lineup-access';

/** 훑을 사이드의 상한. 팀이 아무리 오래 활동해도 최근 것 말고는 불러올 일이 없고,
 * 상한이 없으면 활동이 많은 팀에서 쿼리가 무한정 커진다. */
const SIDE_SCAN_LIMIT = 200;

type HistoryParticipant = {
  userId: string | null;
  displayName: string;
  jerseyNumber: number | null;
  position: string | null;
  positionX: number | null;
  positionY: number | null;
  started: boolean;
  goalkeeper: boolean;
};

export type TeamLineupHistoryItem = {
  lineupId: string;
  gameId: string;
  source: V1GameSourceType;
  sourceLabel: string;
  opponentName: string | null;
  playedAt: Date | null;
  sportName: string | null;
  formation: string | null;
  starterCount: number;
  benchCount: number;
  participants: HistoryParticipant[];
};

/**
 * 팀이 과거에 낸 라인업을 팀 스코프로 모아 돌려준다 — 대회 경기와 팀 매치를 가로지른다.
 *
 * 교차 조회가 가능한 이유는 `V1GameSide.teamId`가 두 경로 모두에서 채워지기 때문이다.
 * 반대로 이 컬럼으로 좁히기 때문에 **상대팀 사이드는 결과에 들어올 수조차 없다** — 킥오프
 * 전에 상대 전술을 미리 볼 수 없다는 기존 원칙(GamesService.listLineups의 ownSideId 제한)이
 * 여기서도 쿼리 구조 자체로 지켜진다.
 */
@Injectable()
export class TeamLineupHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: V1AuthUser, teamId: string, limit: number): Promise<{ items: TeamLineupHistoryItem[] }> {
    await assertTeamLineupManager(this.prisma, teamId, user.id);

    const sides = await this.prisma.v1GameSide.findMany({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      take: SIDE_SCAN_LIMIT,
      select: { id: true, gameId: true },
    });
    if (sides.length === 0) {
      return { items: [] };
    }

    // 사이드마다 최신 revision 하나씩만 쓴다. `distinct`가 이 정렬(사이드별 revision
    // 내림차순)의 첫 행만 남기므로, 라인업을 여러 번 고쳐 저장한 팀이라도 가져오는 양이
    // 사이드 수를 넘지 않는다 — 예전에는 전 revision을 받아 메모리에서 골라냈고, 그러면
    // 팀이 오래 활동할수록 전송량이 함께 자랐다(Copilot 리뷰 지적).
    const lineups = await this.prisma.v1GameLineup.findMany({
      where: { sideId: { in: sides.map((side) => side.id) } },
      orderBy: [{ sideId: 'asc' }, { revision: 'desc' }],
      distinct: ['sideId'],
      select: { id: true, gameId: true, sideId: true, formation: true },
    });
    const latestBySideId = new Map<string, (typeof lineups)[number]>();
    for (const lineup of lineups) {
      if (!latestBySideId.has(lineup.sideId)) latestBySideId.set(lineup.sideId, lineup);
    }
    if (latestBySideId.size === 0) {
      return { items: [] };
    }

    const [participants, games] = await Promise.all([
      this.prisma.v1GameParticipant.findMany({
        where: { lineupId: { in: [...latestBySideId.values()].map((lineup) => lineup.id) } },
        orderBy: [{ started: 'desc' }, { jerseyNumber: 'asc' }, { createdAt: 'asc' }],
        select: {
          lineupId: true,
          userId: true,
          displayNameSnapshot: true,
          jerseyNumber: true,
          position: true,
          positionX: true,
          positionY: true,
          started: true,
        },
      }),
      this.prisma.v1Game.findMany({
        where: { id: { in: [...new Set([...latestBySideId.values()].map((lineup) => lineup.gameId))] } },
        select: {
          id: true,
          sourceType: true,
          competitionConfigVersionId: true,
          teamMatch: { select: { startAt: true, sport: { select: { name: true } } } },
          tournamentFixture: {
            select: {
              round: true,
              scheduledAt: true,
              tournament: { select: { title: true, sport: { select: { name: true } } } },
            },
          },
          sides: { select: { id: true, teamId: true, displayNameSnapshot: true } },
        },
      }),
    ]);

    const participantsByLineupId = new Map<string, typeof participants>();
    for (const participant of participants) {
      const bucket = participantsByLineupId.get(participant.lineupId);
      if (bucket === undefined) participantsByLineupId.set(participant.lineupId, [participant]);
      else bucket.push(participant);
    }

    const gamesById = new Map(games.map((game) => [game.id, game]));
    const goalkeeperCodeByConfigId = await this.loadGoalkeeperCodes(
      games.map((game) => game.competitionConfigVersionId),
    );

    const items: TeamLineupHistoryItem[] = [];
    for (const lineup of latestBySideId.values()) {
      const game = gamesById.get(lineup.gameId);
      if (game === undefined) continue;
      const rows = participantsByLineupId.get(lineup.id) ?? [];
      // 참가자가 없는 라인업은 목록에 올리지 않는다 — 불러와도 얻을 게 없는 빈 초안이다.
      if (rows.length === 0) continue;

      const goalkeeperCode = goalkeeperCodeByConfigId.get(game.competitionConfigVersionId) ?? 'GK';
      const opponent = game.sides.find((side) => side.id !== lineup.sideId) ?? null;
      const isTournament = game.sourceType === V1GameSourceType.TOURNAMENT_FIXTURE;
      const tournamentName = game.tournamentFixture?.tournament.title ?? null;
      // round는 자유 문자열 표시 라벨이고 한글·영문이 섞여 저장돼 있다("8강", "Round 1").
      // 파싱하거나 순서를 추론하지 않고 그대로 이어 붙이기만 한다.
      const round = game.tournamentFixture?.round ?? null;

      items.push({
        lineupId: lineup.id,
        gameId: lineup.gameId,
        source: game.sourceType,
        sourceLabel: isTournament
          ? [tournamentName, round].filter((part): part is string => Boolean(part)).join(' · ') || '대회 경기'
          : '팀 매치',
        opponentName: opponent?.displayNameSnapshot ?? null,
        playedAt: isTournament ? game.tournamentFixture?.scheduledAt ?? null : game.teamMatch?.startAt ?? null,
        // 종목은 두 경로 모두에서 알아낼 수 있다 — 목록에서 "지금 화면과 다른 종목"에
        // 경고 배지를 붙이려면 팀 매치 쪽도 채워져 있어야 한다.
        sportName: isTournament
          ? game.tournamentFixture?.tournament.sport?.name ?? null
          : game.teamMatch?.sport?.name ?? null,
        formation: lineup.formation,
        starterCount: rows.filter((row) => row.started).length,
        benchCount: rows.filter((row) => !row.started).length,
        participants: rows.map((row) => ({
          userId: row.userId,
          displayName: row.displayNameSnapshot,
          jerseyNumber: row.jerseyNumber,
          // 골키퍼는 종목마다 다른 코드로 저장돼 있다(축구 'GK', 풋살 'GOLEIRO').
          // 클라이언트가 종목 사전을 다시 해석하지 않도록 여기서 boolean으로 풀어 준다.
          goalkeeper: row.position === goalkeeperCode,
          position: row.position === goalkeeperCode ? null : row.position,
          positionX: row.positionX,
          positionY: row.positionY,
          started: row.started,
        })),
      });
    }

    // 일시를 모르는 경기(대회 픽스처의 scheduledAt이 아직 비어 있는 경우)는 뒤로 보낸다.
    items.sort((a, b) => (b.playedAt?.getTime() ?? -Infinity) - (a.playedAt?.getTime() ?? -Infinity));
    return { items: items.slice(0, limit) };
  }

  /** 경기마다 골키퍼 포지션 코드를 구한다 — 종목 사전(positions)에 goalkeeper:true로
   * 표시된 항목의 코드다. 사전이 없거나 표시가 빠진 방어적 상황에서는 프론트
   * (formation-slots.ts#goalkeeperPositionCode)와 동일하게 'GK'로 폴백한다. */
  private async loadGoalkeeperCodes(configVersionIds: string[]): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(configVersionIds)];
    if (uniqueIds.length === 0) return new Map();
    const configs = await this.prisma.v1CompetitionConfigVersion.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, lineup: true },
    });
    return new Map(
      configs.map((config) => {
        const positions = parseLineupCatalog(config.lineup).positions;
        return [config.id, positions.find((position) => position.goalkeeper === true)?.code ?? 'GK'];
      }),
    );
  }
}

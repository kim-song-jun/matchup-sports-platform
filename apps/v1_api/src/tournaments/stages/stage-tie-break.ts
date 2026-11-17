import type { Prisma } from '@prisma/client';
import { assertValidTieBreakOrder, resolveStageTieBreakOrder, resolveTieBreakOrder, type TieBreakOrder } from '../competition-config/tournament-tie-break-order';
import type { StoredStagePlan } from './stage-view';

/** 단계 하나의 동점 순서 상태(MD-QA #186). `order` null = 대회 설정을 따른다. */
export type StageTieBreakStageView = {
  stageKey: string;
  stageName: string;
  /** 풀리그 편성이 있는 단계만 순위를 매긴다. 토너먼트만 있는 단계는 동점 순서가 없다. */
  ranked: boolean;
  order: TieBreakOrder | null;
  resolvedOrder: TieBreakOrder;
  lockedReason: string | null;
};

export type StageTieBreakView = { tournamentOrder: TieBreakOrder; stages: StageTieBreakStageView[] };

export const STAGE_TIE_BREAK_LOCKED_MESSAGE = '이 단계 경기 결과가 확정돼서 바꿀 수 없어요.';

type Client = Pick<Prisma.TransactionClient, 'v1TournamentStageTieBreakSetting' | 'v1TournamentMatchDetails'>;

const OFFICIAL_TEAM_MATCH = { is: { deletedAt: null, game: { is: { currentOfficialRevision: { is: { state: 'OFFICIAL' as const } } } } } };

/** 조별 경기(phase=group)에 공식 결과가 하나라도 있는 단계 키. */
export async function stageKeysWithOfficialResults(client: Pick<Prisma.TransactionClient, 'v1TournamentMatchDetails'>, tournamentId: string): Promise<Set<string>> {
  const rows = await client.v1TournamentMatchDetails.findMany({
    where: { tournamentId, group: { is: { phase: 'group', stageKey: { not: null } } }, teamMatch: OFFICIAL_TEAM_MATCH },
    select: { group: { select: { stageKey: true } } },
    distinct: ['groupId'],
  });
  return new Set(rows.flatMap((row) => (row.group?.stageKey ? [row.group.stageKey] : [])));
}

export async function loadStageTieBreakView(
  client: Client,
  tournament: { id: string; stagePlan: Prisma.JsonValue | null; tieBreakOrder: Prisma.JsonValue | null },
): Promise<StageTieBreakView> {
  const plan = tournament.stagePlan as unknown as StoredStagePlan | null;
  const rows = await client.v1TournamentStageTieBreakSetting.findMany({ where: { tournamentId: tournament.id }, select: { stageKey: true, order: true } });
  const own = new Map(rows.map((row) => [row.stageKey, assertValidTieBreakOrder(row.order)]));
  const locked = await stageKeysWithOfficialResults(client, tournament.id);
  return {
    tournamentOrder: resolveTieBreakOrder(tournament.tieBreakOrder),
    stages: (plan?.stages ?? []).map((stage) => {
      const order = own.get(stage.key) ?? null;
      return {
        stageKey: stage.key,
        stageName: stage.name,
        ranked: stage.pools.some((pool) => pool.format === 'league'),
        order,
        resolvedOrder: resolveStageTieBreakOrder(tournament.tieBreakOrder, order),
        lockedReason: locked.has(stage.key) ? STAGE_TIE_BREAK_LOCKED_MESSAGE : null,
      };
    }),
  };
}

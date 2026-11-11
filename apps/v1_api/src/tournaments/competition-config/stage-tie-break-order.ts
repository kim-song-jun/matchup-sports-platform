import type { Prisma } from '@prisma/client';
import type { CompetitionConfig } from './competition-config.types';
import { assertValidTieBreakOrder, resolveStageTieBreakOrder, type TieBreakOrder } from './tournament-tie-break-order';

/**
 * 조별리그 단계별 동점 순서(MD-QA #186). 해석 순서는 단계 행 → 대회 `tieBreakOrder` → 플랫폼 기본값이다.
 * 저장 순위 계산·자동 반영·순위 미리보기·12강 교차 비교·공개 응답이 모두 이 파일을 거쳐 같은 순서를 쓴다.
 */
export type StageTieBreakOrders = ReadonlyMap<string, TieBreakOrder>;

/**
 * 이 대회에서 따로 정한 단계만 담는다. 행이 없는 단계는 대회 설정을 따른다.
 * `stageKeys` 를 주면 그중 단계 키가 하나도 없을 때(단계형이 아닌 대회) 조회를 건너뛴다.
 */
export async function loadStageTieBreakOrders(
  client: Pick<Prisma.TransactionClient, 'v1TournamentStageTieBreakSetting'>,
  tournamentId: string,
  stageKeys?: Iterable<string | null | undefined>,
): Promise<StageTieBreakOrders> {
  if (stageKeys !== undefined && ![...stageKeys].some(Boolean)) return new Map();
  const rows = await client.v1TournamentStageTieBreakSetting.findMany({
    where: { tournamentId },
    select: { stageKey: true, order: true },
  });
  return new Map(rows.map((row) => [row.stageKey, assertValidTieBreakOrder(row.order)]));
}

/** 단계 행이 있는 조만 그 순서를 돌려준다(없으면 undefined — 호출자가 대회 설정을 쓴다). */
export function stageTieBreakOverride(stageOrders: StageTieBreakOrders, stageKey: string | null | undefined): TieBreakOrder | undefined {
  return stageKey ? stageOrders.get(stageKey) : undefined;
}

/** 조 하나의 계산 규칙: 대회 설정이 이미 반영된 `config` 위에 단계 순서를 덮는다. */
export function withStageTieBreakOrder(config: CompetitionConfig, order: TieBreakOrder | undefined): CompetitionConfig {
  return order === undefined ? config : { ...config, tieBreak: { ...config.tieBreak, order } };
}

/** 조의 단계에서 실제로 쓰는 순서(공개 응답·미리보기용). */
export function resolvedOrderForStage(tournamentStored: unknown, stageOrders: StageTieBreakOrders, stageKey: string | null | undefined): TieBreakOrder {
  return resolveStageTieBreakOrder(tournamentStored, stageTieBreakOverride(stageOrders, stageKey));
}

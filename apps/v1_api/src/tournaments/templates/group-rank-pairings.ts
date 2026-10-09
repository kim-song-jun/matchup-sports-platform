// apps/v1_api/src/tournaments/templates/group-rank-pairings.ts
import { UnprocessableEntityException } from '@nestjs/common';

/** group: 0부터(A=0), rank: 1부터(1위=1). */
export type GroupRankRef = { group: number; rank: number };

// 표기 "A1" = A조 1위. 스펙 S2 의 교차 대진 — 같은 조 두 팀이 결선 첫 경기에서 다시 만나지 않는다.
const PAIRINGS: Readonly<Record<string, ReadonlyArray<readonly [string, string]>>> = {
  '2x1': [['A1', 'B1']],
  '2x2': [['A1', 'B2'], ['B1', 'A2']],
  '4x1': [['A1', 'D1'], ['B1', 'C1']],
  '4x2': [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']],
  '8x1': [['A1', 'H1'], ['D1', 'E1'], ['B1', 'G1'], ['C1', 'F1']],
  '8x2': [
    ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
    ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
  ],
};

export const MAX_GROUP_RANK_SLOTS = Math.max(...Object.values(PAIRINGS).map((pairs) => pairs.length * 2));

function parseRef(text: string): GroupRankRef {
  return { group: text.charCodeAt(0) - 65, rank: Number(text.slice(1)) };
}

/** 결선 첫 라운드 경기 순서대로 [홈 자리, 어웨이 자리]. 표에 없는 조합(결선 크기 ∉ {2,4,8,16})은 422. */
export function groupRankPairings(
  groupCount: number,
  advancePerGroup: 1 | 2,
): Array<[GroupRankRef, GroupRankRef]> {
  const pairs = PAIRINGS[`${groupCount}x${advancePerGroup}`];
  if (pairs === undefined) {
    throw new UnprocessableEntityException({
      code: 'BRACKET_TEMPLATE_UNSUPPORTED',
      message: '결선은 2·4·8·16팀이 올라가는 조합만 만들 수 있어요. 조 수와 진출 팀 수를 다시 골라 주세요.',
    });
  }
  return pairs.map(([home, away]) => [parseRef(home), parseRef(away)]);
}

import { UnprocessableEntityException } from '@nestjs/common';

export function planLeagueConversion<T extends { teamId: string }>(rows: readonly T[], sizes: readonly number[], ties: readonly { teamIds: string[] }[]) {
  if (sizes.length < 1 || sizes.length > 3 || sizes.some((n) => !Number.isInteger(n) || n < 2) || sizes.reduce((a, b) => a + b, 0) !== rows.length) {
    throw new UnprocessableEntityException({ code: 'LEAGUE_CONVERSION_SIZES_INVALID', message: '각 티어에 2팀 이상, 모든 참가팀을 한 번씩 배정해 주세요.' });
  }
  let offset = 0;
  const entries = sizes.flatMap((size, index) => {
    const result = rows.slice(offset, offset + size).map((row) => ({ ...row, suggestedTier: index + 1 }));
    offset += size;
    return result;
  });
  const tiers = new Map(entries.map((row) => [row.teamId, row.suggestedTier]));
  const boundaryTies = ties.filter((group) => new Set(group.teamIds.map((id) => tiers.get(id))).size > 1);
  return { entries, boundaryTies };
}

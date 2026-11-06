import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';

export function validateLeagueConversionEntries(
  plan: {
    entries: readonly { teamId: string; suggestedTier: number }[];
    boundaryTies: readonly { teamIds: string[] }[];
  },
  entries: readonly { teamId: string; tier: number; reason?: string }[],
  tierSizes: readonly number[],
): void {
  const byId = new Map(entries.map((entry) => [entry.teamId, entry]));
  const hasWrongTeamCount = entries.length !== plan.entries.length;
  const hasDuplicateTeams = byId.size !== entries.length;
  const hasMissingTeams = plan.entries.some((entry) => !byId.has(entry.teamId));
  const hasInvalidTier = entries.some((entry) => entry.tier < 1 || entry.tier > tierSizes.length);
  const hasWrongTierCounts = tierSizes.some(
    (size, i) => entries.filter((entry) => entry.tier === i + 1).length !== size,
  );
  if (hasWrongTeamCount || hasDuplicateTeams || hasMissingTeams || hasInvalidTier || hasWrongTierCounts) {
    throw new BadRequestException({
      code: 'LEAGUE_CONVERSION_ENTRIES_INVALID',
      message: '모든 팀을 지정한 티어별 인원에 맞게 한 번씩 배정해 주세요.',
    });
  }
  const tied = new Set(plan.boundaryTies.flatMap((group) => group.teamIds));
  const hasMissingReasons = plan.entries.some((entry) => {
    const chosen = byId.get(entry.teamId)!;
    const requiresReason = chosen.tier !== entry.suggestedTier || tied.has(entry.teamId);
    return requiresReason && !chosen.reason?.trim();
  });
  if (hasMissingReasons) {
    throw new BadRequestException({
      code: 'LEAGUE_CONVERSION_REASON_REQUIRED',
      message: '배정을 바꾸거나 동률 팀의 티어를 결정할 때는 사유를 입력해 주세요.',
    });
  }
}

export function planLeagueConversion<T extends { teamId: string }>(
  rows: readonly T[],
  sizes: readonly number[],
  ties: readonly { teamIds: string[] }[],
) {
  if (
    sizes.length < 1 ||
    sizes.length > 3 ||
    sizes.some((n) => !Number.isInteger(n) || n < 2) ||
    sizes.reduce((a, b) => a + b, 0) !== rows.length
  ) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_CONVERSION_SIZES_INVALID',
      message: '각 티어에 2팀 이상, 모든 참가팀을 한 번씩 배정해 주세요.',
    });
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

import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { loadGroupRankPreview } from './load-group-rank-preview';

type BracketTrack = 'upper' | 'lower';

function rankEligibilityError(code: 'BRACKET_TRACK_RANK_MISMATCH' | 'BRACKET_TRACK_RANK_UNRESOLVED', message: string) {
  return new ConflictException({ code, message });
}

/**
 * Require a tracked knockout participant to be an actual rank candidate for that
 * group and track. Candidate and tie resolution are sourced from the same
 * official-result/standings resolver used by the standings preview.
 */
export async function assertBracketTrackRegistrationEligible(
  tx: Prisma.TransactionClient,
  input: { tournamentId: string; groupId: string; bracketTrack: BracketTrack; registrationId: string; slotId?: string },
): Promise<void> {
  const preview = await loadGroupRankPreview(tx, input.tournamentId);
  // GROUP_RANK slots live in the first knockout phase. Later rounds have no
  // rank slots of their own, so eligibility follows the same track-wide seed
  // candidates when a team is manually placed into a later phase.
  const rankStart = input.bracketTrack === 'upper' ? 1 : 3;
  const rankEnd = rankStart + 1;
  const trackRows = preview.rows.filter((row) =>
    input.slotId !== undefined
      ? row.slotId === input.slotId && row.bracketTrack === input.bracketTrack && row.position >= rankStart && row.position <= rankEnd
      : row.bracketTrack === input.bracketTrack && row.position >= rankStart && row.position <= rankEnd,
  );
  if (trackRows.length === 0) {
    throw rankEligibilityError('BRACKET_TRACK_RANK_MISMATCH', '상·하위 결선 자리는 조별 순위 자리로만 채울 수 있어요.');
  }

  const isEligible = trackRows.some((row) =>
    row.state === 'ready'
      ? row.candidateRegistrationId === input.registrationId
      : row.state === 'tied' && row.tiedRegistrationIds.includes(input.registrationId),
  );
  if (isEligible) {
    await assertNotAlreadyOnOtherTrack(tx, input);
    return;
  }

  const unresolvedMember = trackRows.some(
    (row) => row.state === 'group_incomplete' && preview.groupMembers.get(row.slotId)?.has(input.registrationId),
  );
  if (unresolvedMember) {
    throw rankEligibilityError('BRACKET_TRACK_RANK_UNRESOLVED', '조별 경기가 끝나고 순위가 확정된 뒤 결선에 편성할 수 있어요.');
  }
  throw rankEligibilityError('BRACKET_TRACK_RANK_MISMATCH', '해당 팀의 조별 순위와 상·하위 결선이 맞지 않아요.');
}

async function assertNotAlreadyOnOtherTrack(
  tx: Prisma.TransactionClient,
  input: { tournamentId: string; groupId: string; bracketTrack: BracketTrack; registrationId: string },
): Promise<void> {
  const [groupTeams, fixtures] = await Promise.all([
    tx.v1TournamentGroupTeam.findMany({
      where: {
        registrationId: input.registrationId,
        group: { tournamentId: input.tournamentId, phase: { not: 'group' }, bracketTrack: { in: ['upper', 'lower'] } },
      },
      select: { groupId: true, group: { select: { bracketTrack: true } } },
    }),
    tx.v1TournamentMatchDetails.findMany({
      where: {
        tournamentId: input.tournamentId,
        OR: [{ homeRegistrationId: input.registrationId }, { awayRegistrationId: input.registrationId }],
        group: { is: { phase: { not: 'group' }, bracketTrack: { in: ['upper', 'lower'] } } },
        teamMatch: { is: { deletedAt: null, status: { notIn: ['cancelled', 'archived'] } } },
      },
      select: { groupId: true, group: { select: { bracketTrack: true } } },
    }),
  ]);
  const otherTrack = [...groupTeams, ...fixtures].some(
    (row) => row.groupId !== input.groupId && row.group?.bracketTrack !== undefined && row.group.bracketTrack !== input.bracketTrack,
  );
  if (otherTrack) {
    throw rankEligibilityError('BRACKET_TRACK_RANK_MISMATCH', '한 팀을 상위·하위 결선에 동시에 편성할 수 없어요.');
  }
}

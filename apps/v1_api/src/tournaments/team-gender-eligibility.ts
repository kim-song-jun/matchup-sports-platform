import { ConflictException } from '@nestjs/common';
import type { Prisma, V1TournamentGenderCategory } from '@prisma/client';
import { genderRequiredByCategory } from './tournament-players.service';

export const TEAM_GENDER_INELIGIBLE_CODE = 'TEAM_GENDER_INELIGIBLE';

export type DivisionGender = 'male' | 'female';

export type TeamGenderBlocker = { readonly requiredGender: DivisionGender };

/**
 * A male/female division takes only teams with at least one active member of that gender.
 * Mixed and unset divisions have no team-level requirement. Members without a profile gender never count.
 * The roster gate (`PLAYER_GENDER_MISMATCH`) still decides each player; this only keeps a team with nobody
 * eligible out of the division before it submits, pays or gets confirmed.
 */
export async function findTeamGenderBlocker(
  db: Pick<Prisma.TransactionClient, 'v1TeamMembership'>,
  input: { teamId: string; genderCategory: V1TournamentGenderCategory | null },
): Promise<TeamGenderBlocker | null> {
  const requiredGender = genderRequiredByCategory(input.genderCategory);
  if (requiredGender === null) return null;
  const eligibleMembers = await db.v1TeamMembership.count({
    where: { teamId: input.teamId, status: 'active', user: { profile: { gender: requiredGender } } },
  });
  return eligibleMembers > 0 ? null : { requiredGender };
}

/** `verb` is 신청 for the applying team and 참가 for operator actions (confirm, add). */
export function teamGenderBlockerMessage(
  blocker: TeamGenderBlocker,
  noun: '대회' | '리그',
  verb: '신청' | '참가',
): string {
  return blocker.requiredGender === 'female'
    ? `여성부 ${noun}에는 여성 팀원이 있는 팀만 ${verb}할 수 있어요.`
    : `남성부 ${noun}에는 남성 팀원이 있는 팀만 ${verb}할 수 있어요.`;
}

export async function assertTeamGenderEligible(
  db: Pick<Prisma.TransactionClient, 'v1TeamMembership'>,
  input: {
    teamId: string;
    genderCategory: V1TournamentGenderCategory | null;
    noun: '대회' | '리그';
    verb: '신청' | '참가';
  },
): Promise<void> {
  const blocker = await findTeamGenderBlocker(db, input);
  if (blocker !== null) {
    throw new ConflictException({
      code: TEAM_GENDER_INELIGIBLE_CODE,
      message: teamGenderBlockerMessage(blocker, input.noun, input.verb),
    });
  }
}

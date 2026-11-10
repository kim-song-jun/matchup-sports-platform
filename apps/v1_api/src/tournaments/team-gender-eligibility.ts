import { ConflictException } from '@nestjs/common';
import type { Prisma, V1TournamentGenderCategory } from '@prisma/client';
import { normalizeGenderRule, type GenderRule } from '../common/gender-rule';
import { genderRequiredByCategory } from './tournament-players.service';

export const TEAM_GENDER_INELIGIBLE_CODE = 'TEAM_GENDER_INELIGIBLE';

export type DivisionGender = 'male' | 'female';

export type TeamGenderBlocker = { readonly requiredGender: DivisionGender };

/** The team gender setting (`V1TeamProfile.genderRule`) that says "this is a team of that gender". */
const TEAM_GENDER_RULE_BY_DIVISION: Record<DivisionGender, GenderRule> = { male: '남', female: '여' };

/** True only when the team setting names the division's gender; "성별 무관", unset and the other gender do not. */
export function teamGenderRuleMatchesDivision(rule: string | null | undefined, division: DivisionGender): boolean {
  return normalizeGenderRule(rule) === TEAM_GENDER_RULE_BY_DIVISION[division];
}

/**
 * A male/female division takes a team that either has at least one active member of that gender or is set to
 * that gender itself (`teamGenderRuleMatchesDivision`). Mixed and unset divisions have no team-level requirement.
 * Members without a profile gender never count, so the team setting is what lets a team whose members left the
 * profile gender empty in. The roster gate (`PLAYER_GENDER_MISMATCH`) still decides each player; this only keeps
 * a team with nobody eligible and no matching team setting out of the division before it submits, pays or gets
 * confirmed.
 */
export async function findTeamGenderBlocker(
  db: Pick<Prisma.TransactionClient, 'v1TeamMembership' | 'v1TeamProfile'>,
  input: { teamId: string; genderCategory: V1TournamentGenderCategory | null },
): Promise<TeamGenderBlocker | null> {
  const requiredGender = genderRequiredByCategory(input.genderCategory);
  if (requiredGender === null) return null;
  const eligibleMembers = await db.v1TeamMembership.count({
    where: { teamId: input.teamId, status: 'active', user: { profile: { gender: requiredGender } } },
  });
  if (eligibleMembers > 0) return null;
  const teamProfile = await db.v1TeamProfile.findUnique({
    where: { teamId: input.teamId },
    select: { genderRule: true },
  });
  return teamGenderRuleMatchesDivision(teamProfile?.genderRule, requiredGender) ? null : { requiredGender };
}

/** `verb` is 신청 for the applying team and 참가 for operator actions (confirm, add). */
export function teamGenderBlockerMessage(
  blocker: TeamGenderBlocker,
  noun: '대회' | '리그',
  verb: '신청' | '참가',
): string {
  const gender = blocker.requiredGender === 'female' ? '여성' : '남성';
  return `${gender}부 ${noun}는 팀 성별이 ${gender}이거나 프로필 성별이 ${gender}인 팀원이 있는 팀만 ${verb}할 수 있어요.`;
}

export async function assertTeamGenderEligible(
  db: Pick<Prisma.TransactionClient, 'v1TeamMembership' | 'v1TeamProfile'>,
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

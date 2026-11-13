import { ConflictException } from '@nestjs/common';
import type { Prisma, V1TournamentGenderCategory } from '@prisma/client';
import { normalizeGenderRule } from '../common/gender-rule';
import { genderRequiredByCategory } from './tournament-players.service';

export const TEAM_GENDER_INELIGIBLE_CODE = 'TEAM_GENDER_INELIGIBLE';

export type DivisionGender = 'male' | 'female';

export type TeamGenderBlocker = { readonly requiredGender: DivisionGender | null };

/** Team settings alone decide admission; player eligibility is checked separately on roster writes. */
export async function findTeamGenderBlocker(
  db: Pick<Prisma.TransactionClient, 'v1TeamProfile'>,
  input: { teamId: string; genderCategory: V1TournamentGenderCategory | null },
): Promise<TeamGenderBlocker | null> {
  const teamProfile = await db.v1TeamProfile.findUnique({
    where: { teamId: input.teamId },
    select: { genderRule: true },
  });
  const rule = normalizeGenderRule(teamProfile?.genderRule);
  if (rule === null) return { requiredGender: null };
  const requiredGender = genderRequiredByCategory(input.genderCategory);
  if ((requiredGender === 'male' && rule === '여') || (requiredGender === 'female' && rule === '남')) {
    return { requiredGender };
  }
  return null;
}

/** `verb` is 신청 for the applying team and 참가 for operator actions (confirm, add). */
export function teamGenderBlockerMessage(
  blocker: TeamGenderBlocker,
  noun: '대회' | '리그',
  verb: '신청' | '참가',
): string {
  if (blocker.requiredGender === null) {
    return `팀 성별을 설정한 뒤 ${noun}에 ${verb}할 수 있어요. 팀 설정에서 성별을 선택해 주세요.`;
  }
  const gender = blocker.requiredGender === 'female' ? '여성' : '남성';
  const opposite = blocker.requiredGender === 'female' ? '남성' : '여성';
  return `${gender}부 ${noun}에는 ${opposite}팀이 ${verb}할 수 없어요.`;
}

export async function assertTeamGenderEligible(
  db: Pick<Prisma.TransactionClient, 'v1TeamProfile'>,
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

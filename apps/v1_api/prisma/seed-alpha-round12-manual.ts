import { Prisma } from '@prisma/client';

export const ALPHA_ROUND12_MANUAL_ID = 'ad120000-0000-4000-8000-000000000001';
export const ALPHA_ROUND12_MANUAL_TITLE = '(테스트) 12팀·팀당 5명 대진 직접 입력';

/** Create once; later deployments must preserve every operator edit and fixture. */
export async function seedAlphaRound12Manual(
  tx: Prisma.TransactionClient,
  input: { sportId: string; regionId: string; adminId: string; competitionConfigVersionId: string; now: Date },
) {
  if (process.env.V1_ALPHA_QA_SEED !== 'true' || process.env.V1_ALPHA_QA_ORIGIN !== 'https://alpha.teameet.co.kr') {
    throw new Error('Manual round12 fixture requires the guarded alpha QA seed entrypoint.');
  }
  const existing = await tx.v1Tournament.findUnique({ where: { id: ALPHA_ROUND12_MANUAL_ID }, select: { id: true } });
  if (existing) return { tournamentId: existing.id, created: false, preserved: true };
  // These are the synthetic accounts created by seedAlphaQaSquads immediately
  // before this function. Reuse QA accounts, never real members or their identity.
  const ids = Array.from({ length: 6 }, (_, teamIndex) => Array.from({ length: 10 }, (_, playerIndex) =>
    `ac200000-0000-4000-8000-${`${String(teamIndex + 1).padStart(2, '0')}${String(playerIndex + 1).padStart(2, '0')}`.padStart(12, '0')}`)).flat();
  const players = await tx.v1User.findMany({
    where: { id: { in: ids }, accountStatus: 'active', deletedAt: null, email: { startsWith: 'alpha.qa.t' } },
    select: { id: true, profile: { select: { realName: true, nickname: true, birthDate: true, gender: true } } }, orderBy: { id: 'asc' },
  });
  if (players.length !== 60 || players.some((player) => !player.profile)) throw new Error('Manual round12 fixture needs all 60 synthetic QA players; no partial tournament was created.');
  const start = new Date(input.now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await tx.v1Tournament.create({ data: {
    id: ALPHA_ROUND12_MANUAL_ID, title: ALPHA_ROUND12_MANUAL_TITLE, sportId: input.sportId, regionId: input.regionId,
    kind: 'regular_tournament', format: 'group_knockout', status: 'closed', competitionConfigVersionId: input.competitionConfigVersionId,
    teamCount: 12, minPlayers: 5, maxPlayers: 5, genderCategory: 'mixed', entryFee: 0,
    scheduledAt: start, scheduledEndAt: new Date(start.getTime() + 8 * 60 * 60 * 1000),
    registrationDeadlineAt: new Date(input.now.getTime() - 60 * 60 * 1000), rosterDeadlineAt: new Date(start.getTime() - 24 * 60 * 60 * 1000),
    bracketPublishedAt: null, venue: '(테스트) 서울 풋살장', coverImageUrl: '/mock/generated/futsal-rooftop.webp',
    rulesText: 'ALPHA 테스트 대회입니다. 12팀 × 선수 5명 신청 확정. 조·부전승·경기는 관리자 대진관리에서 직접 입력하세요.',
    refundPolicyText: '무료 테스트 대회이며 실제 결제와 환불은 없습니다.', createdByAdminUserId: input.adminId,
  } });
  for (let teamIndex = 0; teamIndex < 12; teamIndex += 1) {
    const members = players.slice(teamIndex * 5, teamIndex * 5 + 5);
    const teamId = `ad121000-0000-4000-8000-${String(teamIndex + 1).padStart(12, '0')}`;
    const captain = members[0];
    await tx.v1Team.create({ data: {
      id: teamId, name: `(테스트) 12강 연습 ${String(teamIndex + 1).padStart(2, '0')}팀`, ownerUserId: captain.id,
      sportId: input.sportId, regionId: input.regionId, status: 'active', joinPolicy: 'closed', membersVisible: true, memberCount: 5,
      profile: { create: { description: 'ALPHA 대진 입력 연습용 가상 팀입니다.', logoUrl: `/images/team-logos/team-logo-${String(teamIndex % 10 + 1).padStart(2, '0')}.jpg` } },
    } });
    await tx.v1TeamMembership.createMany({ data: members.map((member, index) => ({ teamId, userId: member.id, role: index === 0 ? 'owner' as const : 'member' as const, status: 'active' as const, joinedAt: input.now })) });
    const registration = await tx.v1TournamentRegistration.create({ data: {
      tournamentId: ALPHA_ROUND12_MANUAL_ID, teamId, appliedByUserId: captain.id, entrySource: 'applied',
      status: 'confirmed', confirmedAt: input.now, confirmedByAdminUserId: input.adminId,
      agreedRules: true, agreedPrivacy: true, agreedRefund: true, agreedMediaConsent: true,
      adjustmentNote: 'ALPHA 합성 QA 신청 데이터 — 사용자 요청으로 만든 대진관리 연습 대회',
    } });
    await tx.v1TournamentPlayer.createMany({ data: members.map((member, index) => ({
      registrationId: registration.id, userId: member.id, realName: member.profile!.realName ?? member.profile!.nickname ?? '(테스트) 선수',
      birthDateSnapshot: member.profile!.birthDate, genderSnapshot: member.profile!.gender,
      jerseyNumber: index + 1, eligibilityStatus: 'non_pro' as const, eligibilityNote: 'ALPHA 가상 비선출 선수 — 테스트용 신청',
    })) });
  }
  return { tournamentId: ALPHA_ROUND12_MANUAL_ID, created: true, teams: 12, playersPerTeam: 5, players: 60, groups: 0, matches: 0 };
}

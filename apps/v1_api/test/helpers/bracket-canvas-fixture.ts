import { PrismaService } from '../../src/prisma/prisma.service';
import { competitionConfigFixture as ids } from '../fixtures/competition-config.fixture';

const CONFIG_VERSION_ID = '11111111-1111-4111-8111-111111111111';

export type SeededBracketTournament = { tournamentId: string; teamIds: string[]; registrationIds: string[] };

/**
 * `seedCompetitionConfigFixture` 가 만든 관리자·종목·지역 위에 새 대회와 확정 등록 N개를 만든다.
 * 대회마다 라벨이 달라 한 스펙 안에서 서로 간섭하지 않는다. status 기본은 draft(대진 삭제·교체가 허용되는 상태).
 */
export async function seedBracketTournament(
  prisma: PrismaService,
  input: {
    label: string;
    format: 'knockout' | 'group_knockout' | 'league';
    teamCount: number;
    status?: 'draft' | 'open' | 'closed' | 'in_progress';
    withConfig?: boolean;
  },
): Promise<SeededBracketTournament> {
  const tournament = await prisma.v1Tournament.create({
    data: {
      sportId: ids.soccerSportId,
      title: `${input.label} 대회`,
      status: input.status ?? 'draft',
      format: input.format,
      ...(input.withConfig === false ? {} : { competitionConfigVersionId: CONFIG_VERSION_ID }),
    },
  });
  const teamIds: string[] = [];
  const registrationIds: string[] = [];
  for (let index = 1; index <= input.teamCount; index += 1) {
    const team = await prisma.v1Team.create({
      data: { ownerUserId: ids.adminUserId, sportId: ids.soccerSportId, regionId: ids.regionId, name: `${input.label} 팀${index}` },
    });
    const registration = await prisma.v1TournamentRegistration.create({
      data: { tournamentId: tournament.id, teamId: team.id, appliedByUserId: ids.adminUserId, status: 'confirmed' },
    });
    teamIds.push(team.id);
    registrationIds.push(registration.id);
  }
  return { tournamentId: tournament.id, teamIds, registrationIds };
}

/** 쓰기 권한이 없는 support 어드민 계정. */
export async function seedSupportAdmin(prisma: PrismaService, label: string) {
  const user = await prisma.v1User.create({
    data: { email: `${label}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' },
  });
  await prisma.v1AdminUser.create({ data: { userId: user.id, adminRole: 'support', status: 'active' } });
  return { id: user.id, email: user.email, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
}

import { PrismaService } from '../../src/prisma/prisma.service';
import { seedCompetitionConfigFixture, competitionConfigFixture } from '../fixtures/competition-config.fixture';
import { ALPHA_ROUND12_MANUAL_ID, seedAlphaRound12Manual } from '../../prisma/seed-alpha-round12-manual';
const prisma = new PrismaService();
const seedFlag = process.env.V1_ALPHA_QA_SEED;
const originFlag = process.env.V1_ALPHA_QA_ORIGIN;
const input = { sportId: competitionConfigFixture.futsalSportId, regionId: competitionConfigFixture.regionId, adminId: competitionConfigFixture.adminId, competitionConfigVersionId: '22222222-2222-4222-8222-222222222222', now: new Date('2026-10-05T00:00:00Z') };
describe('사용자가 직접 입력할 alpha 12팀 × 5명 테스트 대회', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, { id: competitionConfigFixture.adminUserId, email: 'seed-test@example.test' });
    process.env.V1_ALPHA_QA_SEED = 'true'; process.env.V1_ALPHA_QA_ORIGIN = 'https://alpha.teameet.co.kr';
    for (let team = 1; team <= 6; team += 1) for (let player = 1; player <= 10; player += 1) {
      await prisma.v1User.create({ data: { id: `ac200000-0000-4000-8000-${`${String(team).padStart(2, '0')}${String(player).padStart(2, '0')}`.padStart(12, '0')}`, email: `alpha.qa.t${team}.p${player}@teameet.test`, accountStatus: 'active', onboardingStatus: 'completed', profile: { create: { realName: '테스트선수', nickname: `선수${team}-${player}`, gender: 'male', birthDate: '1995-01-01' } } } });
    }
  });
  afterAll(async () => {
    if (seedFlag === undefined) delete process.env.V1_ALPHA_QA_SEED; else process.env.V1_ALPHA_QA_SEED = seedFlag;
    if (originFlag === undefined) delete process.env.V1_ALPHA_QA_ORIGIN; else process.env.V1_ALPHA_QA_ORIGIN = originFlag;
    await prisma.$disconnect();
  });
  it('신청 확정 12팀·선수 60명을 저장하고 재실행해도 관리자의 대진 입력을 보존한다', async () => {
    await prisma.$transaction((tx) => seedAlphaRound12Manual(tx, input));
    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: ALPHA_ROUND12_MANUAL_ID }, include: { registrations: { include: { players: true, team: { include: { memberships: true } } } }, groups: true, tournamentMatchDetails: true } });
    expect(row).toMatchObject({ teamCount: 12, minPlayers: 5, maxPlayers: 5, status: 'closed', format: 'group_knockout', bracketPublishedAt: null });
    expect(row.registrations).toHaveLength(12);
    expect(row.registrations.every((registration) => registration.status === 'confirmed' && registration.players.length === 5 && registration.team.memberships.length === 5 && registration.team.memberCount === 5)).toBe(true);
    expect(new Set(row.registrations.flatMap((registration) => registration.players.map((player) => player.userId))).size).toBe(60);
    expect(row.groups).toHaveLength(0); expect(row.tournamentMatchDetails).toHaveLength(0);
    const manualGroup = await prisma.v1TournamentGroup.create({ data: { tournamentId: row.id, phase: 'round12', name: '내가 입력한 12강' } });
    const next = await prisma.$transaction((tx) => seedAlphaRound12Manual(tx, input));
    expect(next).toMatchObject({ created: false, preserved: true });
    expect(await prisma.v1TournamentGroup.findUnique({ where: { id: manualGroup.id } })).toMatchObject({ name: '내가 입력한 12강' });
    expect(await prisma.v1TournamentRegistration.count({ where: { tournamentId: row.id } })).toBe(12);
  });
});

import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-template@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, new AdminContextService(prisma), games);

const liveFixtures = (tournamentId: string) => prisma.v1TournamentMatchDetails.findMany({
  where: { tournamentId, teamMatch: { deletedAt: null } },
  include: { teamMatch: { include: { homeSlot: true, awaySlot: true } } },
  orderBy: { fixtureNumber: 'asc' },
});
const counts = async (tournamentId: string) => ({
  fixtures: (await liveFixtures(tournamentId)).length,
  groups: await prisma.v1TournamentGroup.count({ where: { tournamentId } }),
  slots: await prisma.v1TournamentSlot.count({ where: { tournamentId } }),
  edges: await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } }),
});

describe('대진 템플릿 실행기 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('토너먼트 8강 + 3·4위전: 조 4 · 자리 8 · 경기 8(번호 1~8, 팀 미정) · 연결 8', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko8', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }))
      .resolves.toEqual({ groups: 4, slots: 8, fixtures: 8, edges: 8 });

    const fixtures = await liveFixtures(tournamentId);
    expect(fixtures.map((f) => f.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fixtures.map((f) => f.round)).toEqual(['8강', '8강', '8강', '8강', '4강', '4강', '결승', '3·4위전']);
    expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
    for (const f of fixtures) {
      expect(f.teamMatch.hostTeamId).toBeNull();
      expect(f.teamMatch.approvedApplicantTeamId).toBeNull();
    }
    expect(await prisma.v1Game.count({ where: { teamMatchId: { in: fixtures.map((f) => f.teamMatchId) } } })).toBe(8);
    const quarter1 = fixtures[0].teamMatch;
    expect([quarter1.homeSlot?.kind, quarter1.homeSlot?.position, quarter1.awaySlot?.position]).toEqual(['ENTRY', 1, 2]);
  });

  it('토너먼트 12강 + 3·4위전: BYE 자리 4 ↔ ByeSlot sortOrder 0,3,4,7, 8강 i번 홈 = BYE i · 어웨이 = 12강 i번 WINNER', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko12', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true }))
      .resolves.toEqual({ groups: 5, slots: 12, fixtures: 12, edges: 12 });

    const byes = await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, include: { group: true }, orderBy: { sortOrder: 'asc' } });
    expect(byes.map((b) => [b.group.phase, b.sortOrder])).toEqual([['round12', 0], ['round12', 3], ['round12', 4], ['round12', 7]]);

    const fixtures = await liveFixtures(tournamentId);
    const round12 = fixtures.filter((f) => f.round === '12강');
    const quarters = fixtures.filter((f) => f.round === '8강');
    expect(round12).toHaveLength(4);
    for (const [index, quarter] of quarters.entries()) {
      expect([quarter.teamMatch.homeSlot?.kind, quarter.teamMatch.homeSlot?.position]).toEqual(['BYE', index + 1]);
      expect(quarter.teamMatch.awaySlotId).toBeNull();
      const incoming = await prisma.v1TournamentMatchAdvancementEdge.findMany({ where: { targetTeamMatchId: quarter.teamMatchId } });
      expect(incoming).toHaveLength(1);
      expect(incoming[0]).toMatchObject({ sourceTeamMatchId: round12[index].teamMatchId, sourceOutcome: 'WINNER', targetSide: 'AWAY' });
    }
  });

  it('리그 방식 대회 6팀 2회전: 조 "리그" 1 · 자리 6 · 경기 30, 자리마다 10개 사이드에서 쓰인다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'lg6', format: 'league', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'league', teamCount: 6, legs: 2 }))
      .resolves.toEqual({ groups: 1, slots: 6, fixtures: 30, edges: 0 });
    const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
    expect([group.name, group.phase, group.advanceCount]).toEqual(['리그', 'group', null]);
    const fixtures = await liveFixtures(tournamentId);
    const usage = new Map<string, number>();
    for (const f of fixtures) for (const slotId of [f.teamMatch.homeSlotId, f.teamMatch.awaySlotId]) {
      usage.set(slotId as string, (usage.get(slotId as string) ?? 0) + 1);
    }
    expect([...usage.values()]).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('대회 format 과 다른 템플릿은 422 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'mismatch', format: 'league', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('조별+결선 템플릿은 이 PR 에서 422 BRACKET_TEMPLATE_UNSUPPORTED', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_UNSUPPORTED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('경기 규칙 버전이 없는 대회는 409 COMPETITION_CONFIG_REQUIRED, 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'noconfig', format: 'knockout', teamCount: 0, withConfig: false });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'COMPETITION_CONFIG_REQUIRED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('비어 있지 않은 대진에 다시 적용하면 409 BRACKET_NOT_EMPTY 이고 기존 대진은 그대로다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'notempty', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: true });
    const before = await counts(tournamentId);
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(await counts(tournamentId)).toEqual(before);
  });

  it('support 어드민은 403 이다', async () => {
    const support = await seedSupportAdmin(prisma, 'template-support');
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'support', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(support, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('같은 대회에 템플릿을 동시에 두 번 적용하면 하나만 성공하고 대진은 한 벌뿐이다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'race', format: 'knockout', teamCount: 0 });
    const results = await Promise.allSettled([
      templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }),
      templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
  });
});

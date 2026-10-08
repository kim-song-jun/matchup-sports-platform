import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const adminContext = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, adminContext, games);
const bracket = new TournamentBracketService(prisma, adminContext, games);
const user = { id: ids.adminUserId, email: 'round16-admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

const liveFixtures = (tournamentId: string) => prisma.v1TournamentMatchDetails.findMany({
  where: { tournamentId, teamMatch: { deletedAt: null } },
  orderBy: { fixtureNumber: 'asc' },
});

describe('16강 단계 (PostgreSQL)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated round16 verification');
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('템플릿 knockout 16 + 3·4위전: 조 5 · 자리 16 · 경기 16 · 연결 16, 16강 2i-1·2i → 8강 i 번 홈·어웨이', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 16, thirdPlace: true }))
      .resolves.toEqual({ groups: 5, slots: 16, fixtures: 16, edges: 16 });

    const fixtures = await liveFixtures(tournamentId);
    expect(fixtures.map((f) => f.round)).toEqual([
      ...Array(8).fill('16강'), ...Array(4).fill('8강'), '4강', '4강', '결승', '3·4위전',
    ]);
    const round16 = fixtures.slice(0, 8);
    const quarters = fixtures.slice(8, 12);
    for (const [index, quarter] of quarters.entries()) {
      const incoming = await prisma.v1TournamentMatchAdvancementEdge.findMany({ where: { targetTeamMatchId: quarter.teamMatchId } });
      expect(incoming.every((e) => e.sourceOutcome === 'WINNER')).toBe(true);
      expect(Object.fromEntries(incoming.map((e) => [e.targetSide, e.sourceTeamMatchId]))).toEqual({
        HOME: round16[2 * index].teamMatchId,
        AWAY: round16[2 * index + 1].teamMatchId,
      });
    }
    expect(await prisma.v1TournamentByeSlot.count({ where: { group: { tournamentId } } })).toBe(0);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'BYE' } })).toBe(0);
  });

  it('조는 16강이 조별 다음 첫 결선으로 정렬된다 — 어드민 대진 조회와 공개 상세 조회 둘 다 (enum 순서 = BEFORE round12)', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16-order', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 16, thirdPlace: true });

    const admin = await bracket.getBracket(user, tournamentId);
    expect(admin.groups.map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final', 'third_place']);

    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
    expect(row.groups.map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final', 'third_place']);
  });

  it('수동 연결: 8강은 16강 경기를 원천으로 받고, 단계를 건너뛰거나 거꾸로 연결하면 BRACKET_SOURCE_PHASE_INVALID', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16-manual', format: 'knockout', teamCount: 0 });
    const g16 = await bracket.createGroup(user, tournamentId, { name: '16강', phase: 'round16' });
    const gq = await bracket.createGroup(user, tournamentId, { name: '8강', phase: 'quarter' });
    const gs = await bracket.createGroup(user, tournamentId, { name: '4강', phase: 'semi' });
    const r1 = await bracket.createFixture(user, tournamentId, { groupId: g16.id, round: '16강', fixtureNumber: 1 });
    const r2 = await bracket.createFixture(user, tournamentId, { groupId: g16.id, round: '16강', fixtureNumber: 2 });
    const q1 = await bracket.createFixture(user, tournamentId, { groupId: gq.id, round: '8강', fixtureNumber: 1 });
    const s1 = await bracket.createFixture(user, tournamentId, { groupId: gs.id, round: '4강', fixtureNumber: 1 });

    await bracket.updateBracketSources(user, q1.id, { homeSourceFixtureId: r1.id, awaySourceFixtureId: r2.id });
    const linked = await bracket.getBracket(user, tournamentId);
    expect(linked.fixtures.find((f) => f.id === q1.id)?.bracketSources).toEqual(expect.arrayContaining([
      { fixtureId: r1.id, side: 'HOME', outcome: 'WINNER' },
      { fixtureId: r2.id, side: 'AWAY', outcome: 'WINNER' },
    ]));

    await expect(bracket.updateBracketSources(user, s1.id, { homeSourceFixtureId: r1.id }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_PHASE_INVALID' } });
    await expect(bracket.updateBracketSources(user, r2.id, { homeSourceFixtureId: q1.id }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_PHASE_INVALID' } });
    expect(await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } })).toBe(2);
  });

  it('16강 조에는 부전승 자리가 생기지 않는다 (12강 전용 규칙이 번지지 않았다는 대조군)', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko16-bye', format: 'knockout', teamCount: 0 });
    const g16 = await bracket.createGroup(user, tournamentId, { name: '16강', phase: 'round16' });
    await expect(bracket.createBye(user, tournamentId, { groupId: g16.id, sortOrder: 0 }))
      .rejects.toMatchObject({ response: { code: 'BYE_PHASE_INVALID' } });
    expect(await prisma.v1TournamentByeSlot.count({ where: { groupId: g16.id } })).toBe(0);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { groupId: g16.id } })).toBe(0);
  });
});

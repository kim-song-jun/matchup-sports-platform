import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { presentTournamentDetail } from '../../src/tournaments/tournament-detail.presenter';
import { assertCanonicalDownstreamScheduled } from '../../src/game-operations/tournament-team-match-advancement';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { competitionConfigFixture, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const service = new TournamentBracketService(prisma, new AdminContextService(prisma),
  new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService()));
const user = { id: competitionConfigFixture.adminUserId, email: 'task11-admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

describe('12강·8강 실제 저장 계약', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated round12 verification');
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('정식 단계를 저장하고 부전승을 경기와 구분해 재조회한다', async () => {
    const round12 = await service.createGroup(user, competitionConfigFixture.tournamentId, { name: '12강', phase: 'round12' });
    const quarter = await service.createGroup(user, competitionConfigFixture.tournamentId, { name: '8강', phase: 'quarter' });
    const registrationId = competitionConfigFixture.registrationIds[0];
    await service.createGroupTeam(user, competitionConfigFixture.tournamentId, { groupId: round12.id, registrationId, isBye: true });
    await service.createGroupTeam(user, competitionConfigFixture.tournamentId, { groupId: quarter.id, registrationId });
    const bracket = await service.getBracket(user, competitionConfigFixture.tournamentId);
    expect(bracket.groups.find((group) => group.id === round12.id)?.groupTeams[0].isBye).toBe(true);
    expect(bracket.groups.find((group) => group.id === quarter.id)?.groupTeams[0].isBye).toBe(false);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { groupId: round12.id } })).toBe(0);
    await expect(service.createFixture(user, competitionConfigFixture.tournamentId, { groupId: round12.id, round: '12강', fixtureNumber: 20, homeRegistrationId: registrationId }))
      .rejects.toMatchObject({ response: { code: 'BYE_TEAM_HAS_MATCH' } });
    expect(await prisma.v1TournamentMatchDetails.count({ where: { groupId: round12.id } })).toBe(0);
  });
});

describe('경기별 진출 연결 실제 저장 계약', () => {
  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => { await prisma.$disconnect(); });
  it('실제 DB에서 번호 변경·중복 rollback·공개 재조회·옛 번호 재사용 후에도 진출 관계를 유지한다', async () => {
    const tournamentId = competitionConfigFixture.tournamentId;
    const groups = await prisma.v1TournamentGroup.findMany({ where: { tournamentId } });
    const round12 = groups.find((group) => group.phase === 'round12')!;
    const quarter = groups.find((group) => group.phase === 'quarter')!;
    const dto = { groupId: round12.id, round: '12강', fixtureNumber: 201,
      homeRegistrationId: competitionConfigFixture.registrationIds[1], awayRegistrationId: competitionConfigFixture.registrationIds[2], scheduledAt: '2099-01-01T09:00:00.000Z' };
    const source = await service.createFixture(user, tournamentId, dto);
    const target = await service.createFixture(user, tournamentId, { groupId: quarter.id, round: '8강', fixtureNumber: 201 });
    await service.updateBracketSources(user, target.id, { awaySourceFixtureId: source.id });
    const peer = await service.createFixture(user, tournamentId, { groupId: round12.id, round: '12강', fixtureNumber: 202 });
    const before = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: source.id }, include: { game: { include: { sides: { orderBy: { id: 'asc' } } } }, tournamentDetails: true } });
    await expect(service.updateFixture(user, source.id, { fixtureNumber: 202, venue: '저장되면 안 되는 장소' }))
      .rejects.toMatchObject({ response: { code: 'FIXTURE_NUMBER_CONFLICT' } });
    expect(await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: source.id }, select: { placeName: true } })).toEqual({ placeName: before.placeName });
    expect((await service.updateFixture(user, source.id, { fixtureNumber: 203 })).fixtureNumber).toBe(203);
    const after = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: source.id }, include: { game: { include: { sides: { orderBy: { id: 'asc' } } } }, tournamentDetails: true } });
    expect(after.tournamentDetails).toMatchObject({ fixtureNumber: 203, homeRegistrationId: dto.homeRegistrationId, awayRegistrationId: dto.awayRegistrationId });
    expect(after.game).toEqual(before.game);
    expect(after.title).toMatch(/203$/);
    const schedules = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: source.id } });
    expect(schedules).toHaveLength(2);
    expect(schedules.every((schedule) => schedule.title === after.title)).toBe(true);
    expect((await service.getBracket(user, tournamentId)).fixtures.find((fixture) => fixture.id === target.id)?.bracketSources)
      .toEqual([{ fixtureId: source.id, side: 'AWAY', outcome: 'WINNER' }]);
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { bracketPublishedAt: new Date() } });
    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
    expect(presentTournamentDetail(row, true, new Date(), true).fixtures.find((fixture) => fixture.id === source.id)?.fixtureNumber).toBe(203);
    const replacement = await service.createFixture(user, tournamentId, dto);
    expect(replacement.id).not.toBe(source.id);
    expect((await service.createFixture(user, tournamentId, dto)).id).toBe(replacement.id);
    expect((await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: source.id } })).fixtureNumber).toBe(203);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: replacement.id } })).id).not.toBe(before.game?.id);
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { status: 'closed' } });
    try {
      await service.deleteFixture(user, target.id);
      await service.deleteFixture(user, source.id);
      await service.deleteFixture(user, replacement.id);
      await service.deleteFixture(user, peer.id);
    } finally {
      await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { status: 'in_progress' } });
    }
  });
  it('12→8→4→결승과 3위전 패자를 저장·재조회하고 잘못된 단계/중복 연결/시작 후 변경을 거절한다', async () => {
    const tournamentId = competitionConfigFixture.tournamentId;
    const groups = await prisma.v1TournamentGroup.findMany({ where: { tournamentId } });
    const round12 = groups.find((group) => group.phase === 'round12')!;
    const quarter = groups.find((group) => group.phase === 'quarter')!;
    const semi = await service.createGroup(user, tournamentId, { name: '4강', phase: 'semi' });
    const final = await service.createGroup(user, tournamentId, { name: '결승', phase: 'final' });
    const third = await service.createGroup(user, tournamentId, { name: '3위전', phase: 'third_place' });
    const r = await service.createFixture(user, tournamentId, { groupId: round12.id, round: '12강', fixtureNumber: 100, homeRegistrationId: competitionConfigFixture.registrationIds[1], awayRegistrationId: competitionConfigFixture.registrationIds[2] });
    const q = await service.createFixture(user, tournamentId, { groupId: quarter.id, round: '8강', fixtureNumber: 100, homeRegistrationId: competitionConfigFixture.registrationIds[0] });
    const s = await service.createFixture(user, tournamentId, { groupId: semi.id, round: '4강', fixtureNumber: 100 });
    const f = await service.createFixture(user, tournamentId, { groupId: final.id, round: '결승', fixtureNumber: 100 });
    const t = await service.createFixture(user, tournamentId, { groupId: third.id, round: '3위전', fixtureNumber: 100 });
    await service.updateBracketSources(user, q.id, { awaySourceFixtureId: r.id });
    await service.updateBracketSources(user, s.id, { homeSourceFixtureId: q.id });
    await service.updateBracketSources(user, f.id, { homeSourceFixtureId: s.id });
    await service.updateBracketSources(user, t.id, { homeSourceFixtureId: s.id });
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { bracketPublishedAt: new Date() } });
    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
    const publicDetail = presentTournamentDetail(row, true, new Date(), true);
    expect(publicDetail.fixtures.find((fixture) => fixture.id === s.id)?.bracketSources).toEqual([{ fixtureId: q.id, side: 'HOME', outcome: 'WINNER' }]);
    await prisma.$transaction((tx) => assertCanonicalDownstreamScheduled(tx, r.id));
    const bracket = await service.getBracket(user, tournamentId);
    expect(bracket.fixtures.find((fixture) => fixture.id === q.id)?.bracketSources).toEqual([{ fixtureId: r.id, side: 'AWAY', outcome: 'WINNER' }]);
    expect(bracket.fixtures.find((fixture) => fixture.id === t.id)?.bracketSources).toEqual([{ fixtureId: s.id, side: 'HOME', outcome: 'LOSER' }]);
    await expect(service.updateBracketSources(user, f.id, { awaySourceFixtureId: r.id })).rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_PHASE_INVALID' } });
    await expect(service.updateBracketSources(user, s.id, { awaySourceFixtureId: q.id })).rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_INVALID' } });
    await expect(service.updateBracketSources(user, q.id, { homeSourceFixtureId: r.id })).rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_INVALID' } });
    await expect(service.updateFixture(user, s.id, { homeRegistrationId: competitionConfigFixture.registrationIds[1] })).rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_SLOT_LINKED' } });
    await prisma.v1Game.update({ where: { teamMatchId: r.id }, data: { state: 'LIVE' } });
    await expect(service.updateBracketSources(user, q.id, { awaySourceFixtureId: null })).rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_LOCKED' } });
    expect(await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } })).toBe(4);
  });
});

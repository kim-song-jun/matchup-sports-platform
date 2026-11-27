import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { MultiFinalsService } from '../../src/tournaments/multi-finals/multi-finals.service';
import { StagePlanService } from '../../src/tournaments/stages/stage-plan.service';
import { BracketResetService } from '../../src/tournaments/bracket-reset/bracket-reset.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService(), admins = new AdminContextService(prisma);
const user = { id: ids.adminUserId, email: 'bracket-reset@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const templates = new BracketTemplateService(prisma, admins, games);
const finals = new MultiFinalsService(prisma, admins, games, templates);
const stages = new StagePlanService(prisma, admins, templates, games);
const resets = new BracketResetService(prisma, admins, finals);
const live = (id: string) => prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, teamMatch: { deletedAt: null } }, orderBy: { teamMatchId: 'asc' } });
async function seeded(label: string, format: 'league' | 'knockout' | 'group_knockout' = 'knockout') {
  const teamCount = format === 'group_knockout' ? 6 : 4;
  const seed = await seedBracketTournament(prisma, { label, format, teamCount });
  if (format === 'league') await templates.apply(user, seed.tournamentId, { kind: 'league', teamCount, legs: 1 });
  else if (format === 'group_knockout') await templates.apply(user, seed.tournamentId, { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false });
  else await templates.apply(user, seed.tournamentId, { kind: 'knockout', size: 4, thirdPlace: false });
  return seed;
}
async function reset(id: string) {
  const preview = await resets.preview(user, id);
  return resets.reset(user, id, { expectedSnapshot: preview.snapshot, confirmed: true, confirmationText: '초기화한다' });
}

describe('대진 초기화 PostgreSQL 계약', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });

  it.each(['league', 'knockout', 'group_knockout'] as const)('%s 실제 게임을 보관하고 참가 신청·재사용 시간/구장은 보존한다', async format => {
    const { tournamentId, registrationIds } = await seeded(`reset-${format}`, format);
    const fixtures = await live(tournamentId);
    expect(fixtures.length).toBeGreaterThan(0);
    expect(registrationIds).toHaveLength(format === 'group_knockout' ? 6 : 4);
    const field = await prisma.v1TournamentField.create({ data: { tournamentId, name: '보존 구장', scopeKey: 'reset-kept-field' } });
    const time = await prisma.v1TournamentScheduleTime.create({ data: { tournamentId, scheduledAt: new Date('2026-12-01T01:00:00Z') } });
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { bracketPublishedAt: new Date() } });
    expect(await reset(tournamentId)).toEqual({ deletedFixtureCount: fixtures.length });
    expect(await live(tournamentId)).toEqual([]);
    const archived = await prisma.v1TeamMatch.findMany({ where: { id: { in: fixtures.map(f => f.teamMatchId) } }, select: { deletedAt: true, game: { select: { state: true } } } });
    expect(archived.every(match => match.deletedAt !== null && match.game?.state === 'CANCELLED')).toBe(true);
    expect(await prisma.v1TournamentRegistration.count({ where: { id: { in: registrationIds }, status: 'confirmed' } })).toBe(registrationIds.length);
    expect(await prisma.v1TournamentField.findUnique({ where: { id: field.id } })).not.toBeNull();
    expect(await prisma.v1TournamentScheduleTime.findUnique({ where: { id: time.id } })).not.toBeNull();
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).bracketPublishedAt).toBeNull();
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId } })).toBe(0);
    expect(await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } })).toBe(0);
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { action: 'tournament.bracket.reset', targetId: tournamentId } });
    expect(audit.adminUserId).toBeTruthy(); expect(audit.createdAt).toBeInstanceOf(Date);
    expect(audit.reason).toBe('초기화한다');
    expect(audit.beforeJson).toMatchObject({ tournament: { id: tournamentId, format },
      fixtures: fixtures.map(f => expect.objectContaining({ teamMatchId: f.teamMatchId })),
      groups: expect.any(Array), slots: expect.any(Array), groupTeams: expect.any(Array), edges: expect.any(Array),
      standings: expect.any(Array), byes: expect.any(Array), overallStandings: expect.any(Array) });
    expect(audit.afterJson).toMatchObject({ result: 'succeeded', actorUserId: user.id, confirmationText: '초기화한다',
      archivedFixtureIds: fixtures.map(f => f.teamMatchId), unpublished: true });
  });

  it('단계형 초기화 후 같은 구성으로 새 대진을 생성할 수 있다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'reset-staged', format: 'knockout', teamCount: 4 });
    const plan = { version: 1, autoAdvance: false, stages: [{ key: 'main', name: '본선', pools: [{ key: 'one', name: '본선', format: 'knockout', capacity: 4, legs: 1, sources: [] }] }] };
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { stagePlan: plan, stagePlanRevision: 1, teamCount: 4, format: 'league_knockouts' } });
    await stages.generate(user, tournamentId, { expectedRevision: 1 });
    const before = await live(tournamentId);
    await reset(tournamentId);
    const stored = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(stored.stagePlan).toMatchObject(plan);
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId } })).toBe(0);
    await stages.generate(user, tournamentId, { expectedRevision: stored.stagePlanRevision });
    const after = await live(tournamentId);
    expect(after).toHaveLength(before.length);
    expect(after.every(fixture => !before.some(old => old.teamMatchId === fixture.teamMatchId))).toBe(true);
  });

  it('복수 결선의 예선 편성과 참가팀 선택을 기존 reset 경로로 보존한다', async () => {
    const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'reset-multi', format: 'league', teamCount: 4 });
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { format: 'league_knockouts' } });
    const before = await finals.setup(user, tournamentId, { expectedRevision: 0,
      groups: [{ name: 'A조', capacity: 4, legs: 1, registrationIds }],
      finals: [{ name: '결선', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '0', rank: 2 }] }] });
    expect((await live(tournamentId)).length).toBeGreaterThan(0);
    await reset(tournamentId);
    const after = await finals.get(user, tournamentId);
    expect(after.groups).toEqual(before.groups);
    expect(after.finals.map(final => final.rules)).toEqual(before.finals.map(final => final.rules));
    expect(await live(tournamentId)).toEqual([]);
  });

  it.each(['LIVE', 'DRAFT_RESULT', 'STARTED_PERIOD'])('%s 기록은 대진 보관 전에 거절한다', async state => {
    const { tournamentId } = await seeded(`reset-protect-${state}`);
    const fixtures = await live(tournamentId), game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixtures[0].teamMatchId } });
    if (state === 'LIVE') await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'LIVE' } });
    else if (state === 'DRAFT_RESULT') await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 0, away: 0 }, eventsHash: 'reset-protection', createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' } });
    else await prisma.v1GamePeriod.updateMany({ where: { gameId: game.id }, data: { state: 'LIVE', startedAt: new Date() } });
    expect((await resets.preview(user, tournamentId)).canReset).toBe(false);
    await expect(reset(tournamentId)).rejects.toMatchObject({ response: { code: 'BRACKET_RESET_BLOCKED' } });
    expect(await live(tournamentId)).toHaveLength(fixtures.length);
  });

  it('확인 뒤 일정 변경과 support의 초기화 요청을 차단한다', async () => {
    const { tournamentId } = await seeded('reset-stale'), fixtures = await live(tournamentId);
    const preview = await resets.preview(user, tournamentId);
    await prisma.v1TeamMatch.update({ where: { id: fixtures[0].teamMatchId }, data: { startAt: new Date('2026-12-02T01:00:00Z') } });
    await expect(resets.reset(user, tournamentId, { expectedSnapshot: preview.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toMatchObject({ response: { code: 'BRACKET_RESET_STALE' } });
    const support = await seedSupportAdmin(prisma, 'reset-support'), current = await resets.preview(support, tournamentId);
    await expect(resets.reset(support, tournamentId, { expectedSnapshot: current.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(await live(tournamentId)).toHaveLength(fixtures.length);
  });

  it('최종 감사 저장 실패 시 경기·그룹·공개 상태를 모두 rollback한다', async () => {
    const { tournamentId } = await seeded('reset-rollback'), fixtures = await live(tournamentId);
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { bracketPublishedAt: new Date() } });
    const groups = await prisma.v1TournamentGroup.count({ where: { tournamentId } });
    const writeAudit = admins.logAdminAction.bind(admins);
    const audit = jest.spyOn(admins, 'logAdminAction').mockImplementation((admin, input, tx) => {
      if (input.action === 'tournament.bracket.reset') throw new Error('reset audit failed');
      return writeAudit(admin, input, tx);
    });
    try { await expect(reset(tournamentId)).rejects.toThrow('reset audit failed'); }
    finally { audit.mockRestore(); }
    expect(await live(tournamentId)).toHaveLength(fixtures.length);
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId } })).toBe(groups);
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).bracketPublishedAt).not.toBeNull();
  });

  it('같은 경기 사이에서 승자/패자 진출 조건만 바뀌어도 snapshot을 거절한다', async () => {
    const { tournamentId } = await seeded('reset-edge-cas'), fixtures = await live(tournamentId);
    const preview = await resets.preview(user, tournamentId);
    const edge = await prisma.v1TournamentMatchAdvancementEdge.findFirstOrThrow({ where: { tournamentId } });
    await prisma.v1TournamentMatchAdvancementEdge.update({ where: { id: edge.id }, data: { sourceOutcome: edge.sourceOutcome === 'WINNER' ? 'LOSER' : 'WINNER' } });
    await expect(resets.reset(user, tournamentId, { expectedSnapshot: preview.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toMatchObject({ response: { code: 'BRACKET_RESET_STALE' } });
    expect(await live(tournamentId)).toHaveLength(fixtures.length);
  });
});

import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminContextService } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MultiFinalsService } from '../multi-finals/multi-finals.service';
import { deleteTournamentGroupInTx, softDeleteTournamentFixtureInTx } from '../tournament-bracket-tx';
import { ResetTournamentBracketDto } from './bracket-reset.dto';
import { BracketResetService } from './bracket-reset.service';

jest.mock('../tournament-bracket-tx', () => ({ deleteTournamentGroupInTx: jest.fn(), softDeleteTournamentFixtureInTx: jest.fn() }));
const user = { id: 'actor' } as never;

function setup(role: 'owner' | 'support' | null = 'owner', directorTournament?: string) {
  const row = { id: 't1', kind: 'regular_tournament', format: 'knockout', status: 'open', updatedAt: new Date(0),
    stagePlan: null as unknown, stagePlanRevision: 2, multiFinals: null as unknown, multiFinalsRevision: 4,
    bracketDraft: { kind: 'knockout', size: 4 }, bracketDraftRevision: 1, sixTeamMode: true, sixTeamBracket: { rounds: [] },
    bracketPublishedAt: new Date(0), bracketPublishScheduledAt: null };
  const fixtures = [{ teamMatchId: 'first', groupId: 'final', parentTeamMatchId: null as string | null, deleted: false,
    teamMatch: { status: 'matched', startAt: new Date(0), updatedAt: new Date(0), game: { version: 1, state: 'SCHEDULED', currentOfficialRevisionId: null } } }];
  const groups = [{ id: 'prelim', phase: 'group' }, { id: 'final', phase: 'final' }];
  const slots = [{ id: 'slot', registrationId: 'reg1' }];
  const enrollments = [{ id: 'enrollment', groupId: 'prelim', registrationId: 'reg1' }];
  const edges: Array<{ id: string; sourceTeamMatchId: string; targetTeamMatchId: string; sourceOutcome: 'WINNER' | 'LOSER'; targetSide: 'HOME' | 'AWAY' }> = [];
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]),
    v1AdminUser: { findUnique: jest.fn(async () => role ? { id: 'admin', userId: 'actor', adminRole: role, status: 'active', user: { accountStatus: 'active' } } : null) },
    v1TournamentStaffAssignment: { findFirst: jest.fn(async ({ where }) => directorTournament === where.tournamentId
      ? { id: 'grant', version: 1, tournamentId: directorTournament } : null) },
    v1Tournament: { findFirst: jest.fn(async () => row), update: jest.fn(async ({ data }) => {
      Object.assign(row, { ...data, bracketDraftRevision: row.bracketDraftRevision + 1,
        ...(data.stagePlanRevision ? { stagePlanRevision: row.stagePlanRevision + 1 } : {}) }); return row;
    }) },
    v1TeamMatch: { findFirst: jest.fn(async (_args: unknown) => null as { id: string } | null) },
    v1TournamentMatchDetails: { findMany: jest.fn(async () => fixtures.filter(f => !f.deleted)) },
    v1TournamentGroup: { findMany: jest.fn(async () => [...groups]) },
    v1TournamentSlot: { findMany: jest.fn(async () => [...slots]), deleteMany: jest.fn(async () => { slots.length = 0; }) },
    v1TournamentGroupTeam: { findMany: jest.fn(async () => [...enrollments]), deleteMany: jest.fn(async ({ where }: { where: { groupId: { in: string[] } } }) => {
      for (let i = enrollments.length - 1; i >= 0; i--) if (where.groupId.in.includes(enrollments[i].groupId)) enrollments.splice(i, 1);
    }) },
    v1TournamentStanding: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() }, v1TournamentOverallStanding: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    v1TournamentByeSlot: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
    v1TournamentMatchAdvancementEdge: { findMany: jest.fn(async ({ select }: { select: Record<string, boolean> }) =>
      edges.map(edge => Object.fromEntries(Object.entries(edge).filter(([key]) => select[key])))) },
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'audit' }) },
    v1OperationAudit: { create: jest.fn().mockResolvedValue({ id: 'operation-audit' }) },
  };
  jest.mocked(softDeleteTournamentFixtureInTx).mockReset().mockImplementation(async (_tx, _admin, id) => { fixtures.find(f => f.teamMatchId === id)!.deleted = true; });
  jest.mocked(deleteTournamentGroupInTx).mockReset().mockImplementation(async (_tx, _admin, id) => { groups.splice(groups.findIndex(g => g.id === id), 1); });
  const prisma = { ...tx, $transaction: jest.fn(async fn => fn(tx)) } as unknown as PrismaService;
  const finals = { resetInTx: jest.fn(async () => { fixtures.forEach(f => { f.deleted = true; }); }) };
  const service = new BracketResetService(prisma, new AdminContextService(prisma), finals as unknown as MultiFinalsService);
  return { service, row, tx, fixtures, groups, slots, enrollments, edges, finals };
}

describe('대진 상단 초기화 계약', () => {
  it.each(['', '초기화', ' 초기화한다', '초기화한다 '])('잘못된 확인 문구 %p는 쓰기 전 거절한다', async confirmationText => {
    const h = setup();
    await expect(h.service.reset(user, 't1', { expectedSnapshot: 'a'.repeat(64), confirmed: true, confirmationText }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_RESET_CONFIRMATION_REQUIRED' } });
    expect(h.fixtures[0].deleted).toBe(false);
    expect(h.tx.v1AdminActionLog.create).not.toHaveBeenCalled();
  });
  it.each(['league', 'knockout', 'group_knockout', 'league_knockouts'])('%s 대진을 보관하고 예선 편성·설정은 보존한다', async format => {
    const h = setup(); h.row.format = format;
    const preview = await h.service.preview(user, 't1');
    expect(preview).toMatchObject({ fixtureCount: 1, canReset: true });
    expect(await h.service.reset(user, 't1', { expectedSnapshot: preview.snapshot, confirmed: true, confirmationText: '초기화한다' })).toEqual({ deletedFixtureCount: 1 });
    expect(h.fixtures[0].deleted).toBe(true);
    const keepPreliminary = format === 'league' || format === 'group_knockout';
    expect(h.groups).toEqual(keepPreliminary ? [{ id: 'prelim', phase: 'group' }] : []);
    expect(h.enrollments).toHaveLength(keepPreliminary ? 1 : 0);
    expect(h.row.bracketDraft).toEqual({ kind: 'knockout', size: 4 });
    expect(h.row.bracketPublishedAt).toBeNull();
    expect(h.tx.v1TournamentOverallStanding.deleteMany).toHaveBeenCalledWith({ where: { tournamentId: 't1' } });
    expect(h.tx.v1AdminActionLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      adminUserId: 'admin', action: 'tournament.bracket.reset', targetId: 't1', reason: '초기화한다',
      beforeJson: expect.objectContaining({ tournament: expect.objectContaining({ id: 't1', format }),
        fixtures: expect.arrayContaining([expect.objectContaining({ teamMatchId: 'first' })]),
        slots: [{ id: 'slot', registrationId: 'reg1' }], groupTeams: expect.any(Array),
        edges: [], standings: [], byes: [], overallStandings: [] }),
      afterJson: expect.objectContaining({ result: 'succeeded', actorUserId: 'actor', confirmationText: '초기화한다',
        archivedFixtureIds: ['first'], clearedSlotIds: ['slot'], clearedAdvancementEdgeIds: [] }),
    }) }));
  });
  it('단계 정의와 경기 규칙은 보존하고 생성된 그룹·배정·복구 메타데이터는 지운다', async () => {
    const h = setup();
    const definition = { version: 1, stages: [{ key: 'first', pools: [] }], autoAdvance: true, periodSettings: { stages: {} } };
    h.row.stagePlan = { ...definition, assignments: { a: {} }, removedFixtures: { b: {} }, sixTeamSelections: { c: {} } };
    const p = await h.service.preview(user, 't1');
    await h.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' });
    expect(h.groups).toEqual([]);
    expect(h.row.stagePlan).toEqual({ ...definition, assignments: {}, removedFixtures: {}, sixTeamSelections: {} });
    expect(h.row.stagePlanRevision).toBe(3);
  });
  it('복수 결선은 검증한 tx 안에서 기존 reset 로직을 재사용한다', async () => {
    const h = setup(); h.row.format = 'league_knockouts'; h.row.multiFinals = { groups: [], finals: [] };
    const p = await h.service.preview(user, 't1');
    await h.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' });
    expect(h.finals.resetInTx).toHaveBeenCalledWith(h.tx, expect.anything(), 't1', { expectedRevision: 4, confirmationText: '초기화한다' });
    expect(softDeleteTournamentFixtureInTx).not.toHaveBeenCalled();
  });
  it('후속 경기와 하위 경기를 먼저 보관한다', async () => {
    const h = setup(); h.fixtures.push({ ...h.fixtures[0], teamMatchId: 'child', parentTeamMatchId: 'first' });
    const p = await h.service.preview(user, 't1');
    await h.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' });
    expect(jest.mocked(softDeleteTournamentFixtureInTx).mock.calls.map(call => call[2])).toEqual(['child', 'first']);
  });
  it.each(['schedule', 'slot', 'config', 'edge'])('확인 이후 %s 변경은 어떤 삭제도 하기 전에 차단한다', async change => {
    const h = setup();
    if (change === 'edge') h.edges.push({ id: 'edge', sourceTeamMatchId: 'first', targetTeamMatchId: 'child', sourceOutcome: 'WINNER', targetSide: 'HOME' });
    const p = await h.service.preview(user, 't1');
    if (change === 'schedule') h.fixtures[0].teamMatch.startAt = new Date(1000);
    if (change === 'slot') h.slots[0].registrationId = 'reg2';
    if (change === 'config') h.row.stagePlanRevision++;
    if (change === 'edge') h.edges[0].sourceOutcome = 'LOSER';
    await expect(h.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toMatchObject({ response: { code: 'BRACKET_RESET_STALE' } });
    expect(softDeleteTournamentFixtureInTx).not.toHaveBeenCalled();
  });
  it('시작·이벤트·결과 revision·피리어드 안전 조건을 확인하고 차단된 경기는 보존한다', async () => {
    const h = setup(), p = await h.service.preview(user, 't1');
    h.tx.v1TeamMatch.findFirst.mockResolvedValue({ id: 'first' });
    const blocked = await h.service.preview(user, 't1'); expect(blocked.canReset).toBe(false);
    await expect(h.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toMatchObject({ response: { code: 'BRACKET_RESET_BLOCKED' } });
    const query = h.tx.v1TeamMatch.findFirst.mock.calls[0]?.[0];
    expect(query).toMatchObject({ where: { OR: expect.arrayContaining([{ game: { isNot: expect.objectContaining({
      state: 'SCHEDULED', events: { none: {} }, resultRevisions: { none: {} }, periods: { none: expect.anything() },
    }) } }]) } });
    expect(softDeleteTournamentFixtureInTx).not.toHaveBeenCalled();
  });
  it.each(['completed', 'cancelled', 'archived'])('%s 대회 초기화를 거절한다', async status => {
    const h = setup(); h.row.status = status;
    const p = await h.service.preview(user, 't1'); expect(p.canReset).toBe(false);
    await expect(h.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toMatchObject({ response: { code: 'BRACKET_RESET_BLOCKED' } });
    expect(softDeleteTournamentFixtureInTx).not.toHaveBeenCalled();
  });
  it('support는 조회만, 해당 대회 총괄만 쓰기를 허용한다', async () => {
    const support = setup('support'), preview = await support.service.preview(user, 't1');
    await expect(support.service.reset(user, 't1', { expectedSnapshot: preview.snapshot, confirmed: true, confirmationText: '초기화한다' })).rejects.toThrow(ForbiddenException);
    const other = setup(null, 't2'); await expect(other.service.preview(user, 't1')).rejects.toThrow(ForbiddenException);
    const director = setup(null, 't1'), p = await director.service.preview(user, 't1');
    await expect(director.service.reset(user, 't1', { expectedSnapshot: p.snapshot, confirmed: true, confirmationText: '초기화한다' })).resolves.toMatchObject({ deletedFixtureCount: 1 });
  });
  it('빈 대진과 없는 대회를 성공으로 숨기지 않는다', async () => {
    const h = setup(); h.row.format = 'league'; h.fixtures.length = h.slots.length = 0; h.groups.splice(1);
    expect(await h.service.preview(user, 't1')).toMatchObject({ canReset: false, blockedReason: '초기화할 대진이 없어요.' });
    h.tx.v1Tournament.findFirst.mockResolvedValue(null as never);
    await expect(h.service.preview(user, 't1')).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
  });
});

it('초기화 DTO는 명시 확인과 완전한 snapshot hash를 요구한다', async () => {
  expect(await validate(plainToInstance(ResetTournamentBracketDto, { expectedSnapshot: 'a'.repeat(64), confirmed: true, confirmationText: '초기화한다' }))).toHaveLength(0);
  for (const body of [{ expectedSnapshot: 'a'.repeat(64), confirmed: false }, { expectedSnapshot: 'a'.repeat(64), confirmed: 'false' },
    { expectedSnapshot: 'a'.repeat(64), confirmed: 'true' }, { expectedSnapshot: 'short', confirmed: true, confirmationText: '초기화한다' }, {}]) {
    expect((await validate(plainToInstance(ResetTournamentBracketDto, { confirmationText: '초기화한다', ...body }, { enableImplicitConversion: true }))).length).toBeGreaterThan(0);
  }
  for (const confirmationText of [undefined, null, true, 1, '', '초기화', ' 초기화한다', '초기화한다 ']) {
    expect((await validate(plainToInstance(ResetTournamentBracketDto, { expectedSnapshot: 'a'.repeat(64), confirmed: true, confirmationText }, { enableImplicitConversion: true }))).length).toBeGreaterThan(0);
  }
});

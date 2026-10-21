import { applyFinalistAssignment, loadFinalistPreview, previewFinalistAssignment, validateFinalistAssignments } from './finalist-assignment';
import { loadGroupRankSources } from './load-group-rank-preview';
import { loadCanonicalStandingsSource } from '../tournament-standings-source';
import { findTournamentOnSurface } from '../tournament-surface-lookup';
import { assignSlotsBatchInTx } from './tournament-slot.service';
import type { FinalistAssignmentDto } from './dto/finalist-assignment.dto';

jest.mock('./load-group-rank-preview', () => ({ loadGroupRankSources: jest.fn() }));
jest.mock('../tournament-standings-source', () => ({ loadCanonicalStandingsSource: jest.fn() }));
jest.mock('../tournament-surface-lookup', () => ({ TOURNAMENT_KINDS: [], findTournamentOnSurface: jest.fn() }));
jest.mock('./tournament-slot.service', () => ({ assignSlotsBatchInTx: jest.fn() }));
const user = { id: 'admin-user' } as never;
function setup(sizes = [4, 4, 3, 3]) {
  const groups = sizes.map((_, i) => ({ id: `g${i}`, name: `${i}조`, phase: 'group', sortOrder: i, advanceCount: 2 }));
  const sources = new Map(groups.map((group, i) => {
    const ids = Array.from({ length: sizes[i] }, (_, j) => `${group.id}-r${j}`);
    const fixtures = ids.flatMap((home, j) => ids.slice(j + 1).map((away) => ({ homeRegistrationId: home, awayRegistrationId: away, official: { homeScore: 1, awayScore: 0 }, officialAt: null })));
    return [group.id, { registrationIds: ids, teamNameById: new Map(ids.map((id) => [id, id])), fixtures,
      standings: ids.map((id, j) => ({ registrationId: id, position: j + 1, wins: sizes[i] - j - 1, draws: 0, losses: j, recalculatedAt: null })) }];
  }));
  const standings = groups.flatMap((group) => sources.get(group.id)!.standings.map((row) => ({ ...row, groupId: group.id, points: row.wins * 3, goalsFor: row.wins, goalsAgainst: row.losses })));
  const game = () => ({ state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 0 }, resultRevisions: [] as { state: string }[] });
  const details = Array.from({ length: 4 }, (_, i) => ({ teamMatchId: `f${i}`, fixtureNumber: i + 1, groupId: 'q', round: '8강', homeRegistrationId: null, awayRegistrationId: null,
    teamMatch: { status: 'matched', homeSlotId: null as string | null, awaySlotId: null as string | null, game: game() } }));
  const edges = [{ targetTeamMatchId: 'semi', targetSide: 'HOME', sourceTeamMatchId: 'f0' }];
  let nextSlot = 0;
  const tx = {
    v1TournamentGroup: { findMany: jest.fn(async () => [...groups, { id: 'q', name: '8강', phase: 'quarter', sortOrder: 5, advanceCount: null }]) },
    v1AdminActionLog: { findFirst: jest.fn(async () => null as null | { afterJson: { sourceVersion: string } }) },
    v1TournamentByeSlot: { findMany: jest.fn(async () => []) },
    v1TournamentGroupTeam: { findMany: jest.fn(async () => []) },
    v1TournamentStanding: { findMany: jest.fn(async () => standings) },
    v1TournamentRegistration: { findMany: jest.fn(async () => standings.map((row) => ({ id: row.registrationId }))) },
    v1TournamentMatchDetails: { findMany: jest.fn(async () => details) },
    v1TournamentMatchAdvancementEdge: { findMany: jest.fn(async () => edges) },
    v1TournamentSlot: { findMany: jest.fn(async () => []), create: jest.fn(async () => ({ id: `slot-${++nextSlot}` })), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    v1TeamMatch: { update: jest.fn(), count: jest.fn(async () => 1) },
  };
  const adminContext = { getActiveAdmin: jest.fn(), getMutationAdmin: jest.fn(async () => ({ id: 'admin' })), logAdminAction: jest.fn() };
  const deps = { prisma: { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) }, adminContext, games: {} } as never;
  jest.mocked(findTournamentOnSurface).mockResolvedValue({ id: 't', format: 'group_knockout', status: 'in_progress' } as never);
  jest.mocked(loadGroupRankSources).mockResolvedValue(sources);
  return { tx, deps, details, sources, adminContext, read: () => loadFinalistPreview(tx as never, 't') };
}
const inputFor = (preview: Awaited<ReturnType<typeof loadFinalistPreview>>): FinalistAssignmentDto => ({
  version: preview.version, reason: '운영자 확인', assignments: preview.targets.map((target, index) => ({ fixtureId: target.fixtureId, side: target.side, registrationId: preview.groups[Math.floor(index / 2)].teams[index % 2].registrationId })),
});
beforeEach(() => jest.clearAllMocks());

describe('공통 결선 배정', () => {
  it.each([[4, 4, 3, 3], [4, 4, 4, 3]])('%j 불균등 조의 공식 순위와 수동 8강 자리 8개를 불러온다', async (...sizes) => {
    const { read } = setup(sizes);
    const preview = await read();
    expect(preview.groups.map((group) => group.teams.length)).toEqual(sizes);
    expect(preview.groups.every((group) => group.complete)).toBe(true);
    expect(preview.targets).toHaveLength(8);
    expect(preview.blockedReason).toBeNull();
    expect(() => validateFinalistAssignments(preview, inputFor(preview))).not.toThrow();
  });
  it('승자/패자가 연결된 자리는 수동 배정 대상으로 노출하지 않는다', async () => {
    const { tx, read } = setup();
    tx.v1TournamentMatchAdvancementEdge.findMany.mockResolvedValue([{ targetTeamMatchId: 'f0', targetSide: 'HOME', sourceTeamMatchId: 'prev' }]);
    const preview = await read();
    expect(preview.targets).toHaveLength(7);
    expect(preview.targets.some((target) => target.fixtureId === 'f0' && target.side === 'HOME')).toBe(false);
  });
  it('조별 경기가 미완료면 순위를 보여주되 저장을 막는다', async () => {
    const { sources, read } = setup();
    sources.get('g0')!.fixtures[0].official = null as never;
    const preview = await read();
    expect(preview.groups[0].complete).toBe(false);
    expect(() => validateFinalistAssignments(preview, inputFor(preview))).toThrow('공식 결과');
  });
  it.each(['LIVE', 'ENDED'])('결선 %s 경기가 있으면 저장을 막는다', async (state) => {
    const { details, read } = setup(); details[0].teamMatch.game.state = state;
    const preview = await read();
    expect(() => validateFinalistAssignments(preview, inputFor(preview))).toThrow('시작했거나');
  });
  it('미리보기 뒤 결과/대진이 달라지면 거부한다', async () => {
    const { read, details } = setup(); const before = await read();
    details[0].fixtureNumber = 12;
    expect(() => validateFinalistAssignments({ ...before, version: 'changed' }, inputFor(before))).toThrow('바뀌었어요');
    expect((await read()).version).not.toBe(before.version);
  });
  it.each(['duplicate-team', 'duplicate-target', 'foreign-team', 'missing-target', 'linked-target'] as const)('%s 를 거부한다', async (kind) => {
    const preview = await setup().read(); const input = inputFor(preview);
    if (kind === 'duplicate-team') input.assignments[1].registrationId = input.assignments[0].registrationId;
    if (kind === 'duplicate-target') input.assignments[1] = { ...input.assignments[0] };
    if (kind === 'foreign-team') input.assignments[0].registrationId = 'foreign-team';
    if (kind === 'missing-target') input.assignments.pop();
    if (kind === 'linked-target') input.assignments[0].fixtureId = 'semi';
    expect(() => validateFinalistAssignments(preview, input)).toThrow();
  });
  it('새 결선 자리를 연결하고 기존 배치 서비스를 통해 저장하며 사유/변경 전후를 감사한다', async () => {
    const { deps, tx, adminContext, read } = setup(); const preview = await read();
    const result = await applyFinalistAssignment(deps, user, 't', inputFor(preview));
    expect(result.assignments).toHaveLength(8);
    expect(tx.v1TeamMatch.update).toHaveBeenCalledTimes(8);
    expect(jest.mocked(assignSlotsBatchInTx).mock.calls[0][2]).toEqual(result.assignments);
    expect(result.assignments.map((row) => row.registrationId)).toEqual(inputFor(preview).assignments.map((row) => row.registrationId));
    expect(adminContext.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'tournament.bracket.assign_finalists', reason: '운영자 확인', beforeJson: { targets: preview.targets } }), tx);
    expect(tx.v1TournamentStanding.findMany).toHaveBeenCalled();
  });
  it('활성 관리자 읽기/쓰기 검증 실패 시 데이터에 접근하지 않는다', async () => {
    const { deps, adminContext, tx } = setup();
    adminContext.getActiveAdmin.mockRejectedValue(new Error('Forbidden'));
    await expect(previewFinalistAssignment(deps, user, 't')).rejects.toThrow('Forbidden');
    expect(tx.v1TournamentGroup.findMany).not.toHaveBeenCalled();
    adminContext.getMutationAdmin.mockRejectedValue(new Error('Read only'));
    await expect(applyFinalistAssignment(deps, user, 't', {} as never)).rejects.toThrow('Read only');
    expect(tx.v1TeamMatch.update).not.toHaveBeenCalled();
  });
  it('저장 이후 공식 순위/결과 변경을 표시하되 현재 배정은 덮어쓰지 않는다', async () => {
    const { tx, read } = setup(); const original = await read();
    tx.v1AdminActionLog.findFirst.mockResolvedValue({ afterJson: { sourceVersion: original.sourceVersion } });
    expect((await read()).standingsChanged).toBe(false);
    tx.v1AdminActionLog.findFirst.mockResolvedValue({ afterJson: { sourceVersion: 'earlier-result' } });
    expect((await read()).standingsChanged).toBe(true);
    expect(tx.v1TeamMatch.update).not.toHaveBeenCalled();
  });
  it('종료된 대회는 배정할 수 없다', async () => {
    const { read } = setup();
    jest.mocked(findTournamentOnSurface).mockResolvedValue({ id: 't', format: 'group_knockout', status: 'completed' } as never);
    const preview = await read();
    expect(() => validateFinalistAssignments(preview, inputFor(preview))).toThrow('종료');
  });
  it('stale 요청은 어떤 자리도 쓰지 않는다', async () => {
    const { deps, tx, read } = setup(); const preview = await read();
    await expect(applyFinalistAssignment(deps, user, 't', { ...inputFor(preview), version: 'stale' })).rejects.toThrow('바뀌었어요');
    expect(tx.v1TournamentSlot.create).not.toHaveBeenCalled();
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('동일한 조별 원천의 조회 순서만 바뀌면 버전과 저장 가능 상태를 유지한다', async () => {
    const { deps, tx, sources, read } = setup();
    const before = await read();
    for (const source of sources.values()) {
      source.registrationIds.reverse();
      source.standings.reverse();
      source.fixtures.reverse();
    }
    jest.mocked(loadGroupRankSources).mockResolvedValue(new Map([...sources].reverse()));
    const after = await read();
    expect(after.version).toBe(before.version);
    expect(after.sourceVersion).toBe(before.sourceVersion);
    expect(after.groups).toEqual(before.groups);
    expect(after.blockedReason).toBeNull();
    await expect(applyFinalistAssignment(deps, user, 't', inputFor(before))).resolves.toHaveProperty('assignments');
    expect(tx.v1TournamentSlot.create).toHaveBeenCalledTimes(8);
  });
  it('정렬을 정규화해도 실제 공식 결과가 바뀌면 원래 미리보기로 저장할 수 없다', async () => {
    const { deps, tx, sources, read } = setup();
    const before = await read();
    sources.get('g0')!.fixtures[0].official = { homeScore: 2, awayScore: 0 };
    const after = await read();
    expect(after.version).not.toBe(before.version);
    expect(after.sourceVersion).not.toBe(before.sourceVersion);
    await expect(applyFinalistAssignment(deps, user, 't', inputFor(before))).rejects.toThrow('바뀌었어요');
    expect(tx.v1TournamentSlot.create).not.toHaveBeenCalled();
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
});

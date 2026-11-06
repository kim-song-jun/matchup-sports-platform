import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BracketTemplateService } from '../templates/bracket-template.service';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import { MultiFinalsService } from './multi-finals.service';

jest.mock('../slots/tournament-slot.service', () => ({ assignSlotsBatchInTx: jest.fn() }));
const user = { id: 'admin', email: 'admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
function harness() {
  const rules = [1, 2].map(rank => ({ groupId: 'g', rank }));
  const row = { id: 't', kind: 'regular_tournament', format: 'league_knockouts', status: 'in_progress', multiFinalsRevision: 4,
    multiFinals: { groups: [{ id: 'g', name: 'A조', capacity: 2, legs: 1 }], finals: [
      { name: '프리미어', thirdPlace: false, rules, registrationIds: null as string[] | null },
      { name: '챌린지', thirdPlace: false, rules: [], registrationIds: ['r3', 'r4'] as string[] | null },
    ] } };
  let complete = true;
  const fixture = { teamMatchId: 'f', teamMatch: { status: 'matched', game: { state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 0 } } } };
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn(),
    v1Tournament: { findFirst: jest.fn(async () => row), update: jest.fn(async ({ data }) => {
      row.multiFinals = data.multiFinals; row.multiFinalsRevision++;
    }) },
    v1TournamentRegistration: { findMany: jest.fn(async () => ['r1', 'r2', 'r3', 'r4'].map(id => ({ id, team: { id, name: id } }))) },
    v1TournamentGroupTeam: { findMany: jest.fn(async () => ['r1', 'r2'].map(registrationId => ({ groupId: 'g', registrationId, registration: { team: { name: registrationId } } }))) },
    v1TournamentStanding: { findMany: jest.fn(async () => ['r1', 'r2'].map((registrationId, index) => ({ groupId: 'g', registrationId, position: index + 1, wins: index ? 0 : 1, draws: 0, losses: index ? 1 : 0, recalculatedAt: new Date('2026-11-06T00:01:00Z') }))) },
    v1TournamentMatchDetails: { aggregate: jest.fn(async () => ({ _max: { fixtureNumber: 1 } })), count: jest.fn(async () => 2), findMany: jest.fn(async ({ where }) => where.group ? [fixture] : [{ groupId: 'g', homeRegistrationId: 'r1', awayRegistrationId: 'r2', teamMatch: { game: { currentOfficialRevision: complete ? { state: 'OFFICIAL', score: { home: 2, away: 0 }, officialAt: new Date('2026-11-06T00:00:00Z') } : null } } }]) },
    v1TournamentGroup: { count: jest.fn(async () => 2) },
    v1TournamentSlot: { findMany: jest.fn(async ({ where }) => where.group ? [{ id: 's1', position: 1 }, { id: 's2', position: 2 }] : []) },
  };
  const admins = { getTournamentMutationAdmin: jest.fn(async () => ({ id: 'admin' })), logAdminAction: jest.fn() };
  const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService, {} as GamesService, {} as BracketTemplateService);
  const input = { expectedRevision: 4, finalName: '프리미어', registrationIds: ['r1', 'r2'] };
  return { row, tx, admins, service, input, fixture, incomplete: () => { complete = false; } };
}
afterEach(() => jest.clearAllMocks());
describe('토너먼트 하나의 독립 진출팀 확정', () => {
  it('예선이 끝나 추천팀이 있어도 대진 생성은 명단을 자동 확정하지 않는다', async () => {
    const { service } = harness();
    const preview = await service.preview(user, 't');
    expect(preview.finals[0].registrationIds).toBeNull();
    expect(preview.plan.slots).toHaveLength(4);
  });
  it('추천 미리보기는 저장 없이 해당 결선의 공식 순위와 sourceVersion을 반환한다', async () => {
    const { service, tx } = harness();
    const result = await service.assignmentPreview(user, 't', { expectedRevision: 4, finalName: '프리미어', assignmentPolicy: 'rank_order' });
    expect(result.registrationIds).toEqual(['r1', 'r2']);
    expect(result.sourceVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('지원하지 않는 토너먼트의 교차 배치와 낡은 순위 미리보기를 거절한다', async () => {
    const { service, input } = harness();
    await expect(service.assignmentPreview(user, 't', { expectedRevision: 4, finalName: '프리미어', assignmentPolicy: 'cross_group_top3' })).rejects.toThrow();
    await expect(service.assign(user, 't', { ...input, sourceVersion: 'old-source' })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('선택한 결선 자리만 채우고 다른 결선 명단과 설정을 유지한다', async () => {
    const { row, service, input, tx } = harness();
    const other = structuredClone(row.multiFinals.finals[1]);
    const result = await service.assign(user, 't', input);
    expect(result.revision).toBe(5);
    expect(result.finals[0].registrationIds).toEqual(['r1', 'r2']);
    expect(row.multiFinals.finals[1]).toMatchObject(other);
    expect(result.finals[1]).toMatchObject({ colorIndex: 1, id: expect.any(String) });
    expect(assignSlotsBatchInTx).toHaveBeenCalledWith(tx, expect.anything(), [{ slotId: 's1', registrationId: 'r1' }, { slotId: 's2', registrationId: 'r2' }]);
    expect(tx.v1TournamentMatchDetails.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ group: { phase: { not: 'group' }, bracketTrack: '프리미어' } }) }));
  });
  it.each([
    { expectedRevision: 3 }, { finalName: '없는 결선' }, { registrationIds: ['r1'] },
    { registrationIds: ['r1', 'r1'] }, { registrationIds: ['r1', 'r3'] }, { registrationIds: ['r1', '다른 대회 팀'] },
  ])('잘못된 배정은 슬롯 변경 전에 거절한다: %j', async patch => {
    const { service, input, tx } = harness();
    await expect(service.assign(user, 't', { ...input, ...patch })).rejects.toThrow();
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled(); expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
  it('예선 결과가 미완료면 배정하지 않는다', async () => {
    const { service, input, incomplete } = harness(); incomplete();
    await expect(service.assign(user, 't', input)).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_PRELIMINARY_INCOMPLETE' } });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('선택한 결선에 이벤트가 있으면 예정 상태여도 배정하지 않는다', async () => {
    const { service, input, fixture } = harness(); fixture.teamMatch.game._count.events = 1;
    await expect(service.assign(user, 't', input)).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('선택한 결선이 시작됐으면 기록을 보존한다', async () => {
    const { service, input, fixture } = harness(); fixture.teamMatch.game.state = 'LIVE';
    await expect(service.assign(user, 't', input)).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('자리 수나 순서가 다르면 대진을 추측해서 생성하지 않는다', async () => {
    const { service, input, tx } = harness();
    tx.v1TournamentSlot.findMany.mockImplementation(async () => []);
    await expect(service.assign(user, 't', input)).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_BRACKET_REQUIRED' } });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
  it('권한 없는 요청은 트랜잭션 전에 거절한다', async () => {
    const { service, input, admins } = harness(); admins.getTournamentMutationAdmin.mockRejectedValueOnce(new Error('forbidden') as never);
    await expect(service.assign(user, 't', input)).rejects.toThrow('forbidden');
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
});

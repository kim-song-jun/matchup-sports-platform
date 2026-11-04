import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BracketTemplateService } from '../templates/bracket-template.service';
import { MultiFinalsService } from './multi-finals.service';

const user = { id: 'admin', email: 'admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
function harness() {
  const row = { id: 't', kind: 'regular_tournament', format: 'league_knockouts', status: 'open',
    competitionConfigVersionId: 'config', multiFinalsRevision: 2,
    multiFinals: { groups: [{ id: 'g', name: 'A조', capacity: 4, legs: 1 }],
      finals: [{ name: '결선', rules: [{ groupId: 'g', rank: 1 }, { groupId: 'g', rank: 2 }], thirdPlace: false, registrationIds: ['r1', 'r2'] as string[] | null }] } };
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]),
    v1Tournament: { findFirst: jest.fn(async () => row), update: jest.fn(async ({ data }) => {
      row.multiFinals = data.multiFinals; row.multiFinalsRevision++; return row;
    }) },
    v1TournamentMatchDetails: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentMatchAdvancementEdge: { findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentSlot: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentStanding: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentByeSlot: { deleteMany: jest.fn() },
    v1TournamentGroup: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    v1TournamentGroupTeam: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const admins = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'a', userId: user.id }), logAdminAction: jest.fn() };
  const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  return { row, tx, admins, service: new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService, {} as GamesService, {} as BracketTemplateService) };
}
describe('대진 초기화와 별도 예선 수정 보호', () => {
  it.each([
    { status: 'matched', game: { state: 'LIVE', currentOfficialRevisionId: null, _count: { events: 0 } } },
    { status: 'matched', game: { state: 'SCHEDULED', currentOfficialRevisionId: 'result', _count: { events: 0 } } },
    { status: 'matched', game: { state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 1 } } },
    { status: 'completed', game: { state: 'ENDED', currentOfficialRevisionId: null, _count: { events: 0 } } },
    { status: 'matched', game: null },
  ])('시작·결과·이벤트·누락 게임은 삭제 전에 차단한다: %j', async teamMatch => {
    const { tx, service } = harness();
    tx.v1TournamentMatchDetails.findMany.mockResolvedValue([{ teamMatchId: 'fixture', teamMatch }] as never);
    await expect(service.reset(user, 't', { expectedRevision: 2 })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(tx.v1TournamentSlot.deleteMany).not.toHaveBeenCalled();
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
  it.each(['completed', 'cancelled', 'archived'])('%s 대회는 초기화하지 않는다', async status => {
    const { row, tx, service } = harness(); row.status = status;
    await expect(service.reset(user, 't', { expectedRevision: 2 })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(tx.v1TournamentSlot.deleteMany).not.toHaveBeenCalled();
  });
  it('오래된 revision과 권한 없는 관리자는 쓰기 전에 거절한다', async () => {
    const { tx, admins, service } = harness();
    await expect(service.reset(user, 't', { expectedRevision: 1 })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    admins.getMutationAdmin.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.reset(user, 't', { expectedRevision: 2 })).rejects.toThrow('forbidden');
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });
  it('초기화는 조 설정과 진출 규칙을 유지하고 진출 명단·revision을 갱신한다', async () => {
    const { service, row, admins } = harness();
    const result = await service.reset(user, 't', { expectedRevision: 2 });
    expect(result.revision).toBe(3);
    expect(result.groups).toEqual([{ id: 'g', name: 'A조', capacity: 4, legs: 1, registrationIds: [] }]);
    expect(result.preliminaryFixtureCount).toBe(0);
    expect(result.generated).toBe(false);
    expect(row.multiFinals.finals[0].registrationIds).toBeNull();
    expect(result.finals[0].rules).toEqual([{ groupId: 'g', rank: 1 }, { groupId: 'g', rank: 2 }]);
    expect(admins.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'tournament.multi_finals.reset' }), expect.anything());
  });
  it('대진이 있으면 예선 수정으로 우회 삭제할 수 없다', async () => {
    const { tx, service } = harness(); tx.v1TournamentMatchDetails.count.mockResolvedValue(1);
    await expect(service.setup(user, 't', { expectedRevision: 2, groups: [{ name: 'A조', capacity: 2, legs: 1 }], finals: [{ name: '결선', thirdPlace: false, rules: [] }] }, true)).rejects.toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(tx.v1TournamentSlot.deleteMany).not.toHaveBeenCalled();
  });
  it('GroupTeam 생성 순서가 달라도 실제 자리 순서로 hydrate하고 초기화 뒤에도 유지한다', async () => {
    const { tx, service } = harness();
    tx.v1TournamentGroupTeam.findMany.mockResolvedValue([{ groupId: 'g', registrationId: 'r2', registration: { team: { name: '둘' } } }, { groupId: 'g', registrationId: 'r1', registration: { team: { name: '하나' } } }] as never);
    tx.v1TournamentSlot.findMany.mockResolvedValue([{ groupId: 'g', registrationId: 'r1' }, { groupId: 'g', registrationId: 'r2' }, { groupId: 'g', registrationId: null }] as never);
    tx.v1TournamentSlot.deleteMany.mockImplementation(async () => { tx.v1TournamentSlot.findMany.mockResolvedValue([]); });
    const result = await service.reset(user, 't', { expectedRevision: 2 });
    expect(result.groups[0].registrationIds).toEqual(['r1', 'r2']);
  });
});

import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { BracketTemplateService } from '../templates/bracket-template.service';
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config.presets';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import { MultiFinalsService } from './multi-finals.service';

jest.mock('../slots/tournament-slot.service', () => ({ assignSlotsBatchInTx: jest.fn() }));
const user = { id: 'admin', email: 'admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const ASSIGN = 'tournament.multi_finals.assign';
type AuditEntry = { action: string; afterJson: { finalName?: string; registrationIds?: string[]; standingsSnapshot?: unknown } };

// Two 3-team preliminary groups. 프리미어 draws from A조, 챌린지 from B조.
function harness() {
  const members = { gA: ['a1', 'a2', 'a3'], gB: ['b1', 'b2', 'b3'] };
  const all = [...members.gA, ...members.gB];
  const standing = new Map(all.map((id, index) => [id, { groupId: id.startsWith('a') ? 'gA' : 'gB', registrationId: id, position: index % 3 + 1,
    points: 9 - index % 3 * 3, wins: 2 - index % 3, draws: 0, losses: index % 3, goalsFor: 6 - index % 3 * 2, goalsAgainst: index % 3 * 2, fairPlayPoints: 0, recalculatedAt: new Date('2026-11-06T00:01:00Z') }]));
  const rules = (groupId: string) => [1, 2].map(rank => ({ groupId, rank }));
  const row = { id: 't', kind: 'regular_tournament', format: 'league_knockouts', status: 'in_progress', multiFinalsRevision: 1, competitionConfigVersionId: 'cfg', competitionConfig: FOOTBALL_V1_CONFIG,
    multiFinals: { groups: Object.keys(members).map(id => ({ id, name: `${id}조`, capacity: 3, legs: 1 })), finals: [
      { name: '프리미어', thirdPlace: false, rules: rules('gA'), registrationIds: null as string[] | null },
      { name: '챌린지', thirdPlace: false, rules: rules('gB'), registrationIds: null as string[] | null },
    ] } };
  const audit: AuditEntry[] = [];
  const fixture = { teamMatchId: 'f', teamMatch: { status: 'matched', game: { state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 0 } } } };
  const roundRobin = (ids: string[], groupId: string) => [[0, 1], [0, 2], [1, 2]].map(([home, away]) => ({ groupId, homeRegistrationId: ids[home], awayRegistrationId: ids[away],
    teamMatch: { game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 0 }, officialAt: new Date('2026-11-06T00:00:00Z') } } } }));
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn(),
    v1Tournament: { findFirst: jest.fn(async () => row), update: jest.fn(async ({ data }) => { row.multiFinals = data.multiFinals; row.multiFinalsRevision++; }) },
    v1TournamentRegistration: { findMany: jest.fn(async () => all.map(id => ({ id, team: { id, name: id } }))) },
    v1TournamentGroupTeam: { findMany: jest.fn(async () => all.map(id => ({ groupId: id.startsWith('a') ? 'gA' : 'gB', registrationId: id, registration: { team: { name: id } } }))) },
    v1TournamentStanding: { findMany: jest.fn(async () => [...standing.values()].sort((left, right) => left.position - right.position || left.registrationId.localeCompare(right.registrationId))) },
    v1TournamentMatchDetails: { aggregate: jest.fn(async () => ({ _max: { fixtureNumber: 6 } })), count: jest.fn(async () => 8),
      findMany: jest.fn(async ({ where }) => where.group ? [fixture] : [...roundRobin(members.gA, 'gA'), ...roundRobin(members.gB, 'gB')]) },
    v1TournamentGroup: { count: jest.fn(async () => 4) },
    v1TournamentSlot: { findMany: jest.fn(async ({ where }) => where.group ? [{ id: `${where.group.bracketTrack}-1`, position: 1 }, { id: `${where.group.bracketTrack}-2`, position: 2 }] : []) },
    // Mirrors the JSON-path lookup findTournamentManagementAction runs: newest entry of this action for this final.
    v1AdminActionLog: { findFirst: jest.fn(async ({ where }) => {
      const hit = [...audit].reverse().find(entry => entry.action === where.action && entry.afterJson.finalName === where.afterJson.equals);
      return hit ? { id: 'log', afterJson: hit.afterJson, createdAt: new Date() } : null;
    }) },
    v1OperationAudit: { findFirst: jest.fn(async () => null) },
  };
  const admins = { getTournamentAdmin: jest.fn(async () => ({ id: 'admin' })), getTournamentMutationAdmin: jest.fn(async () => ({ id: 'admin' })),
    logAdminAction: jest.fn(async (_admin: unknown, input: { action: string; afterJson: AuditEntry['afterJson'] }) => { audit.push({ action: input.action, afterJson: input.afterJson }); }) };
  const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService, {} as GamesService, {} as BracketTemplateService);
  const changed = async () => Object.fromEntries((await service.get(user, 't')).finals.map(final => [final.name, final.standingsChanged]));
  const swapPositions = (first: string, second: string) => {
    const a = standing.get(first)!; const b = standing.get(second)!;
    [a.position, b.position] = [b.position, a.position];
  };
  const assign = (finalName: string, registrationIds: string[]) => service.assign(user, 't', { expectedRevision: row.multiFinalsRevision, finalName, registrationIds });
  return { row, tx, admins, audit, standing, service, changed, swapPositions, assign };
}
afterEach(() => jest.clearAllMocks());

describe('확정한 결선 배정 뒤 예선 순위 순서가 바뀐 경우의 알림', () => {
  it('배정에 쓴 조의 순위 순서만 감사 기록에 남긴다', async () => {
    const { assign, admins } = harness();
    await assign('프리미어', ['a1', 'a2']);
    expect(admins.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: ASSIGN,
      afterJson: expect.objectContaining({ finalName: '프리미어', registrationIds: ['a1', 'a2'], standingsSnapshot: [{ groupId: 'gA', registrationIds: ['a1', 'a2', 'a3'] }] }) }), expect.anything());
  });
  it('배정 직후와 배정하지 않은 토너먼트는 순위가 그대로라서 알리지 않는다', async () => {
    const { assign, changed } = harness();
    const view = await assign('프리미어', ['a1', 'a2']);
    expect(view.finals.map(final => final.standingsChanged)).toEqual([false, false]);
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: false });
  });
  it('한 조의 3·4위가 뒤바뀌면 그 조를 쓰는 토너먼트만 알리고, 원래대로 되돌리면 알림이 사라진다', async () => {
    const { assign, changed, swapPositions } = harness();
    await assign('프리미어', ['a1', 'a2']); await assign('챌린지', ['b1', 'b2']);
    swapPositions('a2', 'a3');
    expect(await changed()).toEqual({ 프리미어: true, 챌린지: false });
    swapPositions('a2', 'a3');
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: false });
    swapPositions('b1', 'b2');
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: true });
  });
  it('순위가 그대로인 점수 정정은 알리지 않는다', async () => {
    const { assign, changed, standing } = harness();
    await assign('프리미어', ['a1', 'a2']);
    const second = standing.get('a2')!; second.points += 2; second.goalsFor += 3; second.goalsAgainst -= 1;
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: false });
  });
  it('순위 기록이 없는 옛 배정은 비교할 기준이 없어 알리지 않는다', async () => {
    const { row, audit, swapPositions, changed } = harness();
    row.multiFinals.finals[0].registrationIds = ['a1', 'a2'];
    audit.push({ action: ASSIGN, afterJson: { finalName: '프리미어', registrationIds: ['a1', 'a2'] } });
    swapPositions('a2', 'a3');
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: false });
  });
  it('배정 뒤 명단을 다른 경로로 바꿨다면 옛 순위 기록과 비교하지 않는다', async () => {
    const { row, assign, swapPositions, changed } = harness();
    await assign('프리미어', ['a1', 'a2']);
    row.multiFinals.finals[0].registrationIds = ['a1', 'a3'];
    swapPositions('a2', 'a3');
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: false });
  });
  it('조회용 알림 값은 대진 생성 미리보기에 실리지 않아 저장 설정으로 새지 않는다', async () => {
    const { assign, service } = harness();
    await assign('프리미어', ['a1', 'a2']);
    const preview = await service.preview(user, 't');
    expect(preview.finals.map(final => Object.keys(final))).not.toContainEqual(expect.arrayContaining(['standingsChanged']));
  });
  it('다시 배정하면 새 순위를 기준으로 알림이 사라진다', async () => {
    const { assign, changed, swapPositions } = harness();
    await assign('프리미어', ['a1', 'a2']);
    swapPositions('a1', 'a2');
    expect(await changed()).toEqual({ 프리미어: true, 챌린지: false });
    await assign('프리미어', ['a2', 'a1']);
    expect(await changed()).toEqual({ 프리미어: false, 챌린지: false });
    expect(assignSlotsBatchInTx).toHaveBeenCalledTimes(2);
  });
});

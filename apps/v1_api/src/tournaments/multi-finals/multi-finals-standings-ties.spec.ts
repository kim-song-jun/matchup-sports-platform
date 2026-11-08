import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config.presets';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import type { BracketTemplateService } from '../templates/bracket-template.service';
import { planNamedFinals } from './multi-finals-plan';
import { CROSS_GROUP_LANES, validCrossGroupTopThree } from './multi-finals-seeding';
import type { TiePick } from './multi-finals-standings';
import { crossSeedGroups } from './multi-finals-tie-picks';
import { MultiFinalsService } from './multi-finals.service';

jest.mock('../slots/tournament-slot.service', () => ({ assignSlotsBatchInTx: jest.fn() }));
const user = { id: 'admin', email: 'admin@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

type Result = readonly [home: string, away: string, homeScore: number, awayScore: number];
type FinalSpec = { name: string; rules: Array<readonly [groupId: string, rank: number]> };

// Round robin of 4 where a1 > a2 > the rest and the last two (a3, a4) have identical records.
const decided = (prefix: string): Result[] => [
  [`${prefix}1`, `${prefix}2`, 1, 0], [`${prefix}1`, `${prefix}3`, 1, 0], [`${prefix}1`, `${prefix}4`, 1, 0],
  [`${prefix}2`, `${prefix}3`, 1, 0], [`${prefix}2`, `${prefix}4`, 1, 0], [`${prefix}3`, `${prefix}4`, 1, 0],
];
const bottomTied = (prefix: string): Result[] => [
  [`${prefix}1`, `${prefix}2`, 1, 0], [`${prefix}1`, `${prefix}3`, 1, 0], [`${prefix}1`, `${prefix}4`, 1, 0],
  [`${prefix}2`, `${prefix}3`, 1, 0], [`${prefix}2`, `${prefix}4`, 1, 0], [`${prefix}3`, `${prefix}4`, 0, 0],
];
const topTied = (prefix: string): Result[] => [
  [`${prefix}1`, `${prefix}2`, 0, 0], [`${prefix}1`, `${prefix}3`, 1, 0], [`${prefix}1`, `${prefix}4`, 1, 0],
  [`${prefix}2`, `${prefix}3`, 1, 0], [`${prefix}2`, `${prefix}4`, 1, 0], [`${prefix}3`, `${prefix}4`, 1, 0],
];
const allDraws = (prefix: string): Result[] => [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]].map(([home, away]) => [`${prefix}${home}`, `${prefix}${away}`, 0, 0]);

const PREMIER: FinalSpec = { name: '프리미어', rules: [['gA', 1], ['gA', 2], ['gA', 3], ['gB', 1], ['gB', 2], ['gB', 3]] };
const CHALLENGE: FinalSpec = { name: '챌린지', rules: [['gA', 4], ['gB', 4]] };

// 4-team groups gA, gB… (teams a1-a4, b1-b4…). Default: ranks 1-3 go to 프리미어, rank 4 to 챌린지.
// `bracket` serves the generated empty bracket (slots, games, advancement edges) that cross placement checks the picks against.
function harness(results: Record<string, Result[]>, finals: FinalSpec[] = [PREMIER, CHALLENGE], settled = true, bracket = false) {
  const groupIds = Object.keys(results);
  const teams = (groupId: string) => [1, 2, 3, 4].map(n => `${groupId.slice(1).toLowerCase()}${n}`);
  const all = groupIds.flatMap(teams);
  const standings = groupIds.flatMap(groupId => calculateCompetitionStandings({
    tournamentId: 't', configVersionId: 'cfg', registrationIds: teams(groupId), config: FOOTBALL_V1_CONFIG,
    fixtures: results[groupId].map(([home, away, homeScore, awayScore]) => ({ homeRegistrationId: home, awayRegistrationId: away, homeScore, awayScore })),
  }).map(row => ({ ...row, groupId, recalculatedAt: new Date('2026-11-06T00:01:00Z') })));
  const row = { id: 't', kind: 'regular_tournament', format: 'league_knockouts', status: 'in_progress', multiFinalsRevision: 1,
    competitionConfigVersionId: 'cfg', competitionConfig: FOOTBALL_V1_CONFIG,
    multiFinals: { groups: groupIds.map(id => ({ id, name: `${id.slice(1)}조`, capacity: 4, legs: 1 })),
      finals: finals.map(final => ({ name: final.name, thirdPlace: false, rules: final.rules.map(([groupId, rank]) => ({ groupId, rank })), registrationIds: null as string[] | null })) } };
  const fixture = { teamMatchId: 'f', teamMatch: { status: 'matched', game: { state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 0 } } } };
  const official = (groupId: string) => results[groupId].map(([home, away, homeScore, awayScore]) => ({ groupId, homeRegistrationId: home, awayRegistrationId: away,
    teamMatch: { game: { currentOfficialRevision: settled ? { state: 'OFFICIAL', score: { home: homeScore, away: awayScore }, officialAt: new Date('2026-11-06T00:00:00Z') } : null } } }));
  const plan = planNamedFinals(finals.map(final => ({ name: final.name, thirdPlace: false, registrationIds: null, rules: final.rules.map(([groupId, rank]) => ({ groupId, rank })) })));
  const trackOf = (groupKey: string) => plan.groups.find(group => group.key === groupKey)!.bracketTrack;
  const bracketFixtures = (track?: string) => plan.fixtures.filter(f => track === undefined || trackOf(f.groupKey) === track).map(f => ({ teamMatchId: f.key,
    group: { phase: plan.groups.find(group => group.key === f.groupKey)!.phase },
    teamMatch: { status: 'matched', homeSlotId: f.homeSlotKey, awaySlotId: f.awaySlotKey, game: { state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 0 } } },
    advancementTargets: plan.edges.filter(edge => edge.targetFixtureKey === f.key).map(edge => ({ sourceTeamMatchId: edge.sourceFixtureKey, sourceOutcome: edge.outcome })) }));
  const bracketSlots = (track: string) => plan.slots.filter(slot => trackOf(slot.groupKey!) === track).map(slot => ({ id: slot.key, position: slot.position }));
  const audit: Array<{ action: string; afterJson: { finalName?: string } }> = [];
  const tx = {
    $executeRaw: jest.fn(), $queryRaw: jest.fn(),
    v1Tournament: { findFirst: jest.fn(async () => row), update: jest.fn(async ({ data }) => { row.multiFinals = data.multiFinals; row.multiFinalsRevision++; }) },
    v1TournamentRegistration: { findMany: jest.fn(async () => all.map(id => ({ id, team: { id, name: id } }))) },
    v1TournamentGroupTeam: { findMany: jest.fn(async () => groupIds.flatMap(groupId => teams(groupId).map(registrationId => ({ groupId, registrationId, registration: { team: { name: registrationId } } })))) },
    v1TournamentStanding: { findMany: jest.fn(async () => [...standings].sort((left, right) => left.position - right.position || left.registrationId.localeCompare(right.registrationId))) },
    v1TournamentMatchDetails: { aggregate: jest.fn(async () => ({ _max: { fixtureNumber: 12 } })), count: jest.fn(async () => 14),
      findMany: jest.fn(async ({ where }) => where.group ? (bracket ? bracketFixtures(where.group.bracketTrack) : [fixture]) : groupIds.flatMap(official)) },
    v1TournamentGroup: { count: jest.fn(async () => 4) },
    v1TournamentSlot: { findMany: jest.fn(async ({ where }) => {
      if (!where.group) return [];
      if (bracket) return bracketSlots(where.group.bracketTrack);
      return Array.from({ length: finals.find(final => final.name === where.group.bracketTrack)!.rules.length }, (_, index) => ({ id: `${where.group.bracketTrack}-${index + 1}`, position: index + 1 }));
    }) },
    // Newest audit of this action for this final, like the JSON-path lookup findTournamentManagementAction runs.
    v1AdminActionLog: { findFirst: jest.fn(async ({ where }) => {
      const hit = [...audit].reverse().find(entry => entry.action === where.action && entry.afterJson.finalName === where.afterJson.equals);
      return hit ? { id: 'log', afterJson: hit.afterJson, createdAt: new Date() } : null;
    }) },
    v1OperationAudit: { findFirst: jest.fn(async () => null) },
  };
  const admins = { getTournamentAdmin: jest.fn(async () => ({ id: 'admin' })), getTournamentMutationAdmin: jest.fn(async () => ({ id: 'admin' })),
    logAdminAction: jest.fn(async (_admin: unknown, input: { action: string; afterJson: { finalName?: string } }) => { audit.push({ action: input.action, afterJson: input.afterJson }); }) };
  const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  const service = new MultiFinalsService(prisma as unknown as PrismaService, admins as unknown as AdminContextService, {} as GamesService, {} as BracketTemplateService);
  const preview = (finalName: string, assignmentPolicy: 'rank_order' | 'cross_group_top3' = 'rank_order', tiePicks?: TiePick[]) =>
    service.assignmentPreview(user, 't', { expectedRevision: row.multiFinalsRevision, finalName, assignmentPolicy, tiePicks });
  return { row, tx, admins, service, preview, get: () => service.get(user, 't') };
}
afterEach(() => jest.clearAllMocks());

const tiedOf = (view: Awaited<ReturnType<ReturnType<typeof harness>['get']>>, groupId: string) =>
  view.groupStandings.find(group => group.groupId === groupId)!.rows.map(row => [...row.tiedRegistrationIds].sort());
const unresolvedOf = (view: Awaited<ReturnType<ReturnType<typeof harness>['get']>>, finalName: string) =>
  view.finals.find(final => final.name === finalName)!.unresolved.map(rule => ({ groupId: rule.groupId, rank: rule.rank, state: rule.state, tied: [...rule.tiedRegistrationIds].sort() }));

describe('예선 순위가 추첨으로만 갈린 동률의 진출 배정', () => {
  it('전부 0-0 으로 끝난 조는 네 팀이 모두 동률이고 그 조의 모든 진출 자리가 비워진다. 결과가 갈린 다른 조는 그대로다', async () => {
    const { get } = harness({ gA: allDraws('a'), gB: decided('b') });
    const view = await get();
    expect(tiedOf(view, 'gA')).toEqual([['a1', 'a2', 'a3', 'a4'], ['a1', 'a2', 'a3', 'a4'], ['a1', 'a2', 'a3', 'a4'], ['a1', 'a2', 'a3', 'a4']]);
    expect(tiedOf(view, 'gB')).toEqual([[], [], [], []]);
    expect(unresolvedOf(view, '프리미어')).toEqual([1, 2, 3].map(rank => ({ groupId: 'gA', rank, state: 'tied', tied: ['a1', 'a2', 'a3', 'a4'] })));
    expect(unresolvedOf(view, '챌린지')).toEqual([{ groupId: 'gA', rank: 4, state: 'tied', tied: ['a1', 'a2', 'a3', 'a4'] }]);
    const [premier, challenge] = view.finals;
    expect(premier.suggestedRegistrationIds).toEqual(['b1', 'b2', 'b3']);
    expect(challenge.suggestedRegistrationIds).toEqual(['b4']);
    expect(view.groupStandings.every(group => group.complete)).toBe(true);
  });

  it('동률이 없는 대회는 어떤 자리도 비우지 않는다', async () => {
    const { get } = harness({ gA: decided('a'), gB: decided('b') });
    const view = await get();
    expect(view.finals.map(final => final.unresolved)).toEqual([[], []]);
    expect(view.finals[0].suggestedRegistrationIds).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
    expect(view.groupStandings.flatMap(group => group.rows.map(row => row.tiedRegistrationIds))).toEqual(Array(8).fill([]));
  });

  it('프리미어(3위)와 챌린지(4위)에 걸친 동률은 두 토너먼트 모두 그 자리를 비운다. 다른 조 자리는 채운다', async () => {
    const { get } = harness({ gA: bottomTied('a'), gB: decided('b') });
    const view = await get();
    expect(tiedOf(view, 'gA')).toEqual([[], [], ['a3', 'a4'], ['a3', 'a4']]);
    expect(unresolvedOf(view, '프리미어')).toEqual([{ groupId: 'gA', rank: 3, state: 'tied', tied: ['a3', 'a4'] }]);
    expect(unresolvedOf(view, '챌린지')).toEqual([{ groupId: 'gA', rank: 4, state: 'tied', tied: ['a3', 'a4'] }]);
    expect(view.finals[0].suggestedRegistrationIds).toEqual(['a1', 'a2', 'b1', 'b2', 'b3']);
    expect(view.finals[1].suggestedRegistrationIds).toEqual(['b4']);
  });

  it('같은 토너먼트 안에서 시드를 바꾸는 동률(1·2위)도 비운다', async () => {
    const { get } = harness({ gA: decided('a'), gB: topTied('b') });
    const view = await get();
    expect(unresolvedOf(view, '프리미어')).toEqual([1, 2].map(rank => ({ groupId: 'gB', rank, state: 'tied', tied: ['b1', 'b2'] })));
    expect(unresolvedOf(view, '챌린지')).toEqual([]);
  });

  it('추천 미리보기는 409 로 막히지 않고 동률 자리를 null 로 비운 채 sourceVersion 과 함께 돌아온다', async () => {
    const { preview, tx } = harness({ gA: bottomTied('a'), gB: decided('b') });
    const premier = await preview('프리미어');
    expect(premier.registrationIds).toEqual(['a1', 'a2', null, 'b1', 'b2', 'b3']);
    expect(premier.sourceVersion).toMatch(/^[0-9a-f]{64}$/);
    expect((await preview('챌린지')).registrationIds).toEqual([null, 'b4']);
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('동률이 없는 토너먼트의 추천은 전과 같이 빈 자리 없이 돌아온다', async () => {
    const { preview } = harness({ gA: decided('a'), gB: decided('b') });
    expect((await preview('프리미어')).registrationIds).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
  });

  it('다른 조의 동률은 이 토너먼트의 추천을 비우지 않는다', async () => {
    // 챌린지 only draws from rank 4 of both groups; group B's tie is in ranks 1-2, so it must not blank 챌린지.
    const { preview } = harness({ gA: decided('a'), gB: topTied('b') });
    expect((await preview('챌린지')).registrationIds).toEqual(['a4', 'b4']);
  });

  it('운영자가 비워진 자리에 동률 팀을 직접 골라 확정하면 성공하고 저장된다', async () => {
    const { preview, service, row, tx } = harness({ gA: bottomTied('a'), gB: decided('b') });
    const { sourceVersion } = await preview('프리미어');
    const ids = ['a1', 'a2', 'a4', 'b1', 'b2', 'b3'];
    const view = await service.assign(user, 't', { expectedRevision: 1, finalName: '프리미어', registrationIds: ids, assignmentPolicy: 'rank_order', sourceVersion });
    expect(view.finals[0].registrationIds).toEqual(ids);
    expect(row.multiFinals.finals[0].registrationIds).toEqual(ids);
    expect(assignSlotsBatchInTx).toHaveBeenCalledWith(tx, expect.anything(), ids.map((registrationId, index) => ({ slotId: `프리미어-${index + 1}`, registrationId })));
  });

  it('동률이 있어도 sourceVersion 없이 낡은 값으로 확정하려 하면 여전히 거절한다', async () => {
    const { service } = harness({ gA: bottomTied('a'), gB: decided('b') });
    await expect(service.assign(user, 't', { expectedRevision: 1, finalName: '프리미어', registrationIds: ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'], sourceVersion: 'old' }))
      .rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });

  it('예선 결과가 덜 끝난 조는 동률이 아니라 미완료로 막힌다', async () => {
    const { preview, get } = harness({ gA: bottomTied('a'), gB: decided('b') }, [PREMIER, CHALLENGE], false);
    await expect(preview('프리미어')).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_PRELIMINARY_INCOMPLETE' } });
    expect((await get()).finals.flatMap(final => final.unresolved.map(rule => rule.state))).not.toContain('tied');
  });
});

describe('동률이 있는 조가 낀 교차 배치', () => {
  // 4 groups x ranks 1-3 → the 12-team tournament cross_group_top3 supports. Rules are stored rank first, then group order.
  const CROSS: FinalSpec = { name: '프리미어', rules: [1, 2, 3].flatMap(rank => ['gA', 'gB', 'gC', 'gD'].map(groupId => [groupId, rank] as const)) };
  const THIRD_SEATS = CROSS_GROUP_LANES.map(lane => lane.third - 1);
  // B's 3rd and 4th place (b3, b4) were separated only by the draw, so B's rank 3 is open.
  const withTie = (bracket = false) => harness({ gA: decided('a'), gB: bottomTied('b'), gC: decided('c'), gD: decided('d') }, [CROSS], true, bracket);
  // B's 1st and 2nd place (b1, b2) were separated only by the draw: B's ranks 1 and 2 are open.
  const withTopTie = () => harness({ gA: decided('a'), gB: topTied('b'), gC: decided('c'), gD: decided('d') }, [CROSS], true, true);
  const groupsOf = (view: Awaited<ReturnType<ReturnType<typeof harness>['get']>>) => view.groups.map(group => ({ id: group.id, ranks: [1, 2, 3].flatMap(rank => {
    const row = view.groupStandings.find(standing => standing.groupId === group.id)?.rows.find(row => row.position === rank);
    return row ? [row.registrationId] : [];
  }) }));
  const rejected = async (run: Promise<unknown>) => run.then(() => { throw new Error('expected a rejection'); }, (error: { getStatus(): number; getResponse(): { code: string } }) => error);

  it('3위 자리가 동률이어도 누가 3위인지 고르지 않았으면 교차 배치 추천을 만들지 않는다', async () => {
    const { preview, tx } = withTie();
    const error = await rejected(preview('프리미어', 'cross_group_top3'));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({ code: 'MULTI_FINAL_RANK_TIED', message: '동률 자리에 올릴 팀을 먼저 골라 주세요.' });
    expect(tx.v1Tournament.update).not.toHaveBeenCalled();
  });

  it('동률 자리에 올릴 팀을 고르면 추천이 만들어지고 고른 팀이 그 조 3위 칸에 앉는다. 안 고른 팀은 빠진다', async () => {
    for (const [picked, left] of [['b4', 'b3'], ['b3', 'b4']]) {
      const { preview, get } = withTie(true);
      const view = await get();
      const expected = groupsOf(view).map(group => group.id === 'gB' ? { ...group, ranks: ['b1', 'b2', picked] } : group);
      // The third-place draw is random: every draw must keep the picked team in a 3rd-place seat and the rest of the lanes fixed.
      for (let draw = 0; draw < 12; draw++) {
        const { registrationIds } = await preview('프리미어', 'cross_group_top3', [{ groupId: 'gB', rank: 3, registrationId: picked }]);
        const seeds = registrationIds as string[];
        expect(new Set(seeds).size).toBe(12);
        expect(seeds).not.toContain(left);
        expect(THIRD_SEATS.map(seat => seeds[seat])).toContain(picked);
        expect(validCrossGroupTopThree(expected, seeds)).toBe(true);
      }
    }
  });

  it('1·2위가 동률이면 고른 순서대로 부전승 칸과 교차 상대 칸에 앉고, 한 자리라도 안 골랐으면 409 로 막는다', async () => {
    const { preview } = withTopTie();
    const picks = [{ groupId: 'gB', rank: 1, registrationId: 'b2' }, { groupId: 'gB', rank: 2, registrationId: 'b1' }];
    const seeds = (await preview('프리미어', 'cross_group_top3', picks)).registrationIds as string[];
    // B is the second lane: its winner takes seed 2 (a bye), its runner-up faces A's winner in A's 12-team game.
    expect(seeds[1]).toBe('b2');
    expect(seeds[CROSS_GROUP_LANES[0].second - 1]).toBe('b1');
    expect((await preview('프리미어', 'cross_group_top3', [{ groupId: 'gB', rank: 1, registrationId: 'b1' }, { groupId: 'gB', rank: 2, registrationId: 'b2' }])).registrationIds).toEqual(
      expect.arrayContaining(['b1', 'b2']));
    for (const partial of [[], picks.slice(0, 1), picks.slice(1)]) {
      expect((await rejected(preview('프리미어', 'cross_group_top3', partial))).getResponse()).toMatchObject({ code: 'MULTI_FINAL_RANK_TIED' });
    }
  });

  it('동률 팀이 아닌 팀·동률이 아닌 자리·같은 팀 두 번·같은 자리 두 번은 422 로 거절한다', async () => {
    const { preview } = withTopTie();
    const invalid = [
      [{ groupId: 'gB', rank: 1, registrationId: 'a1' }, { groupId: 'gB', rank: 2, registrationId: 'b1' }],
      [{ groupId: 'gA', rank: 1, registrationId: 'a1' }, { groupId: 'gB', rank: 1, registrationId: 'b1' }, { groupId: 'gB', rank: 2, registrationId: 'b2' }],
      [{ groupId: 'gB', rank: 1, registrationId: 'b1' }, { groupId: 'gB', rank: 2, registrationId: 'b1' }],
      [{ groupId: 'gB', rank: 1, registrationId: 'b1' }, { groupId: 'gB', rank: 1, registrationId: 'b2' }, { groupId: 'gB', rank: 2, registrationId: 'b2' }],
    ];
    for (const picks of invalid) {
      const error = await rejected(preview('프리미어', 'cross_group_top3', picks));
      expect(error.getStatus()).toBe(422);
      expect(error.getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID' });
    }
  });

  it('기본 순위 순서 미리보기는 고른 팀이 없어도 동률 자리를 null 로 두고, 잘못 고른 팀은 거절한다', async () => {
    const { preview } = withTie();
    expect((await preview('프리미어', 'rank_order')).registrationIds).toEqual(['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2', 'a3', null, 'c3', 'd3']);
    expect((await preview('프리미어', 'rank_order', [{ groupId: 'gB', rank: 3, registrationId: 'b4' }])).registrationIds).toEqual(['a1', 'b1', 'c1', 'd1', 'a2', 'b2', 'c2', 'd2', 'a3', null, 'c3', 'd3']);
    expect((await rejected(preview('프리미어', 'rank_order', [{ groupId: 'gB', rank: 3, registrationId: 'a1' }]))).getStatus()).toBe(422);
  });

  it('동률이 없으면 고른 팀 없이도 예전 조별 1~3위로 교차 배치가 만들어진다', async () => {
    const { preview, get } = harness({ gA: decided('a'), gB: decided('b'), gC: decided('c'), gD: decided('d') }, [CROSS], true, true);
    const view = await get();
    const [premier] = view.finals;
    expect(premier.unresolved).toEqual([]);
    expect(premier.tiePicks).toEqual([]);
    expect(crossSeedGroups(premier, view.groups.map(group => group.id))).toEqual(groupsOf(view));
    const { registrationIds } = await preview('프리미어', 'cross_group_top3');
    expect(validCrossGroupTopThree(groupsOf(view), registrationIds as string[])).toBe(true);
    expect(await preview('프리미어', 'cross_group_top3', [])).toMatchObject({ assignmentPolicy: 'cross_group_top3' });
    expect((await rejected(preview('프리미어', 'cross_group_top3', [{ groupId: 'gB', rank: 3, registrationId: 'b3' }]))).getStatus()).toBe(422);
  });

  it('고른 팀으로 교차 배치를 확정하면 감사 기록에 남고 조회가 그 선택을 돌려준다', async () => {
    const { preview, service, admins, tx, get } = withTie(true);
    const picks: TiePick[] = [{ groupId: 'gB', rank: 3, registrationId: 'b4' }];
    const recommended = await preview('프리미어', 'cross_group_top3', picks);
    const seeds = recommended.registrationIds as string[];
    const view = await service.assign(user, 't', { expectedRevision: 1, finalName: '프리미어', registrationIds: seeds, assignmentPolicy: 'cross_group_top3', sourceVersion: recommended.sourceVersion, tiePicks: picks });
    expect(assignSlotsBatchInTx).toHaveBeenCalledWith(tx, expect.anything(), seeds.map((registrationId, index) => ({ slotId: `seed:0:${index}`, registrationId })));
    expect(admins.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'tournament.multi_finals.assign',
      afterJson: expect.objectContaining({ finalName: '프리미어', assignmentPolicy: 'cross_group_top3', tiePicks: picks }) }), tx);
    expect(view.finals[0].tiePicks).toEqual(picks);
    expect((await get()).finals[0].tiePicks).toEqual(picks);
  });

  it('고른 팀이 명단에 없거나 명단이 고른 팀 기준 배치와 다르면 확정하지 않는다', async () => {
    const { preview, service } = withTie(true);
    const picks: TiePick[] = [{ groupId: 'gB', rank: 3, registrationId: 'b4' }];
    const recommended = await preview('프리미어', 'cross_group_top3', picks);
    const seeds = recommended.registrationIds as string[];
    const assign = (registrationIds: string[], tiePicks: TiePick[]) => service.assign(user, 't', { expectedRevision: 1, finalName: '프리미어', registrationIds,
      assignmentPolicy: 'cross_group_top3', sourceVersion: recommended.sourceVersion, tiePicks });
    // b3 is picked but b4 holds the seat.
    expect((await rejected(assign(seeds, [{ groupId: 'gB', rank: 3, registrationId: 'b3' }]))).getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID' });
    // Winners and runners-up may not trade seats.
    expect((await rejected(assign([seeds[1], seeds[0], ...seeds.slice(2)], picks))).getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID' });
    expect((await rejected(assign(seeds, []))).getResponse()).toMatchObject({ code: 'MULTI_FINAL_RANK_TIED' });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });

  it('기본 순위 순서로 확정할 때 고른 팀도 같이 남기고, 명단을 다른 경로로 바꾸면 조회에서 사라진다', async () => {
    const { preview, service, row } = harness({ gA: bottomTied('a'), gB: decided('b') });
    const { sourceVersion } = await preview('프리미어');
    const ids = ['a1', 'a2', 'a4', 'b1', 'b2', 'b3'];
    const picks: TiePick[] = [{ groupId: 'gA', rank: 3, registrationId: 'a4' }];
    const view = await service.assign(user, 't', { expectedRevision: 1, finalName: '프리미어', registrationIds: ids, assignmentPolicy: 'rank_order', sourceVersion, tiePicks: picks });
    expect(view.finals.map(final => final.tiePicks)).toEqual([picks, []]);
    row.multiFinals.finals[0].registrationIds = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
    expect((await service.get(user, 't')).finals[0].tiePicks).toEqual([]);
  });

  it('명단에 없는 팀을 고른 확정과 동률이 아닌 자리를 고른 확정은 거절한다', async () => {
    const { preview, service } = harness({ gA: bottomTied('a'), gB: decided('b') });
    const { sourceVersion } = await preview('프리미어');
    const assign = (registrationIds: string[], tiePicks: TiePick[]) => service.assign(user, 't', { expectedRevision: 1, finalName: '프리미어', registrationIds, assignmentPolicy: 'rank_order', sourceVersion, tiePicks });
    expect((await rejected(assign(['a1', 'a2', 'a4', 'b1', 'b2', 'b3'], [{ groupId: 'gA', rank: 3, registrationId: 'a3' }]))).getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID' });
    expect((await rejected(assign(['a1', 'a2', 'a4', 'b1', 'b2', 'b3'], [{ groupId: 'gB', rank: 1, registrationId: 'b1' }]))).getResponse()).toMatchObject({ code: 'MULTI_FINAL_INVALID' });
    expect(assignSlotsBatchInTx).not.toHaveBeenCalled();
  });
});

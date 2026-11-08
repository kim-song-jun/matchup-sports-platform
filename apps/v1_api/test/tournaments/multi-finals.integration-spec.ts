import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { CROSS_GROUP_LANES } from '../../src/tournaments/multi-finals/multi-finals-seeding';
import { MultiFinalsService } from '../../src/tournaments/multi-finals/multi-finals.service';
import { TournamentAwardSetsService } from '../../src/tournaments/tournament-award-sets.service';
import { recalculateStandingsInTx } from '../../src/tournaments/tournament-bracket-tx';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import type { MultiFinalSelectionDto } from '../../src/tournaments/multi-finals/multi-finals.dto';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'multi-finals@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const admins = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const templates = new BracketTemplateService(prisma, admins, games);
const service = new MultiFinalsService(prisma, admins, games, templates);
const awards = new TournamentAwardSetsService(prisma, admins);
let tournamentId: string; let registrationIds: string[];

async function setup() {
  return service.setup(user, tournamentId, { expectedRevision: 0, groups: [0, 1].map(i => ({ name: `${i + 1}조`, capacity: 5, legs: 1 as const, registrationIds: registrationIds.slice(i * 5, i * 5 + 5) })),
    finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }], registrationIds: null }] });
}
/** Recommendations from tie-free results never leave a seed open. */
function settledSeeds(seeds: ReadonlyArray<string | null>): string[] {
  expect(seeds).not.toContain(null);
  return seeds as string[];
}
/** `tied` draws every game 0-0, or only the games whose home team is in the set; all other games are won by the earlier-listed team. */
async function finishPreliminary(tied: boolean | ReadonlySet<string> = false) {
  const drawn = (homeId: string | null) => tied === true || tied instanceof Set && homeId !== null && tied.has(homeId);
  const rows = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: 'group' } }, include: { teamMatch: { include: { game: true } } } });
  for (const row of rows) {
    const game = row.teamMatch.game!;
    const revision = await prisma.v1GameResultRevision.create({ data: { gameId: game.id, revision: 1, state: 'OFFICIAL',
      score: drawn(row.homeRegistrationId) ? { home: 0, away: 0 } : { home: registrationIds.length - registrationIds.indexOf(row.homeRegistrationId!), away: registrationIds.length - registrationIds.indexOf(row.awayRegistrationId!) },
      goalEvents: [], missingScorer: true, eventsHash: `multi-${game.id}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'GAME_BACKFILL', officialAt: new Date(), submittedAt: new Date() } });
    await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
    await prisma.v1TeamMatch.update({ where: { id: row.teamMatchId }, data: { status: 'completed' } });
  }
  await prisma.$transaction(tx => recalculateStandingsInTx(tx, tournamentId));
}
async function preliminarySnapshot() {
  return prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: 'group' } }, orderBy: { fixtureNumber: 'asc' },
    select: { teamMatchId: true, homeRegistrationId: true, awayRegistrationId: true, teamMatch: { select: { deletedAt: true, game: { select: { currentOfficialRevisionId: true, state: true } } } } } });
}

async function assignedDirector() {
  const actor = { ...user, id: randomUUID(), email: `director-${randomUUID()}@example.test` };
  await prisma.v1User.create({ data: actor });
  const grant = await prisma.v1TournamentStaffAssignment.create({ data: {
    tournamentId, userId: actor.id, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: user.id,
  } });
  return { actor, grant };
}

describe('N개 결선 실제 DB 저장·공식 순위·수동 편집·재생성', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => {
    tournamentId = randomUUID();
    await prisma.v1Tournament.create({ data: { id: tournamentId, kind: 'regular_tournament', format: 'league_knockouts', sportId: ids.soccerSportId, title: 'N개 결선 검증', teamCount: 10, competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' } });
    registrationIds = [];
    for (let i = 0; i < 10; i++) {
      const team = await prisma.v1Team.create({ data: { ownerUserId: user.id, sportId: ids.soccerSportId, regionId: ids.regionId, name: `검증 팀 ${i + 1}` } });
      const reg = await prisma.v1TournamentRegistration.create({ data: { tournamentId, teamId: team.id, appliedByUserId: user.id, status: 'confirmed' } }); registrationIds.push(reg.id);
    }
  });
  it('5개 조·11팀 예선 275경기를 기존 템플릿 상한 없이 실제 저장한다', async () => {
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { teamCount: 55 } });
    const view = await service.setup(user, tournamentId, { expectedRevision: 0,
      groups: Array.from({ length: 5 }, (_, i) => ({ name: `${i + 1}조`, capacity: 11, legs: 1 as const })),
      finals: [{ name: '챔피언', thirdPlace: false, rules: [], registrationIds: null }] });
    expect(view.groups).toHaveLength(5);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, teamMatch: { deletedAt: null } } })).toBe(275);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'ENTRY' } })).toBe(55);
  }, 60000);
  it('예선 미완료는 자동 진출을 확정하지 않고 공식 결과 후 조별 1위를 제안한다', async () => {
    const first = await setup(); expect(first.finals[0].unresolved).toHaveLength(2);
    const pending = await service.preview(user, tournamentId);
    expect(pending.finals[0].registrationIds).toBeNull();
    expect(pending.plan.slots).toHaveLength(2);
    await service.generate(user, tournamentId, { expectedRevision: pending.revision, previewHash: pending.previewHash, requestId: randomUUID() });
    const before = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } } });
    const scheduledAt = new Date('2026-12-01T09:00:00Z');
    await prisma.v1TeamMatch.update({ where: { id: before.teamMatchId }, data: { startAt: scheduledAt } });
    await finishPreliminary();
    const view = await service.get(user, tournamentId);
    expect(view.finals[0].suggestedRegistrationIds).toEqual([registrationIds[0], registrationIds[5]]);
    expect(view.finals[0].manual).toBe(false);
    expect(view.groupStandings.every(group => group.complete)).toBe(true);
    expect(view.groupStandings.map(group => group.rows.length)).toEqual([5, 5]);
    const fill = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: fill.revision, previewHash: fill.previewHash, requestId: randomUUID() });
    const unassigned = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } } });
    expect([unassigned.homeRegistrationId, unassigned.awayRegistrationId]).toEqual([null, null]);
    const current = await service.get(user, tournamentId);
    const assignment = await service.assignmentPreview(user, tournamentId, {
      expectedRevision: current.revision, finalName: '챔피언', assignmentPolicy: 'rank_order',
    });
    await service.assign(user, tournamentId, {
      expectedRevision: assignment.revision, finalName: assignment.finalName,
      registrationIds: settledSeeds(assignment.registrationIds), assignmentPolicy: assignment.assignmentPolicy,
      sourceVersion: assignment.sourceVersion,
    });
    const after = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } }, include: { teamMatch: true } });
    expect(after.teamMatchId).toBe(before.teamMatchId);
    expect(after.teamMatch.startAt).toEqual(scheduledAt);
    expect([after.homeRegistrationId, after.awayRegistrationId]).toEqual([registrationIds[0], registrationIds[5]]);
  });
  it('규칙 없는 capacity로 먼저 생성하고 이후 규칙 연결과 실제 팀 확정을 별도로 수행한다', async () => {
    const first = await service.setup(user, tournamentId, { expectedRevision: 0,
      groups: [0, 1].map(i => ({ name: `${i + 1}조`, capacity: 5, legs: 1 as const, registrationIds: registrationIds.slice(i * 5, i * 5 + 5) })),
      finals: [{ name: '프리미어', capacity: 6, rules: [], thirdPlace: false, registrationIds: null }] });
    const preview = await service.preview(user, tournamentId);
    expect(preview.plan.slots).toHaveLength(6);
    await service.generate(user, tournamentId, { expectedRevision: first.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    const idsBefore = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: { not: 'group' } } }, orderBy: { fixtureNumber: 'asc' }, select: { teamMatchId: true } });
    // 2026-11-06: 6팀 첫 라운드는 틀 기준 '8강'이 아니라 대회 규정의 '6강'으로 저장된다(단계 코드는 틀 기준 그대로).
    const knockoutGroups = await prisma.v1TournamentGroup.findMany({ where: { tournamentId, phase: { not: 'group' } }, orderBy: { sortOrder: 'asc' }, select: { name: true, phase: true } });
    expect(knockoutGroups).toEqual([{ name: '프리미어 · 6강', phase: 'quarter' }, { name: '프리미어 · 4강', phase: 'semi' }, { name: '프리미어 · 결승', phase: 'final' }]);
    const firstRound = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { name: '프리미어 · 6강' } }, select: { round: true } });
    expect(firstRound.map(row => row.round)).toEqual(['6강', '6강']);
    // 배포 전에 만든 결선은 첫 라운드 이름이 틀 기준('8강')이다 — 이름이 달라도 같은 구조면 기존 대진을 지우지 않는다.
    await prisma.v1TournamentGroup.updateMany({ where: { tournamentId, name: '프리미어 · 6강' }, data: { name: '프리미어 · 8강' } });
    const regenerate = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: regenerate.revision, previewHash: regenerate.previewHash, requestId: randomUUID() });
    expect(await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: { not: 'group' } } }, orderBy: { fixtureNumber: 'asc' }, select: { teamMatchId: true } })).toEqual(idsBefore);
    const current = await service.get(user, tournamentId);
    expect(current.finals[0].capacity).toBe(6);
    const rules = current.groups.flatMap(group => [1, 2, 3].map(rank => ({ groupId: group.id, rank })));
    await service.select(user, tournamentId, { expectedRevision: current.revision, finals: [{ ...current.finals[0], rules }] });
    await finishPreliminary();
    const ready = await service.get(user, tournamentId);
    expect(ready.finals[0].registrationIds).toBeNull();
    // Rules were submitted group by group (A1, A2, A3, B1, ...); saving orders them rank first, so the group winners take seeds 1-2 (the byes).
    expect(ready.finals[0].rules.map(rule => rule.rank)).toEqual([1, 1, 2, 2, 3, 3]);
    const suggestion = await service.assignmentPreview(user, tournamentId, { expectedRevision: ready.revision, finalName: '프리미어', assignmentPolicy: 'rank_order' });
    expect(suggestion.registrationIds).toEqual([0, 5, 1, 6, 2, 7].map(index => registrationIds[index]));
    const filled = await service.assign(user, tournamentId, { expectedRevision: ready.revision, finalName: '프리미어', registrationIds: settledSeeds(suggestion.registrationIds), sourceVersion: suggestion.sourceVersion });
    expect(filled.finals[0].registrationIds).toHaveLength(6);
    const byeSeeds = await prisma.v1TournamentSlot.findMany({ where: { tournamentId, kind: 'GROUP_RANK', byeSortOrder: { not: null }, group: { bracketTrack: '프리미어', phase: { not: 'group' } } },
      orderBy: { position: 'asc' }, select: { position: true, registrationId: true } });
    expect(byeSeeds).toEqual([{ position: 1, registrationId: registrationIds[0] }, { position: 2, registrationId: registrationIds[5] }]);
    const idsAfter = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: { not: 'group' } } }, orderBy: { fixtureNumber: 'asc' }, select: { teamMatchId: true } });
    expect(idsAfter).toEqual(idsBefore);
  });
  it('한 결선을 확정해도 다른 빈 결선과 예선을 보존하고, 시작한 다른 결선에 영향 없이 나머지를 확정한다', async () => {
    const first = await service.setup(user, tournamentId, { expectedRevision: 0,
      groups: [0, 1].map(i => ({ name: `${i + 1}조`, capacity: 5, legs: 1 as const, registrationIds: registrationIds.slice(i * 5, i * 5 + 5) })),
      finals: [
        { name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }], registrationIds: null },
        { name: '챌린지', thirdPlace: false, rules: [0, 1].flatMap(i => [2, 3, 4, 5].map(rank => ({ groupId: String(i), rank }))), registrationIds: null },
      ] });
    const preview = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: first.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    await finishPreliminary();
    const beforePreliminary = await preliminarySnapshot();
    const snapshot = (track: string) => prisma.v1TournamentMatchDetails.findMany({
      where: { tournamentId, group: { bracketTrack: track }, teamMatch: { deletedAt: null } },
      orderBy: { fixtureNumber: 'asc' }, include: { teamMatch: { include: { game: true } } },
    });
    const challengeBefore = await snapshot('챌린지');
    const current = await service.get(user, tournamentId);
    const result = await service.assign(user, tournamentId, { expectedRevision: current.revision, finalName: '챔피언', registrationIds: [registrationIds[0], registrationIds[5]] });
    const champion = await snapshot('챔피언');
    expect([champion[0].homeRegistrationId, champion[0].awayRegistrationId]).toEqual([registrationIds[0], registrationIds[5]]);
    expect(await snapshot('챌린지')).toEqual(challengeBefore);
    expect(result.finals[1].registrationIds).toBeNull();
    await prisma.v1Game.update({ where: { id: champion[0].teamMatch.game!.id }, data: { state: 'LIVE' } });
    const championBefore = await snapshot('챔피언');
    const remaining = registrationIds.filter((_, index) => index !== 0 && index !== 5);
    const next = await service.assign(user, tournamentId, { expectedRevision: result.revision, finalName: '챌린지', registrationIds: remaining });
    expect(next.finals[1].registrationIds).toEqual(remaining);
    expect(await snapshot('챔피언')).toEqual(championBefore);
    expect(await preliminarySnapshot()).toEqual(beforePreliminary);
    const filled = await prisma.v1TournamentSlot.findMany({ where: { tournamentId, kind: 'GROUP_RANK', group: { bracketTrack: '챌린지' } }, orderBy: { position: 'asc' } });
    expect(filled.map(slot => slot.registrationId)).toEqual(remaining);
    expect((await snapshot('챌린지')).map(row => row.teamMatchId)).toEqual(challengeBefore.map(row => row.teamMatchId));
  });
  it.each([false, true])('확정한 뒤 한 조의 순위 순서가 바뀌면 그 조를 쓰는 토너먼트만 standingsChanged 로 알린다 (director=%s)', async director => {
    const actor = director ? (await assignedDirector()).actor : user;
    const first = await service.setup(user, tournamentId, { expectedRevision: 0,
      groups: [0, 1].map(i => ({ name: `${i + 1}조`, capacity: 5, legs: 1 as const, registrationIds: registrationIds.slice(i * 5, i * 5 + 5) })),
      finals: [0, 1].map(i => ({ name: i ? '챌린지' : '챔피언', thirdPlace: false, rules: [1, 2].map(rank => ({ groupId: String(i), rank })), registrationIds: null })) });
    const preview = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: first.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    await finishPreliminary();
    for (const finalName of ['챔피언', '챌린지']) {
      const current = await service.get(actor, tournamentId);
      const suggestion = await service.assignmentPreview(actor, tournamentId, { expectedRevision: current.revision, finalName, assignmentPolicy: 'rank_order' });
      await service.assign(actor, tournamentId, { expectedRevision: current.revision, finalName, registrationIds: settledSeeds(suggestion.registrationIds), sourceVersion: suggestion.sourceVersion });
    }
    const flags = async () => (await service.get(actor, tournamentId)).finals.map(final => final.standingsChanged);
    expect(await flags()).toEqual([false, false]);
    const groupId = (await service.get(actor, tournamentId)).groups[0].id;
    const at = (position: number) => prisma.v1TournamentStanding.findFirstOrThrow({ where: { groupId, position } });
    const [third, fourth] = [await at(3), await at(4)];
    await prisma.v1TournamentStanding.update({ where: { id: third.id }, data: { points: { increment: 1 } } });
    expect(await flags()).toEqual([false, false]);
    const swap = (a: string, b: string) => prisma.$transaction([
      prisma.v1TournamentStanding.update({ where: { id: a }, data: { position: 4 } }),
      prisma.v1TournamentStanding.update({ where: { id: b }, data: { position: 3 } }),
    ]);
    await swap(third.id, fourth.id);
    expect(await flags()).toEqual([true, false]);
    await prisma.v1TournamentStanding.update({ where: { id: third.id }, data: { position: 3 } });
    await prisma.v1TournamentStanding.update({ where: { id: fourth.id }, data: { position: 4 } });
    expect(await flags()).toEqual([false, false]);
  }, 60000);
  it('순위 밖 팀을 포함해 3개 결선 명단을 저장하고 재계산 뒤에도 유지하며 예선을 보존한다', async () => {
    const first = await setup(); await finishPreliminary(); const before = await preliminarySnapshot();
    const finals = [
      { name: '챔피언', rules: first.finals[0].rules, thirdPlace: false, registrationIds: registrationIds.slice(2, 5) },
      { name: '챌린지', rules: [], thirdPlace: false, registrationIds: [registrationIds[0], registrationIds[1], registrationIds[5]] },
      { name: '프렌즈', rules: [], thirdPlace: true, registrationIds: registrationIds.slice(6, 10) },
    ];
    const saved = await service.select(user, tournamentId, { expectedRevision: first.revision, finals });
    expect(saved.finals).toMatchObject([{ colorIndex: 0 }, { colorIndex: 1 }, { colorIndex: 2 }]);
    await prisma.$transaction(tx => recalculateStandingsInTx(tx, tournamentId));
    expect((await service.get(user, tournamentId)).finals.map(f => f.registrationIds)).toEqual(finals.map(f => f.registrationIds));
    const preview = await service.preview(user, tournamentId); expect(preview.counts).toEqual({ tournaments: 3, fixtures: 8, byes: 2 });
    expect(preview.plan.fixtures.map(f => f.fixtureNumber)).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
    const dto = { expectedRevision: saved.revision, previewHash: preview.previewHash, requestId: randomUUID() };
    const generated = await service.generate(user, tournamentId, dto); expect(generated.replayed).toBe(false);
    expect((await service.generate(user, tournamentId, dto)).replayed).toBe(true);
    expect(await preliminarySnapshot()).toEqual(before);
    const generatedFixtures = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } }, orderBy: { fixtureNumber: 'asc' }, select: { fixtureNumber: true } });
    expect(generatedFixtures.map(f => f.fixtureNumber)).toEqual(preview.plan.fixtures.map(f => f.fixtureNumber));
    expect((await service.preview(user, tournamentId)).plan.fixtures.map(f => f.fixtureNumber)).toEqual(preview.plan.fixtures.map(f => f.fixtureNumber));
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId, phase: 'final' } })).toBe(3);
    const slots = await prisma.v1TournamentSlot.findMany({ where: { tournamentId, group: { phase: { not: 'group' } } } });
    expect(slots).toHaveLength(10); expect(new Set(slots.map(s => s.registrationId)).size).toBe(10);
    const next = await service.get(user, tournamentId);
    const changed = await service.select(user, tournamentId, { expectedRevision: next.revision, finals: [{ ...finals[0], id: next.finals[0].id, name: '새 챔피언', registrationIds: [registrationIds[0], registrationIds[9]] }] });
    expect(next.finals).toMatchObject([{ id: saved.finals[0].id, colorIndex: 0 }, { id: saved.finals[1].id, colorIndex: 1 }, { id: saved.finals[2].id, colorIndex: 2 }]);
    expect(changed.finals[0]).toMatchObject({ id: saved.finals[0].id, colorIndex: 0, name: '새 챔피언' });
    expect(changed.generated).toBe(false); expect(await preliminarySnapshot()).toEqual(before);
  }, 30000);
  it('완전 동률은 추천에서 비워 두고 운영자의 수동 선택은 기존 미정 대진에 배정한다', async () => {
    await setup();
    const pending = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: pending.revision, previewHash: pending.previewHash, requestId: randomUUID() });
    const before = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: 'final' } } });
    await finishPreliminary(true);
    const view = await service.get(user, tournamentId);
    expect(view.groupStandings.every(group => group.complete && group.rows.length === 5)).toBe(true);
    // Every game is 0-0, so all five teams of both groups were separated only by the draw: both seats are the operator's.
    expect(view.finals[0].suggestedRegistrationIds).toEqual([]);
    expect(view.finals[0].unresolved.map(rule => [rule.rank, rule.state, rule.tiedRegistrationIds.length])).toEqual([[1, 'tied', 5], [1, 'tied', 5]]);
    expect(view.groupStandings.flatMap(group => group.rows.map(row => row.tiedRegistrationIds.length))).toEqual(Array(10).fill(5));
    const open = await service.assignmentPreview(user, tournamentId, { expectedRevision: view.revision, finalName: '챔피언', assignmentPolicy: 'rank_order' });
    expect(open.registrationIds).toEqual([null, null]);
    expect((await service.preview(user, tournamentId)).finals[0].registrationIds).toBeNull();
    const selected = await service.select(user, tournamentId, { expectedRevision: view.revision,
      finals: [{ name: '챔피언', thirdPlace: false, rules: view.finals[0].rules, registrationIds: [registrationIds[2], registrationIds[7]] }] });
    expect(selected.generated).toBe(true);
    const preview = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: selected.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    const after = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: before.teamMatchId } });
    expect([after.homeRegistrationId, after.awayRegistrationId]).toEqual([registrationIds[2], registrationIds[7]]);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, group: { phase: 'final' }, teamMatch: { deletedAt: null } } })).toBe(1);
  });
  it('동률이 낀 12팀 교차 결선은 동률 팀을 고르기 전엔 409, 고른 뒤엔 그 팀이 고른 순위 칸에 앉아 확정되고 조회가 선택을 돌려준다', async () => {
    for (const number of [11, 12]) {
      const team = await prisma.v1Team.create({ data: { ownerUserId: user.id, sportId: ids.soccerSportId, regionId: ids.regionId, name: `검증 팀 ${number}` } });
      registrationIds.push((await prisma.v1TournamentRegistration.create({ data: { tournamentId, teamId: team.id, appliedByUserId: user.id, status: 'confirmed' } })).id);
    }
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { teamCount: 12 } });
    const first = await service.setup(user, tournamentId, { expectedRevision: 0,
      groups: [0, 1, 2, 3].map(i => ({ name: `${i + 1}조`, capacity: 3, legs: 1 as const, registrationIds: registrationIds.slice(i * 3, i * 3 + 3) })),
      finals: [{ name: '프리미어', thirdPlace: false, rules: [1, 2, 3].flatMap(rank => [0, 1, 2, 3].map(group => ({ groupId: String(group), rank }))), registrationIds: null }] });
    const pending = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: first.revision, previewHash: pending.previewHash, requestId: randomUUID() });
    // 2조 (index 1) draws every game 0-0, so its three teams share ranks 1-3 and only the drawn order separated them; the other groups are decided.
    const tiedTeams = registrationIds.slice(3, 6);
    await finishPreliminary(new Set(tiedTeams));
    const view = await service.get(user, tournamentId);
    const groupB = view.groups[1].id;
    expect(view.finals[0].crossGroupTopThreeAvailable).toBe(true);
    expect(view.finals[0].unresolved.map(rule => [rule.groupId, rule.rank, rule.state, [...rule.tiedRegistrationIds].sort()])).toEqual(
      [1, 2, 3].map(rank => [groupB, rank, 'tied', [...tiedTeams].sort()]));
    expect(view.finals[0].tiePicks).toEqual([]);

    const request = { expectedRevision: view.revision, finalName: '프리미어', assignmentPolicy: 'cross_group_top3' as const };
    const [winner, runnerUp, third] = [tiedTeams[2], tiedTeams[0], tiedTeams[1]];
    const picks = [{ groupId: groupB, rank: 1, registrationId: winner }, { groupId: groupB, rank: 2, registrationId: runnerUp }, { groupId: groupB, rank: 3, registrationId: third }];
    await expect(service.assignmentPreview(user, tournamentId, request)).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_RANK_TIED' } });
    await expect(service.assignmentPreview(user, tournamentId, { ...request, tiePicks: picks.slice(0, 2) })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_RANK_TIED' } });
    await expect(service.assignmentPreview(user, tournamentId, { ...request, tiePicks: [{ ...picks[0], registrationId: registrationIds[0] }, ...picks.slice(1)] }))
      .rejects.toMatchObject({ response: { code: 'MULTI_FINAL_INVALID' } });

    const recommended = await service.assignmentPreview(user, tournamentId, { ...request, tiePicks: picks });
    const seeds = settledSeeds(recommended.registrationIds);
    expect(new Set(seeds).size).toBe(12);
    // Group winners take the byes (seeds 1-4); 2조 is the second lane, so its pick for 2nd place meets 1조's winner.
    expect([seeds[0], seeds[1], seeds[2], seeds[3]]).toEqual([registrationIds[0], winner, registrationIds[6], registrationIds[9]]);
    expect(seeds[CROSS_GROUP_LANES[0].second - 1]).toBe(runnerUp);
    expect(CROSS_GROUP_LANES.map(lane => seeds[lane.third - 1])).toContain(third);

    await expect(service.assign(user, tournamentId, { ...request, registrationIds: seeds, sourceVersion: recommended.sourceVersion }))
      .rejects.toMatchObject({ response: { code: 'MULTI_FINAL_RANK_TIED' } });
    const assigned = await service.assign(user, tournamentId, { ...request, registrationIds: seeds, sourceVersion: recommended.sourceVersion, tiePicks: picks });
    expect(assigned.finals[0].registrationIds).toEqual(seeds);
    expect(assigned.finals[0].tiePicks).toEqual(picks);
    expect((await service.get(user, tournamentId)).finals[0].tiePicks).toEqual(picks);
    const filled = await prisma.v1TournamentSlot.findMany({ where: { tournamentId, kind: 'GROUP_RANK', group: { bracketTrack: '프리미어' } }, orderBy: { position: 'asc' } });
    expect(filled.map(slot => slot.registrationId)).toEqual(seeds);
  }, 60000);
  it('다른 대회 팀·중복 팀·중복 순위 목적지를 거절하고 기존 명단을 보존한다', async () => {
    const view = await setup();
    for (const bad of [
      [{ name: '결선', rules: [], thirdPlace: false, registrationIds: [ids.registrationIds[0], registrationIds[0]] }],
      [{ name: '결선', rules: [], thirdPlace: false, registrationIds: [registrationIds[0], registrationIds[0]] }],
      [{ name: '결선1', rules: view.finals[0].rules, thirdPlace: false }, { name: '결선2', rules: view.finals[0].rules, thirdPlace: false }],
    ]) await expect(service.select(user, tournamentId, { expectedRevision: view.revision, finals: bad })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_INVALID' } });
    expect((await service.get(user, tournamentId)).revision).toBe(view.revision);
  });
  it('동시 편집은 하나만 저장되고 낡은 미리보기는 대진을 변경하지 않는다', async () => {
    const view = await setup();
    const dto: MultiFinalSelectionDto = { expectedRevision: view.revision, finals: [{ name: '결선', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] };
    const results = await Promise.allSettled([service.select(user, tournamentId, dto), service.select(user, tournamentId, dto)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const preview = await service.preview(user, tournamentId);
    const latest = await service.get(user, tournamentId);
    await service.select(user, tournamentId, { ...dto, expectedRevision: latest.revision });
    await expect(service.generate(user, tournamentId, { expectedRevision: preview.revision, previewHash: preview.previewHash, requestId: randomUUID() })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    expect(await prisma.v1TournamentGroup.count({ where: { tournamentId, phase: { not: 'group' } } })).toBe(0);
  });
  it('시작된 결선 변경과 없는 토너먼트의 시상 저장을 거절한다', async () => {
    const first = await setup(); const selected = await service.select(user, tournamentId, { expectedRevision: first.revision, finals: [{ name: '결선', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] });
    await expect(awards.setAwardSets(user, tournamentId, { awardSets: [{ bracketTrack: '없는 결선', prizePool: 0 }] })).rejects.toMatchObject({ response: { code: 'AWARD_TRACK_UNSUPPORTED' } });
    expect(await awards.setAwardSets(user, tournamentId, { awardSets: [{ bracketTrack: '결선', prizePool: 0 }] })).toEqual([expect.objectContaining({ bracketTrack: '결선', prizePool: 0 })]);
    const publicRow = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, include: TOURNAMENT_DETAIL_INCLUDE });
    expect(publicRow.awardSets).toEqual([expect.objectContaining({ bracketTrack: '결선', prizePool: 0 })]);
    const preview = await service.preview(user, tournamentId); await service.generate(user, tournamentId, { expectedRevision: selected.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    const fixture = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: { not: 'group' } } }, include: { teamMatch: { include: { game: true } } } });
    await prisma.v1Game.update({ where: { id: fixture.teamMatch.game!.id }, data: { state: 'LIVE' } });
    const current = await service.get(user, tournamentId);
    await expect(service.select(user, tournamentId, { expectedRevision: current.revision, finals: current.finals })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } } })).toBe(4);
  });
  it('생성 중 DB 실패는 새 결선·명단·revision·감사 로그를 전부 롤백한다', async () => {
    const first = await setup(); const saved = await service.select(user, tournamentId, { expectedRevision: first.revision, finals: [{ name: 'ROLLBACK', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] });
    const preview = await service.preview(user, tournamentId);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_multi_final() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name LIKE 'ROLLBACK%결승' THEN RAISE EXCEPTION 'forced multi-final rollback'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_multi_final BEFORE INSERT ON v1_tournament_groups FOR EACH ROW EXECUTE FUNCTION fail_multi_final()`);
    try {
      await expect(service.generate(user, tournamentId, { expectedRevision: saved.revision, previewHash: preview.previewHash, requestId: randomUUID() })).rejects.toThrow();
      expect((await service.get(user, tournamentId)).revision).toBe(saved.revision);
      expect(await prisma.v1TournamentGroup.count({ where: { tournamentId, phase: { not: 'group' } } })).toBe(0);
      expect(await prisma.v1AdminActionLog.count({ where: { targetId: tournamentId, action: 'tournament.multi_finals.generate' } })).toBe(0);
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER fail_multi_final ON v1_tournament_groups'); await prisma.$executeRawUnsafe('DROP FUNCTION fail_multi_final()'); }
  });
  it('미리보기 뒤 다른 운영자가 경기 일정을 바꾸면 재생성으로 덮어쓰지 않는다', async () => {
    const first = await setup();
    const selected = await service.select(user, tournamentId, { expectedRevision: first.revision, finals: [{ name: '결선', rules: [], thirdPlace: false, registrationIds: registrationIds.slice(0, 5) }] });
    const before = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: selected.revision, previewHash: before.previewHash, requestId: randomUUID() });
    const preview = await service.preview(user, tournamentId);
    const fixture = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { phase: { not: 'group' } } } });
    const startAt = new Date('2035-01-01T00:00:00Z');
    await prisma.v1TeamMatch.update({ where: { id: fixture.teamMatchId }, data: { startAt } });
    await expect(service.generate(user, tournamentId, { expectedRevision: preview.revision, previewHash: preview.previewHash, requestId: randomUUID() })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture.teamMatchId } })).startAt).toEqual(startAt);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } } })).toBe(4);
  });
  it('support는 명단 조회만 가능하고 변경·미리보기는 거절된다', async () => {
    await setup();
    const account = await prisma.v1User.create({ data: { email: `${randomUUID()}@example.test`, accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1AdminUser.create({ data: { userId: account.id, adminRole: 'support', status: 'active' } });
    const reader = { ...user, id: account.id, email: account.email! };
    expect((await service.get(reader, tournamentId)).groups).toHaveLength(2);
    await expect(service.select(reader, tournamentId, { expectedRevision: 1, finals: [] })).rejects.toThrow();
    await expect(service.preview(reader, tournamentId)).rejects.toThrow();
    await expect(service.reset(reader, tournamentId, { expectedRevision: 1 })).rejects.toThrow();
    await expect(service.setup(reader, tournamentId, { expectedRevision: 1, groups: [], finals: [] }, true)).rejects.toThrow();
    expect((await service.get(user, tournamentId)).revision).toBe(1);
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { status: 'completed' } });
    await expect(service.select(user, tournamentId, { expectedRevision: 1, finals: [] })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect((await service.get(reader, tournamentId)).finals).toHaveLength(1);
  });

  it('초기화는 실제 대진·연결을 지우고 조 설정·배정을 유지하며 별도 편성 저장에서 재생성한다', async () => {
    const first = await setup();
    const preview = await service.preview(user, tournamentId);
    await service.generate(user, tournamentId, { expectedRevision: first.revision, previewHash: preview.previewHash, requestId: randomUUID() });
    const before = await service.get(user, tournamentId);
    expect(before.generated).toBe(true);
    const originalIds = (await preliminarySnapshot()).map(f => f.teamMatchId);
    const reset = await service.reset(user, tournamentId, { expectedRevision: before.revision });
    expect(reset.preliminaryFixtureCount).toBe(0); expect(reset.generated).toBe(false);
    expect(reset.groups.map(g => g.id)).toEqual(before.groups.map(g => g.id));
    expect(reset.groups.map(g => g.registrationIds)).toEqual(before.groups.map(g => g.registrationIds));
    expect(reset.finals[0].rules).toEqual(before.finals[0].rules);
    expect(reset.finals[0].registrationIds).toBeNull();
    expect(await prisma.v1TournamentRegistration.count({ where: { tournamentId } })).toBe(10);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId } })).toBe(0);
    expect(await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } })).toBe(0);
    expect(await prisma.v1TeamMatch.count({ where: { id: { in: originalIds }, deletedAt: { not: null } } })).toBe(20);
    await expect(service.reset(user, tournamentId, { expectedRevision: before.revision })).rejects.toMatchObject({ response: { code: 'MULTI_FINAL_STALE' } });
    const edited = await service.setup(user, tournamentId, { expectedRevision: reset.revision,
      groups: [{ name: '수정 A조', capacity: 3, legs: 2, registrationIds: registrationIds.slice(0, 2) }, { name: 'B조', capacity: 7, legs: 1, registrationIds: registrationIds.slice(3) }],
      finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }], registrationIds: null }] }, true);
    expect(edited.preliminaryFixtureCount).toBe(27);
    expect(edited.groups[0]).toMatchObject({ name: '수정 A조', capacity: 3, legs: 2, registrationIds: registrationIds.slice(0, 2) });
    expect(edited.finals[0].rules.map(rule => rule.groupId)).toEqual(edited.groups.map(g => g.id));
    expect(edited.groups[0].id).not.toBe(first.groups[0].id);
    expect((await service.get(user, tournamentId)).groups).toEqual(edited.groups);
    await expect(service.setup(user, tournamentId, { expectedRevision: edited.revision,
      groups: [{ name: 'A조', capacity: 2, legs: 1 }], finals: [{ name: '챔피언', thirdPlace: false, rules: [] }] }, true)).rejects.toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
  });
  it('배정 디렉터는 초기화·예선 수정을 저장하고 타 대회·해제 배정은 쓰기 없이 거부한다', async () => {
    await setup();
    const { actor, grant } = await assignedDirector();
    expect(await prisma.v1AdminUser.findUnique({ where: { userId: actor.id } })).toBeNull();
    const before = await service.get(actor, tournamentId);
    const reset = await service.reset(actor, tournamentId, { expectedRevision: before.revision });
    expect(reset.fixtureCount).toBe(0);
    expect(reset.revision).toBe(before.revision + 1);
    expect(reset.groups.map(group => group.registrationIds)).toEqual(before.groups.map(group => group.registrationIds));
    const audit = await prisma.v1OperationAudit.findFirstOrThrow({ where: {
      tournamentId, actorUserId: actor.id, action: 'tournament.multi_finals.reset',
    } });
    expect(audit.actorType).toBe('USER');
    expect(audit.after).toMatchObject({ _authorization: {
      role: 'tournament_director', assignmentId: grant.id, assignmentVersion: grant.version,
    } });
    expect(await prisma.v1AdminActionLog.count({ where: { targetId: tournamentId, action: 'tournament.multi_finals.reset' } })).toBe(0);
    const edited = await service.setup(actor, tournamentId, { expectedRevision: reset.revision,
      groups: [0, 1].map(i => ({ name: `디렉터 수정 ${i + 1}조`, capacity: 5, legs: 1 as const, registrationIds: registrationIds.slice(i * 5, i * 5 + 5) })),
      finals: [{ name: '챔피언', thirdPlace: false, rules: [{ groupId: '0', rank: 1 }, { groupId: '1', rank: 1 }], registrationIds: null }],
    }, true);
    expect(edited.preliminaryFixtureCount).toBe(20);
    expect((await service.get(actor, tournamentId)).groups).toEqual(edited.groups);
    const foreign = await prisma.v1Tournament.create({ data: { kind: 'regular_tournament', format: 'league_knockouts',
      sportId: ids.soccerSportId, title: '타 대회 권한 검증', teamCount: 10, competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' } });
    await expect(service.reset(actor, foreign.id, { expectedRevision: 0 })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: foreign.id } })).multiFinalsRevision).toBe(0);
    await prisma.v1TournamentStaffAssignment.update({ where: { id: grant.id }, data: { revokedAt: new Date(), version: { increment: 1 } } });
    await expect(service.reset(actor, tournamentId, { expectedRevision: edited.revision })).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect((await service.get(user, tournamentId)).revision).toBe(edited.revision);
    expect(await prisma.v1TournamentMatchDetails.count({ where: { tournamentId, teamMatch: { deletedAt: null } } })).toBe(20);
    expect(await prisma.v1OperationAudit.count({ where: { tournamentId: foreign.id, actorUserId: actor.id } })).toBe(0);
  }, 30000);

  it.each([false, true])('공식 결과가 있는 예선은 초기화하지 않고 모든 경기·편성·revision을 유지한다 (director=%s)', async director => {
    const first = await setup(); await finishPreliminary();
    const actor = director ? (await assignedDirector()).actor : user;
    const before = await preliminarySnapshot();
    await expect(service.reset(actor, tournamentId, { expectedRevision: first.revision })).rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
    expect(await preliminarySnapshot()).toEqual(before);
    expect((await service.get(user, tournamentId)).revision).toBe(first.revision);
    expect(await prisma.v1AdminActionLog.count({ where: { targetId: tournamentId, action: 'tournament.multi_finals.reset' } })).toBe(0);
    expect(await prisma.v1OperationAudit.count({ where: { tournamentId, action: 'tournament.multi_finals.reset' } })).toBe(0);
  });

});

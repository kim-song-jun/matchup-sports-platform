import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-template@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, new AdminContextService(prisma), games);

const liveFixtures = (tournamentId: string) => prisma.v1TournamentMatchDetails.findMany({
  where: { tournamentId, teamMatch: { deletedAt: null } },
  include: { teamMatch: { include: { homeSlot: true, awaySlot: true } } },
  orderBy: { fixtureNumber: 'asc' },
});
const counts = async (tournamentId: string) => ({
  fixtures: (await liveFixtures(tournamentId)).length,
  groups: await prisma.v1TournamentGroup.count({ where: { tournamentId } }),
  slots: await prisma.v1TournamentSlot.count({ where: { tournamentId } }),
  edges: await prisma.v1TournamentMatchAdvancementEdge.count({ where: { tournamentId } }),
});

describe('대진 템플릿 실행기 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('토너먼트 8강 + 3·4위전: 조 4 · 자리 8 · 경기 8(번호 1~8, 팀 미정) · 연결 8', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko8', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }))
      .resolves.toEqual({ groups: 4, slots: 8, fixtures: 8, edges: 8 });

    const fixtures = await liveFixtures(tournamentId);
    expect(fixtures.map((f) => f.fixtureNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fixtures.map((f) => f.round)).toEqual(['8강', '8강', '8강', '8강', '4강', '4강', '결승', '3·4위전']);
    expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
    for (const f of fixtures) {
      expect(f.teamMatch.hostTeamId).toBeNull();
      expect(f.teamMatch.approvedApplicantTeamId).toBeNull();
    }
    expect(await prisma.v1Game.count({ where: { teamMatchId: { in: fixtures.map((f) => f.teamMatchId) } } })).toBe(8);
    const quarter1 = fixtures[0].teamMatch;
    expect([quarter1.homeSlot?.kind, quarter1.homeSlot?.position, quarter1.awaySlot?.position]).toEqual(['ENTRY', 1, 2]);
  });

  it('토너먼트 12강 + 3·4위전: BYE 자리 4 ↔ ByeSlot sortOrder 0,3,4,7, 8강 i번 홈 = BYE i · 어웨이 = 12강 i번 WINNER', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'ko12', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true }))
      .resolves.toEqual({ groups: 5, slots: 12, fixtures: 12, edges: 12 });

    const byes = await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, include: { group: true }, orderBy: { sortOrder: 'asc' } });
    expect(byes.map((b) => [b.group.phase, b.sortOrder])).toEqual([['round12', 0], ['round12', 3], ['round12', 4], ['round12', 7]]);

    const fixtures = await liveFixtures(tournamentId);
    const round12 = fixtures.filter((f) => f.round === '12강');
    const quarters = fixtures.filter((f) => f.round === '8강');
    expect(round12).toHaveLength(4);
    for (const [index, quarter] of quarters.entries()) {
      expect([quarter.teamMatch.homeSlot?.kind, quarter.teamMatch.homeSlot?.position]).toEqual(['BYE', index + 1]);
      expect(quarter.teamMatch.awaySlotId).toBeNull();
      const incoming = await prisma.v1TournamentMatchAdvancementEdge.findMany({ where: { targetTeamMatchId: quarter.teamMatchId } });
      expect(incoming).toHaveLength(1);
      expect(incoming[0]).toMatchObject({ sourceTeamMatchId: round12[index].teamMatchId, sourceOutcome: 'WINNER', targetSide: 'AWAY' });
    }
  });

  it('리그 방식 대회 6팀 2회전: 조 "리그" 1 · 자리 6 · 경기 30, 자리마다 10개 사이드에서 쓰인다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'lg6', format: 'league', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'league', teamCount: 6, legs: 2 }))
      .resolves.toEqual({ groups: 1, slots: 6, fixtures: 30, edges: 0 });
    const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
    expect([group.name, group.phase, group.advanceCount]).toEqual(['리그', 'group', null]);
    const fixtures = await liveFixtures(tournamentId);
    const usage = new Map<string, number>();
    for (const f of fixtures) for (const slotId of [f.teamMatch.homeSlotId, f.teamMatch.awaySlotId]) {
      usage.set(slotId as string, (usage.get(slotId as string) ?? 0) + 1);
    }
    expect([...usage.values()]).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it('대회 format 과 다른 템플릿은 422 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'mismatch', format: 'league', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('조별+결선 2조 x 4팀(2팀 진출): 조 4 · 자리 12 · 경기 15 · 연결 2, 4강 사이드는 순위 자리 A1–B2 · B1–A2', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false,
    })).resolves.toEqual({ groups: 4, slots: 12, fixtures: 15, edges: 2 });
    expect(await counts(tournamentId)).toEqual({ fixtures: 15, groups: 4, slots: 12, edges: 2 });

    const fixtures = await liveFixtures(tournamentId);
    const rankLabel = async (slotId: string | null) => {
      const slot = await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId as string }, include: { sourceGroup: true } });
      return `${slot.kind}:${slot.sourceGroup?.name}${slot.position}`;
    };
    const semis = fixtures.filter((f) => f.round === '4강');
    expect(await Promise.all(semis.map(async (f) => [await rankLabel(f.teamMatch.homeSlotId), await rankLabel(f.teamMatch.awaySlotId)]))).toEqual([
      ['GROUP_RANK:A조1', 'GROUP_RANK:B조2'],
      ['GROUP_RANK:B조1', 'GROUP_RANK:A조2'],
    ]);

    // 조별 경기는 자기 조 ENTRY 자리만 쓰고, 팀이 들어오기 전에는 조 편성(GroupTeam)이 없다.
    const stage = fixtures.filter((f) => f.round.startsWith('league_r'));
    expect(stage).toHaveLength(12);
    for (const f of stage) {
      expect(f.teamMatch.homeSlot?.kind).toBe('ENTRY');
      expect(f.teamMatch.homeSlot?.groupId).toBe(f.groupId);
      expect(f.teamMatch.awaySlot?.groupId).toBe(f.groupId);
    }
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
    const advance = await prisma.v1TournamentGroup.findMany({ where: { tournamentId, phase: 'group' }, select: { advanceCount: true } });
    expect(advance.map((g) => g.advanceCount)).toEqual([2, 2]);
  });

  it('결승 한 경기뿐인 조합(2조 x 1팀)에 3·4위전을 넣으면 422 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk-final', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: true,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_UNSUPPORTED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('조별+결선 8조 x 4팀(2팀 진출) + 3·4위전: 16강 phase round16 그룹 · 경기 64 · 연결 16 · 자리 48, 16강 사이드는 순위 자리 A1–B2 … H1–G2', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk16', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: true,
    })).resolves.toEqual({ groups: 13, slots: 48, fixtures: 64, edges: 16 });
    expect(await counts(tournamentId)).toEqual({ fixtures: 64, groups: 13, slots: 48, edges: 16 });

    const round16 = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId, phase: 'round16' } });
    expect(round16.name).toBe('16강');
    const fixtures = (await liveFixtures(tournamentId)).filter((f) => f.round === '16강');
    expect(fixtures).toHaveLength(8);
    const rankLabel = async (slotId: string | null) => {
      const slot = await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotId as string }, include: { sourceGroup: true } });
      return `${slot.sourceGroup?.name}${slot.position}`;
    };
    expect(await Promise.all(fixtures.map(async (f) => [await rankLabel(f.teamMatch.homeSlotId), await rankLabel(f.teamMatch.awaySlotId)]))).toEqual([
      ['A조1', 'B조2'], ['C조1', 'D조2'], ['E조1', 'F조2'], ['G조1', 'H조2'],
      ['B조1', 'A조2'], ['D조1', 'C조2'], ['F조1', 'E조2'], ['H조1', 'G조2'],
    ]);
  });

  it('8조 x 6팀 x 2회전 + 16강(256경기)은 422 BRACKET_TEMPLATE_TOO_LARGE 이고 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gk-large', format: 'group_knockout', teamCount: 0 });
    await expect(templates.apply(user, tournamentId, {
      kind: 'group_knockout', groupCount: 8, teamsPerGroup: 6, advancePerGroup: 2, legs: 2, thirdPlace: false,
    })).rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_TOO_LARGE' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('경기 규칙 버전이 없는 대회는 409 COMPETITION_CONFIG_REQUIRED, 아무것도 만들지 않는다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'noconfig', format: 'knockout', teamCount: 0, withConfig: false });
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'COMPETITION_CONFIG_REQUIRED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('비어 있지 않은 대진에 다시 적용하면 409 BRACKET_NOT_EMPTY 이고 기존 대진은 그대로다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'notempty', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: true });
    const before = await counts(tournamentId);
    await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(await counts(tournamentId)).toEqual(before);
  });

  it('support 어드민은 403 이다', async () => {
    const support = await seedSupportAdmin(prisma, 'template-support');
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'support', format: 'knockout', teamCount: 0 });
    await expect(templates.apply(support, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false }))
      .rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 0, groups: 0, slots: 0, edges: 0 });
  });

  it('같은 대회에 템플릿을 동시에 두 번 적용하면 하나만 성공하고 대진은 한 벌뿐이다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'race', format: 'knockout', teamCount: 0 });
    const results = await Promise.allSettled([
      templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }),
      templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ response: { code: 'BRACKET_NOT_EMPTY' } });
    expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
  });

  describe('replaceExisting', () => {
    const archived = (tournamentId: string) => prisma.v1TeamMatch.count({ where: { tournamentId, deletedAt: { not: null } } });

    it('시작 전 대진을 새 템플릿으로 교체한다 — 옛 경기는 소프트 삭제, 자리·조·연결은 새것만 남는다', async () => {
      const { tournamentId } = await seedBracketTournament(prisma, { label: 'replace', format: 'knockout', teamCount: 0 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true });

      await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false, replaceExisting: true }))
        .resolves.toEqual({ groups: 2, slots: 4, fixtures: 3, edges: 2 });

      expect(await counts(tournamentId)).toEqual({ fixtures: 3, groups: 2, slots: 4, edges: 2 });
      expect(await archived(tournamentId)).toBe(8);
      expect((await liveFixtures(tournamentId)).map((f) => f.fixtureNumber)).toEqual([1, 2, 3]); // 번호는 offset 0 부터 다시
      const names = (await prisma.v1TournamentGroup.findMany({ where: { tournamentId }, orderBy: { sortOrder: 'asc' } })).map((g) => g.name);
      expect(names).toEqual(['4강', '결승']);
    });

    it('같은 대회를 연달아 두 번 교체해도 생성 키가 충돌하지 않는다 (소프트 삭제 이력 수 반영)', async () => {
      const { tournamentId } = await seedBracketTournament(prisma, { label: 'replace-twice', format: 'knockout', teamCount: 0 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true, replaceExisting: true });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true, replaceExisting: true });
      expect(await counts(tournamentId)).toEqual({ fixtures: 8, groups: 4, slots: 8, edges: 8 });
      expect(await archived(tournamentId)).toBe(16);
    });

    it('경기가 시작됐거나(game ≠ SCHEDULED) 완료된 대진은 409 BRACKET_LOCKED 이고 아무것도 지우지 않는다', async () => {
      for (const [label, mutate] of [
        ['locked-live', (teamMatchId: string) => prisma.v1Game.update({ where: { teamMatchId }, data: { state: 'LIVE' } })],
        ['locked-completed', (teamMatchId: string) => prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'completed' } })],
      ] as const) {
        const { tournamentId } = await seedBracketTournament(prisma, { label, format: 'knockout', teamCount: 0 });
        await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: true });
        const before = await counts(tournamentId);
        const target = (await liveFixtures(tournamentId))[5]; // 4강 한 경기
        await mutate(target.teamMatchId);

        await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false, replaceExisting: true }))
          .rejects.toMatchObject({ response: { code: 'BRACKET_LOCKED' } });
        expect(await counts(tournamentId)).toEqual(before);
        expect(await archived(tournamentId)).toBe(0);
      }
    });

    it('대진이 비어 있으면 replaceExisting 이어도 그냥 만든다', async () => {
      const { tournamentId } = await seedBracketTournament(prisma, { label: 'replace-empty', format: 'knockout', teamCount: 0 });
      await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false, replaceExisting: true }))
        .resolves.toEqual({ groups: 2, slots: 4, fixtures: 3, edges: 2 });
    });

    it('조 편성·순위 행이 남은 리그 방식 대회도 교체되고 그 행들은 지워진다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'replace-league', format: 'league', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'league', teamCount: 4, legs: 1 });
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      await prisma.v1TournamentGroupTeam.create({ data: { groupId: group.id, registrationId: registrationIds[0] } });
      await prisma.v1TournamentStanding.create({ data: { groupId: group.id, registrationId: registrationIds[0] } });

      await templates.apply(user, tournamentId, { kind: 'league', teamCount: 3, legs: 1, replaceExisting: true });

      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
      expect(await prisma.v1TournamentStanding.count({ where: { group: { tournamentId } } })).toBe(0);
      expect(await counts(tournamentId)).toEqual({ fixtures: 3, groups: 1, slots: 3, edges: 0 });
    });
  });
});

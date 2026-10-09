import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, seedSupportAdmin } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'group-rank@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const templates = new BracketTemplateService(prisma, adminContext, games);
const slots = new TournamentSlotService(prisma, adminContext, games);

/** 2조 x 3팀, 조 1·2위 진출(결선 4강) 대진과 확정 등록 6팀을 만든다. */
async function seedGroupKnockout(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 6 });
  await templates.apply(user, seeded.tournamentId, {
    kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 2, legs: 1, thirdPlace: false,
  });
  return seeded;
}

describe('조 순위 미리보기·순위대로 채우기 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('GROUP_RANK 자리마다 한 행 — 조 순서·순위 순, 경기가 끝나지 않았으니 전부 group_incomplete', async () => {
    const { tournamentId } = await seedGroupKnockout('gr-preview');
    const { slots: rows } = await slots.standingsPreview(user, tournamentId);
    expect(rows.map((r) => [r.label, r.state, r.candidateRegistrationId, r.tiedRegistrationIds, r.currentRegistrationId])).toEqual([
      ['A조 1위', 'group_incomplete', null, [], null],
      ['A조 2위', 'group_incomplete', null, [], null],
      ['B조 1위', 'group_incomplete', null, [], null],
      ['B조 2위', 'group_incomplete', null, [], null],
    ]);
  });

  it('조 자리에 팀을 넣어 조 편성이 생겨도 미리보기는 그대로 읽힌다 (조 편성 조회가 쿼리를 깨지 않는다)', async () => {
    const { tournamentId, registrationIds } = await seedGroupKnockout('gr-assigned');
    const entries = await prisma.v1TournamentSlot.findMany({
      where: { tournamentId, kind: 'ENTRY' },
      orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
    });
    expect(entries).toHaveLength(6);
    for (const [index, slot] of entries.entries()) await slots.assignSlot(user, slot.id, registrationIds[index]);
    expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(6);
    const { slots: rows } = await slots.standingsPreview(user, tournamentId);
    expect(rows.map((r) => r.state)).toEqual(['group_incomplete', 'group_incomplete', 'group_incomplete', 'group_incomplete']);
  });

  it('채울 수 있는 자리가 없으면 아무것도 쓰지 않고 건너뛴 자리만 돌려준다', async () => {
    const { tournamentId } = await seedGroupKnockout('gr-fill-none');
    const result = await slots.fillFromStandings(user, tournamentId, []);
    expect(result.assignments).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual(['group_incomplete', 'group_incomplete', 'group_incomplete', 'group_incomplete']);
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'GROUP_RANK', registrationId: { not: null } } })).toBe(0);
  });

  it('경기가 끝나지 않은 조의 자리에 override 를 주면 422 SLOT_REGISTRATION_INVALID, 모르는 자리는 404 SLOT_NOT_FOUND — 아무것도 쓰지 않는다', async () => {
    const { tournamentId, registrationIds } = await seedGroupKnockout('gr-override');
    const rank = await prisma.v1TournamentSlot.findFirstOrThrow({ where: { tournamentId, kind: 'GROUP_RANK' }, orderBy: { id: 'asc' } });
    await expect(slots.fillFromStandings(user, tournamentId, [{ slotId: rank.id, registrationId: registrationIds[0] }]))
      .rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
    await expect(slots.fillFromStandings(user, tournamentId, [{ slotId: '00000000-0000-4000-8000-00000000dead', registrationId: registrationIds[0] }]))
      .rejects.toMatchObject({ response: { code: 'SLOT_NOT_FOUND' } });
    expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'GROUP_RANK', registrationId: { not: null } } })).toBe(0);
  });

  it('support 어드민은 미리보기는 되지만 채우기는 403 이다', async () => {
    const { tournamentId } = await seedGroupKnockout('gr-support');
    const support = await seedSupportAdmin(prisma, 'group-rank-support');
    await expect(slots.standingsPreview(support, tournamentId)).resolves.toMatchObject({ slots: expect.any(Array) });
    await expect(slots.fillFromStandings(support, tournamentId, [])).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
  });

  it('GROUP_RANK 자리가 없는 대회(토너먼트)의 미리보기는 빈 목록이다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'gr-knockout', format: 'knockout', teamCount: 0 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false });
    await expect(slots.standingsPreview(user, tournamentId)).resolves.toEqual({ slots: [] });
  });
});

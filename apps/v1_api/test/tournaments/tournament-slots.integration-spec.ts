import type { Prisma } from '@prisma/client';
import { lockCompetitionForBracketMutationInTx } from '../../src/tournaments/slots/competition-bracket-lock';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { assignSlotInTx, assignSlotsBatchInTx, TournamentSlotService, type SlotMutationContext } from '../../src/tournaments/slots/tournament-slot.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament, type SeededBracketTournament } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'tournament-slots@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const adminContext = new AdminContextService(prisma);
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, adminContext, games);
const slots = new TournamentSlotService(prisma, adminContext, games);
const bracket = new TournamentBracketService(prisma, adminContext, games);

const slotAt = (tournamentId: string, position: number, kind: 'ENTRY' | 'BYE' = 'ENTRY') =>
  prisma.v1TournamentSlot.findFirstOrThrow({ where: { tournamentId, kind, position } });
const fixturesUsing = (slotId: string) => prisma.v1TeamMatch.findMany({
  where: { OR: [{ homeSlotId: slotId }, { awaySlotId: slotId }] },
  include: { game: { include: { sides: true } }, tournamentDetails: true },
  orderBy: { id: 'asc' },
});
const allFixtures = (tournamentId: string) => prisma.v1TeamMatch.findMany({
  where: { tournamentId }, include: { game: { include: { sides: true } }, tournamentDetails: true }, orderBy: { id: 'asc' },
});
const sideTeam = (fixture: Awaited<ReturnType<typeof allFixtures>>[number], slotId: string) =>
  fixture.homeSlotId === slotId ? fixture.hostTeamId : fixture.approvedApplicantTeamId;

/** 리그 방식 대회 4팀 1회전 = 경기 6, 자리마다 3경기. 팀은 4개를 확정 등록으로 둔다. */
async function leagueOf4(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'league', teamCount: 4 });
  await templates.apply(user, seeded.tournamentId, { kind: 'league', teamCount: 4, legs: 1 });
  return seeded;
}

describe('자리 배정 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('fan-out', () => {
    it('자리 하나에 팀을 넣으면 그 자리를 쓰는 3경기만 바뀌고 나머지 3경기는 그대로다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('fan-out');
      const slot1 = await slotAt(tournamentId, 1);

      const result = await slots.assignSlot(user, slot1.id, registrationIds[0]);

      const using = await fixturesUsing(slot1.id);
      expect(using).toHaveLength(3);
      expect(result.affectedTeamMatchIds).toEqual(using.map((f) => f.id)); // id 오름차순
      expect(result.slot).toMatchObject({ id: slot1.id, registrationId: registrationIds[0], teamName: 'fan-out 팀1' });
      for (const fixture of using) {
        expect(sideTeam(fixture, slot1.id)).toBe(teamIds[0]);
        const sideKey = fixture.homeSlotId === slot1.id ? 'HOME' : 'AWAY';
        const side = fixture.game!.sides.find((s) => s.sideKey === sideKey)!;
        expect([side.teamId, side.displayNameSnapshot]).toEqual([teamIds[0], 'fan-out 팀1']);
        const detailsReg = sideKey === 'HOME' ? fixture.tournamentDetails!.homeRegistrationId : fixture.tournamentDetails!.awayRegistrationId;
        expect(detailsReg).toBe(registrationIds[0]);
      }
      // 대조군 — 이 자리를 쓰지 않는 경기는 팀도 이름도 그대로
      const usingIds = new Set(using.map((f) => f.id));
      const others = (await allFixtures(tournamentId)).filter((f) => !usingIds.has(f.id));
      expect(others).toHaveLength(3);
      for (const fixture of others) {
        expect([fixture.hostTeamId, fixture.approvedApplicantTeamId]).toEqual([null, null]);
        expect(fixture.game!.sides.map((s) => s.displayNameSnapshot).sort()).toEqual(['어웨이 팀 미정', '홈 팀 미정']);
      }
      // 명단 재계산 이벤트가 새 팀 몫으로 남는다
      const events = await prisma.v1OutboxEvent.findMany({ where: { type: 'COMPETITION_ROSTER_RESYNC' } });
      expect(events.some((e) => (e.payload as { scope?: string; teamId?: string }).scope === 'competitionTeam'
        && (e.payload as { teamId?: string }).teamId === teamIds[0])).toBe(true);
    });

    it('두 번째 자리를 채우면 두 자리가 만나는 경기에만 양 팀이 들어간다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('fan-out-two');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);

      const fixtures = await allFixtures(tournamentId);
      const between = fixtures.filter((f) => [f.homeSlotId, f.awaySlotId].sort().join() === [slot1.id, slot2.id].sort().join());
      expect(between).toHaveLength(1);
      expect([between[0].hostTeamId, between[0].approvedApplicantTeamId].sort()).toEqual([teamIds[0], teamIds[1]].sort());
      const filled = fixtures.map((f) => [f.hostTeamId, f.approvedApplicantTeamId].filter((t) => t !== null).length);
      expect(filled.sort()).toEqual([0, 1, 1, 1, 1, 2]); // (1,2)=2 · (1,3)(1,4)(2,3)(2,4)=1 · (3,4)=0
    });

    it('자리를 비우면 그 경기들이 다시 미정이 되고 팀 일정이 취소된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('clear');
      await prisma.v1TeamMatch.updateMany({ where: { tournamentId }, data: { startAt: new Date('2026-11-01T10:00:00Z'), endAt: new Date('2026-11-01T11:00:00Z') } });
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      expect(await prisma.v1TeamSchedule.count({ where: { teamId: teamIds[0], state: 'SCHEDULED' } })).toBe(3);

      const cleared = await slots.assignSlot(user, slot1.id, null);

      expect(cleared.slot).toMatchObject({ registrationId: null, teamName: null });
      for (const fixture of await fixturesUsing(slot1.id)) {
        expect(sideTeam(fixture, slot1.id)).toBeNull();
      }
      expect(await prisma.v1TeamSchedule.count({ where: { teamId: teamIds[0], state: 'SCHEDULED' } })).toBe(0);
      expect(await prisma.v1TeamSchedule.count({ where: { teamId: teamIds[0], state: 'CANCELLED' } })).toBe(3);
    });

    it('같은 팀을 같은 자리에 다시 넣으면 아무 경기도 건드리지 않는다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('noop');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const again = await slots.assignSlot(user, slot1.id, registrationIds[0]);
      expect(again.affectedTeamMatchIds).toEqual([]);
    });

    it('취소·삭제된 경기는 반영과 잠금 판정에서 제외된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('excluded');
      const slot1 = await slotAt(tournamentId, 1);
      const [cancelled, deleted, live] = await fixturesUsing(slot1.id);
      await prisma.v1TeamMatch.update({ where: { id: cancelled.id }, data: { status: 'cancelled' } });
      await prisma.v1Game.update({ where: { teamMatchId: cancelled.id }, data: { state: 'ENDED' } }); // 시작된 것처럼 — 취소라 잠그지 않아야 한다
      await prisma.v1TeamMatch.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

      const result = await slots.assignSlot(user, slot1.id, registrationIds[0]);

      expect(result.affectedTeamMatchIds).toEqual([live.id]);
      const fresh = await allFixtures(tournamentId);
      expect(sideTeam(fresh.find((f) => f.id === live.id)!, slot1.id)).toBe(teamIds[0]);
      expect(sideTeam(fresh.find((f) => f.id === cancelled.id)!, slot1.id)).toBeNull();
      expect(sideTeam(fresh.find((f) => f.id === deleted.id)!, slot1.id)).toBeNull();
    });
  });

  describe('거부', () => {
    it('시작된 경기가 있으면 409 SLOT_LOCKED 이고 어떤 경기도 바뀌지 않는다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('locked');
      const slot1 = await slotAt(tournamentId, 1);
      const slot2 = await slotAt(tournamentId, 2);
      const started = (await fixturesUsing(slot1.id)).find((f) => [f.homeSlotId, f.awaySlotId].includes(slot2.id))!; // (1,2) 경기
      await prisma.v1Game.update({ where: { teamMatchId: started.id }, data: { state: 'LIVE' } });

      await expect(slots.assignSlot(user, slot1.id, registrationIds[0])).rejects.toMatchObject({ response: { code: 'SLOT_LOCKED' } });

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      for (const fixture of await fixturesUsing(slot1.id)) expect(sideTeam(fixture, slot1.id)).toBeNull();
      // 대조군 — 시작된 (1,2) 경기를 쓰지 않는 자리 4 는 그대로 배정된다
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 4)).id, registrationIds[3])).resolves.toBeDefined();
    });

    it('같은 팀을 두 자리에 넣으면 409 SLOT_TEAM_ALREADY_PLACED', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('placed');
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 2)).id, registrationIds[0]))
        .rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
    });

    it('다른 대회 등록·미확정 등록은 422 SLOT_REGISTRATION_INVALID', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('invalid');
      const other = await seedBracketTournament(prisma, { label: 'invalid-other', format: 'league', teamCount: 1 });
      const slot1 = await slotAt(tournamentId, 1);
      await expect(slots.assignSlot(user, slot1.id, other.registrationIds[0]))
        .rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
      await prisma.v1TournamentRegistration.update({ where: { id: registrationIds[1] }, data: { status: 'paid' } });
      await expect(slots.assignSlot(user, slot1.id, registrationIds[1]))
        .rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
      await expect(slots.assignSlot(user, slot1.id, registrationIds[0])).resolves.toBeDefined(); // 대조군
    });

    it('정규 리그 자리는 이 PR 에서 409 SLOT_LEAGUE_NOT_SUPPORTED_YET (PR-5a 가 연다)', async () => {
      const league = await prisma.v1Tournament.create({
        data: { sportId: ids.soccerSportId, title: 'slot-league', status: 'draft', kind: 'regular_league', competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' },
      });
      const slot = await prisma.v1TournamentSlot.create({ data: { tournamentId: league.id, kind: 'ENTRY', position: 1 } });
      await expect(slots.assignSlot(user, slot.id, null)).rejects.toMatchObject({ response: { code: 'SLOT_LEAGUE_NOT_SUPPORTED_YET' } });
    });
  });

  describe('조 편성 (phase=group)', () => {
    const groupTeams = (tournamentId: string) =>
      prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } });

    it('자리에 팀을 넣으면 조 편성이 생기고, 자리 3개를 채우면 중복 없이 3행이다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-create');
      for (const position of [1, 2, 3]) await slots.assignSlot(user, (await slotAt(tournamentId, position)).id, registrationIds[position - 1]);
      const rows = await groupTeams(tournamentId);
      expect(rows.map((r) => [r.registrationId, r.isBye, r.sortOrder])).toEqual([
        [registrationIds[0], false, 0], [registrationIds[1], false, 1], [registrationIds[2], false, 2],
      ]);
    });

    it('비우면 편성과 그 팀의 순위 행이 지워진다 — 다른 팀의 편성은 그대로(대조군)', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-clear');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      await prisma.v1TournamentStanding.create({ data: { groupId: group.id, registrationId: registrationIds[0] } });

      await slots.assignSlot(user, slot1.id, null);

      expect((await groupTeams(tournamentId)).map((r) => r.registrationId)).toEqual([registrationIds[1]]);
      expect(await prisma.v1TournamentStanding.count({ where: { groupId: group.id, registrationId: registrationIds[0] } })).toBe(0);
    });

    it('A → B 로 교체하면 A 의 편성은 지워지고 B 의 편성이 생긴다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-swap-team');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot1.id, registrationIds[1]);
      expect((await groupTeams(tournamentId)).map((r) => r.registrationId)).toEqual([registrationIds[1]]);
    });

    it('이전 팀이 그 조의 다른 경기(수동 생성)에 남아 있으면 편성을 지우지 않는다 (대조군)', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('gt-keep');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      await bracket.createFixture(user, tournamentId, {
        groupId: group.id, round: 'league_r9', fixtureNumber: 99,
        homeRegistrationId: registrationIds[0], awayRegistrationId: registrationIds[2],
      });

      await slots.assignSlot(user, slot1.id, null);

      expect((await groupTeams(tournamentId)).map((r) => r.registrationId).sort())
        .toEqual([registrationIds[0], registrationIds[2]].sort());
    });

    it('결선 단계 조의 자리는 조 편성을 만들지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'gt-knockout', format: 'knockout', teamCount: 2 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      expect(await groupTeams(tournamentId)).toEqual([]);
    });
  });

  describe('BYE 자리 (12강)', () => {
    async function ko12(label: string, teamCount = 3) {
      const seeded = await seedBracketTournament(prisma, { label, format: 'knockout', teamCount });
      await templates.apply(user, seeded.tournamentId, { kind: 'knockout', size: 12, thirdPlace: false });
      return seeded;
    }
    const byeRows = async (tournamentId: string) => ({
      empty: (await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } })).map((b) => b.sortOrder),
      team: (await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId }, isBye: true }, orderBy: { sortOrder: 'asc' } }))
        .map((g) => [g.registrationId, g.sortOrder]),
    });

    it('BYE 자리 1 에 팀을 넣으면 ByeSlot(0) 이 GroupTeam(isBye) 로 바뀌고 8강 1번 홈에 팀이 들어간다, 비우면 원복', async () => {
      const { tournamentId, registrationIds, teamIds } = await ko12('bye-sync');
      const bye1 = await slotAt(tournamentId, 1, 'BYE');
      const before = await prisma.v1TournamentByeSlot.findFirstOrThrow({ where: { group: { tournamentId }, sortOrder: 0 } });

      await slots.assignSlot(user, bye1.id, registrationIds[0]);

      expect(await byeRows(tournamentId)).toEqual({ empty: [3, 4, 7], team: [[registrationIds[0], 0]] });
      const promoted = await prisma.v1TournamentGroupTeam.findFirstOrThrow({ where: { group: { tournamentId }, isBye: true } });
      expect(promoted.id).toBe(before.id); // createBye 와 같이 id 를 승계한다
      const [quarter1] = await fixturesUsing(bye1.id);
      expect(quarter1.hostTeamId).toBe(teamIds[0]);
      expect(quarter1.approvedApplicantTeamId).toBeNull(); // 어웨이는 12강 승자 연결이 채운다

      await slots.assignSlot(user, bye1.id, null);

      expect(await byeRows(tournamentId)).toEqual({ empty: [0, 3, 4, 7], team: [] });
      expect((await fixturesUsing(bye1.id))[0].hostTeamId).toBeNull();
    });

    it('BYE 자리 팀 교체(A→B)는 GroupTeam 의 등록만 바꾼다', async () => {
      const { tournamentId, registrationIds } = await ko12('bye-replace');
      const bye2 = await slotAt(tournamentId, 2, 'BYE');
      await slots.assignSlot(user, bye2.id, registrationIds[0]);
      await slots.assignSlot(user, bye2.id, registrationIds[1]);
      expect(await byeRows(tournamentId)).toEqual({ empty: [0, 4, 7], team: [[registrationIds[1], 3]] });
    });

    it('ENTRY 와 BYE 에 같은 팀을 동시에 넣을 수 없다 (양방향)', async () => {
      const { tournamentId, registrationIds } = await ko12('bye-exclusive');
      const entry = await slotAt(tournamentId, 1, 'ENTRY');
      const bye = await slotAt(tournamentId, 1, 'BYE');
      await slots.assignSlot(user, entry.id, registrationIds[0]);
      await expect(slots.assignSlot(user, bye.id, registrationIds[0])).rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
      await slots.assignSlot(user, bye.id, registrationIds[1]);
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 2, 'ENTRY')).id, registrationIds[1]))
        .rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
    });
  });

  async function inLane<T>(tournamentId: string, run: (tx: Prisma.TransactionClient, ctx: SlotMutationContext) => Promise<T>) {
    const admin = await adminContext.getMutationAdmin(user.id);
    return prisma.$transaction(async (tx) => {
      await lockCompetitionForBracketMutationInTx(tx, { id: tournamentId, kind: 'regular_tournament' });
      return run(tx, { admin, adminContext, games });
    }, { timeout: 45_000 });
  }
  const placedBySlot = async (tournamentId: string) =>
    (await prisma.v1TournamentSlot.findMany({ where: { tournamentId, kind: { in: ['ENTRY', 'BYE'] } } }))
      .map((s) => s.registrationId).filter((r): r is string => r !== null);

  describe('배치 변경(batch)', () => {
    it('A↔B 맞바꾸기는 비우기 먼저라 충돌 없이 끝나고 편성은 그대로, 경기 사이드만 뒤집힌다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('batch-swap');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);
      const groupBefore = await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } });

      await inLane(tournamentId, (tx, ctx) => assignSlotsBatchInTx(tx, ctx, [
        { slotId: slot1.id, registrationId: registrationIds[1] },
        { slotId: slot2.id, registrationId: registrationIds[0] },
      ]));

      const fresh = await prisma.v1TournamentSlot.findMany({ where: { id: { in: [slot1.id, slot2.id] } } });
      expect(fresh.find((s) => s.id === slot1.id)!.registrationId).toBe(registrationIds[1]);
      expect(fresh.find((s) => s.id === slot2.id)!.registrationId).toBe(registrationIds[0]);
      const fixtures = await allFixtures(tournamentId);
      for (const fixture of fixtures.filter((f) => [f.homeSlotId, f.awaySlotId].includes(slot1.id))) {
        expect(sideTeam(fixture, slot1.id)).toBe(teamIds[1]);
      }
      const groupAfter = await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } });
      expect(groupAfter.map((g) => g.id)).toEqual(groupBefore.map((g) => g.id)); // 지웠다 다시 만들지 않는다
    });

    it('대조군 — 같은 맞바꾸기를 하나씩 순서대로 하면 SLOT_TEAM_ALREADY_PLACED 로 막힌다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('batch-control');
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);
      await expect(inLane(tournamentId, (tx, ctx) => assignSlotInTx(tx, ctx, slot1.id, registrationIds[1])))
        .rejects.toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
    });

    it('같은 자리를 두 번 담으면 422 SLOT_CHANGE_DUPLICATED', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('batch-dup');
      const slot1 = await slotAt(tournamentId, 1);
      await expect(inLane(tournamentId, (tx, ctx) => assignSlotsBatchInTx(tx, ctx, [
        { slotId: slot1.id, registrationId: registrationIds[0] }, { slotId: slot1.id, registrationId: registrationIds[1] },
      ]))).rejects.toMatchObject({ response: { code: 'SLOT_CHANGE_DUPLICATED' } });
    });
  });

  describe('무작위 채우기', () => {
    it('팀이 자리보다 적으면 팀 수만큼만 중복 없이 채우고, 이미 배치된 팀은 그 자리에 남는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rf-few', format: 'knockout', teamCount: 5 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot3 = await slotAt(tournamentId, 3);
      await slots.assignSlot(user, slot3.id, registrationIds[0]);

      const { assignments } = await slots.randomFill(user, tournamentId);

      expect(assignments).toHaveLength(4); // 5팀 중 1팀은 이미 배치
      const placed = await placedBySlot(tournamentId);
      expect([...placed].sort()).toEqual([...registrationIds].sort()); // 5팀 모두, 한 번씩
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot3.id } })).registrationId).toBe(registrationIds[0]);
      expect(await prisma.v1TournamentSlot.count({ where: { tournamentId, kind: 'ENTRY', registrationId: null } })).toBe(3);
    });

    it('팀이 자리보다 많으면 자리를 다 채우고 남는 팀은 배치하지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rf-many', format: 'knockout', teamCount: 6 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: false });
      const { assignments } = await slots.randomFill(user, tournamentId);
      expect(assignments).toHaveLength(4);
      const placed = await placedBySlot(tournamentId);
      expect(new Set(placed).size).toBe(4);
      for (const id of placed) expect(registrationIds).toContain(id);
      expect((await slots.randomFill(user, tournamentId)).assignments).toEqual([]); // 빈 자리가 없다
    });

    it('확정이 아닌 등록은 뽑지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rf-unconfirmed', format: 'knockout', teamCount: 3 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      await prisma.v1TournamentRegistration.update({ where: { id: registrationIds[2] }, data: { status: 'cancelled' } });
      const { assignments } = await slots.randomFill(user, tournamentId);
      expect(assignments.map((a) => a.registrationId).sort()).toEqual([registrationIds[0], registrationIds[1]].sort());
    });

    it('정규 리그는 409 SLOT_LEAGUE_NOT_SUPPORTED_YET, 없는 대회는 404', async () => {
      const league = await prisma.v1Tournament.create({
        data: { sportId: ids.soccerSportId, title: 'rf-league', status: 'draft', kind: 'regular_league', competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' },
      });
      await expect(slots.randomFill(user, league.id)).rejects.toMatchObject({ response: { code: 'SLOT_LEAGUE_NOT_SUPPORTED_YET' } });
      await expect(slots.randomFill(user, '00000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    });
  });
});

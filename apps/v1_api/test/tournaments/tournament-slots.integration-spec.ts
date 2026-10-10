import type { Prisma } from '@prisma/client';
import { lockCompetitionForBracketMutationInTx } from '../../src/tournaments/slots/competition-bracket-lock';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { AdminRegistrationsService } from '../../src/tournaments/admin-registrations.service';
import { TournamentRegistrationsService } from '../../src/tournaments/tournament-registrations.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { LeagueFixtureGeneratorService } from '../../src/tournaments/league-fixture-generator.service';
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
const generator = new LeagueFixtureGeneratorService(prisma, adminContext, games);
// 팀이 보내는 취소 요청(`cancelRequest`)은 prisma 만 쓴다 — 알림·약관 의존성은 이 경로에서 불리지 않는다.
const registrations = new TournamentRegistrationsService(prisma, {} as never, {} as never);
const adminRegistrations = new AdminRegistrationsService(
  prisma, adminContext, { emitNotification: async () => undefined } as unknown as NotificationsService, slots,
);

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

    describe('기존 부전승 API(createBye·removeGroupTeam) 와 자리의 일관성', () => {
      const bye = (tournamentId: string, position: number) =>
        prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId, phase: 'round12' } }).then(async (group) => ({
          group, sortOrder: [0, 3, 4, 7][position - 1],
        }));
      const rowAt = async (groupId: string, sortOrder: number) =>
        (await prisma.v1TournamentGroupTeam.findFirst({ where: { groupId, isBye: true, sortOrder } }))
        ?? (await prisma.v1TournamentByeSlot.findFirstOrThrow({ where: { groupId, sortOrder } }));

      it('연결된 부전승의 팀을 createBye 로 바꾸거나 비우면 자리·부전승 행·8강 홈이 함께 바뀐다', async () => {
        const { tournamentId, registrationIds, teamIds } = await ko12('bye-legacy-edit');
        const bye1 = await slotAt(tournamentId, 1, 'BYE');
        const { group, sortOrder } = await bye(tournamentId, 1);
        const empty = await rowAt(group.id, sortOrder);

        await bracket.createBye(user, tournamentId, { groupId: group.id, byeId: empty.id, sortOrder, registrationId: registrationIds[0] });
        expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: bye1.id } })).registrationId).toBe(registrationIds[0]);
        expect((await fixturesUsing(bye1.id))[0].hostTeamId).toBe(teamIds[0]);

        const changed = await bracket.createBye(user, tournamentId, { groupId: group.id, byeId: empty.id, sortOrder, registrationId: registrationIds[1] });
        expect(changed).toMatchObject({ id: empty.id, registrationId: registrationIds[1], sortOrder });
        expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: bye1.id } })).registrationId).toBe(registrationIds[1]);
        expect((await fixturesUsing(bye1.id))[0].hostTeamId).toBe(teamIds[1]);

        const cleared = await bracket.createBye(user, tournamentId, { groupId: group.id, byeId: empty.id, sortOrder, registrationId: null });
        expect(cleared).toMatchObject({ id: empty.id, registrationId: null, isBye: true, sortOrder });
        expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: bye1.id } })).registrationId).toBeNull();
        expect((await fixturesUsing(bye1.id))[0].hostTeamId).toBeNull();
      });

      it('연결된 부전승의 위치 이동과 삭제는 409 SLOT_LINKED 이고 자리·행이 그대로다, 연결되지 않은 8강 부전승은 대조군으로 그대로 움직인다', async () => {
        const { tournamentId, registrationIds } = await ko12('bye-legacy-move');
        const { group, sortOrder } = await bye(tournamentId, 1);
        const empty = await rowAt(group.id, sortOrder);
        await bracket.createBye(user, tournamentId, { groupId: group.id, byeId: empty.id, sortOrder, registrationId: registrationIds[0] });

        await expect(bracket.createBye(user, tournamentId, { groupId: group.id, byeId: empty.id, sortOrder: 1, registrationId: registrationIds[0] }))
          .rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
        await expect(bracket.removeGroupTeam(user, empty.id)).rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
        expect((await rowAt(group.id, sortOrder)).id).toBe(empty.id);
        expect((await slotAt(tournamentId, 1, 'BYE')).registrationId).toBe(registrationIds[0]);

        // 대조군 — 자리에 연결되지 않은 수동 8강 조의 부전승은 위치를 옮기고 지울 수 있다
        const quarter = await prisma.v1TournamentGroup.create({ data: { tournamentId, name: '수동 8강', phase: 'quarter', sortOrder: 99 } });
        const manual = await bracket.createBye(user, tournamentId, { groupId: quarter.id, sortOrder: 0 });
        expect(await bracket.createBye(user, tournamentId, { groupId: quarter.id, byeId: manual.id, sortOrder: 1 })).toMatchObject({ id: manual.id, sortOrder: 1 });
        await expect(bracket.removeGroupTeam(user, manual.id)).resolves.toEqual({ deleted: true });
      });
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

  describe('한 팀 한 조 (결정 4) — 자리 경로는 트랜잭션 끝 상태를 검사한다', () => {
    // groupCount 는 템플릿이 지원하는 값(2·4·8)만 쓴다.
    const groupedTournament = async (label: string, groupCount = 2) => {
      const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 6 });
      await templates.apply(user, seeded.tournamentId, { kind: 'group_knockout', groupCount, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false });
      const groups = await prisma.v1TournamentGroup.findMany({ where: { tournamentId: seeded.tournamentId, phase: 'group' }, orderBy: { sortOrder: 'asc' } });
      const firstEntry = (groupId: string) => prisma.v1TournamentSlot.findFirstOrThrow({
        where: { tournamentId: seeded.tournamentId, groupId, kind: 'ENTRY' }, orderBy: { position: 'asc' },
      });
      const teamsIn = async (groupId: string) =>
        (await prisma.v1TournamentGroupTeam.findMany({ where: { groupId } })).map((row) => row.registrationId);
      return { ...seeded, groupIds: groups.map((group) => group.id), groupA: groups[0].id, groupB: groups[1].id, firstEntry, teamsIn };
    };

    it('직접 경로로 B조에 편성된 팀을 A조 자리에 넣으면 409 TEAM_IN_OTHER_GROUP 이고 롤백된다', async () => {
      const { tournamentId, registrationIds, groupA, groupB, firstEntry, teamsIn } = await groupedTournament('otg-direct');
      const slotA = await firstEntry(groupA);
      await bracket.createGroupTeam(user, tournamentId, { groupId: groupB, registrationId: registrationIds[0] });

      await expect(slots.assignSlot(user, slotA.id, registrationIds[0])).rejects.toMatchObject({
        response: { code: 'TEAM_IN_OTHER_GROUP', details: { registrationId: registrationIds[0], groupId: groupA } },
      });

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotA.id } })).registrationId).toBeNull();
      expect(await teamsIn(groupA)).toEqual([]);
    });

    it('맞바꾸기는 통과한다 (대조군) — 중간 겹침은 끝 상태 검사 전에 풀린다', async () => {
      const { tournamentId, registrationIds, groupA, groupB, firstEntry, teamsIn } = await groupedTournament('otg-swap');
      const [slotA, slotB] = [await firstEntry(groupA), await firstEntry(groupB)];
      await slots.assignSlot(user, slotA.id, registrationIds[0]);
      await slots.assignSlot(user, slotB.id, registrationIds[1]);

      await inLane(tournamentId, (tx, ctx) => assignSlotsBatchInTx(tx, ctx, [
        { slotId: slotA.id, registrationId: registrationIds[1] },
        { slotId: slotB.id, registrationId: registrationIds[0] },
      ]));

      expect(await teamsIn(groupA)).toEqual([registrationIds[1]]);
      expect(await teamsIn(groupB)).toEqual([registrationIds[0]]);
    });

    it('이미 겹친 팀은 편성이 없는 조의 자리에는 409(롤백), 이미 편성된 조의 자리에는 들어간다', async () => {
      const { registrationIds, groupIds, firstEntry, teamsIn } = await groupedTournament('otg-legacy', 4);
      const [groupA, groupB, groupC] = groupIds;
      const reg = registrationIds[2];
      await prisma.v1TournamentGroupTeam.createMany({ data: [
        { groupId: groupA, registrationId: reg, sortOrder: 0 },
        { groupId: groupB, registrationId: reg, sortOrder: 0 },
      ] });

      const slotC = await firstEntry(groupC);
      await expect(slots.assignSlot(user, slotC.id, reg)).rejects.toMatchObject({ response: { code: 'TEAM_IN_OTHER_GROUP' } });
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slotC.id } })).registrationId).toBeNull();
      expect(await teamsIn(groupC)).toEqual([]);

      await expect(slots.assignSlot(user, (await firstEntry(groupA)).id, reg)).resolves.toBeDefined();
      expect(await teamsIn(groupA)).toEqual([reg]);
      expect(await teamsIn(groupB)).toEqual([reg]);
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

    it('없는 대회는 404', async () => {
      await expect(slots.randomFill(user, '00000000-0000-4000-8000-00000000dead')).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    });
  });
  describe('등록이 확정을 벗어나면 자리가 비워진다', () => {
    it('어드민 취소 → 그 팀의 자리와 경기 사이드가 비워지고 다른 팀의 자리는 그대로(대조군)', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'rel-ko', format: 'knockout', teamCount: 2 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const [slot1, slot2] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 2)];
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await slots.assignSlot(user, slot2.id, registrationIds[1]);

      await adminRegistrations.cancel(user, registrationIds[0], {});

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot2.id } })).registrationId).toBe(registrationIds[1]);
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBeNull();
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });

    it('시작된 경기가 있으면 자리를 그대로 둔다 — 등록은 취소된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await seedBracketTournament(prisma, { label: 'rel-started', format: 'knockout', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const [fixture] = await fixturesUsing(slot1.id);
      await prisma.v1Game.update({ where: { teamMatchId: fixture.id }, data: { state: 'LIVE' } });

      await adminRegistrations.cancel(user, registrationIds[0], {});

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBe(registrationIds[0]);
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBe(teamIds[0]);
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });

    it('자리에 없던 팀의 취소는 아무 자리도 건드리지 않는다 (기존 동작)', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('rel-unplaced');
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      await adminRegistrations.cancel(user, registrationIds[3], {});
      expect(await placedBySlot(tournamentId)).toEqual([registrationIds[0]]);
    });

    it('보류(on_hold) 리그의 참가 거부도 막히지 않는다 — 해제는 잠금만 잡는다', async () => {
      const league = await prisma.v1Tournament.create({
        data: { sportId: ids.soccerSportId, title: 'rel-hold', status: 'on_hold', kind: 'regular_league', competitionConfigVersionId: '11111111-1111-4111-8111-111111111111' },
      });
      const team = await prisma.v1Team.create({ data: { ownerUserId: ids.adminUserId, sportId: ids.soccerSportId, regionId: ids.regionId, name: 'rel-hold 팀' } });
      const registration = await prisma.v1TournamentRegistration.create({
        data: { tournamentId: league.id, teamId: team.id, appliedByUserId: ids.adminUserId, status: 'confirmed' },
      });
      await expect(adminRegistrations.cancel(user, registration.id, { reason: '운영 사유' })).resolves.toMatchObject({ status: 'cancelled' });
    });
  });

  describe('팀의 취소 요청은 자리를 비우지 않고, 운영자 승인 때 판정한다', () => {
    const teamIdOf = async (registrationId: string) =>
      (await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationId }, select: { teamId: true } })).teamId;

    // 팀 매니저 권한(`assertTeamManager`)을 갖춘 뒤 실제 `cancelRequest` 를 부른다 — 상태를 prisma 로 직접 바꾸지 않는다.
    const teamRequestsCancel = async (tournamentId: string, registrationId: string) => {
      await prisma.v1TeamMembership.create({ data: { teamId: await teamIdOf(registrationId), userId: ids.adminUserId, role: 'owner', status: 'active' } });
      await registrations.cancelRequest(user, tournamentId, registrationId, {});
    };

    it('요청만으로는 자리와 경기 사이드가 그대로다 — 등록만 cancel_requested', async () => {
      const { tournamentId, registrationIds, teamIds } = await seedBracketTournament(prisma, { label: 'req-keep', format: 'knockout', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);

      await teamRequestsCancel(tournamentId, registrationIds[0]);

      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancel_requested');
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBe(registrationIds[0]);
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBe(teamIds[0]);
    });

    it('승인 — 자리를 쓰는 경기가 모두 시작 전이면 자리·사이드·조 편성이 비워진다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('req-approve');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      await teamRequestsCancel(tournamentId, registrationIds[0]);

      await adminRegistrations.cancel(user, registrationIds[0], {});

      const using = await fixturesUsing(slot1.id);
      expect(using.length).toBeGreaterThan(1); // 리그 자리는 여러 경기에 걸쳐 있다 — 하나만 검사하면 반쪽이다
      for (const fixture of using) expect(fixture.homeSlotId === slot1.id ? fixture.hostTeamId : fixture.approvedApplicantTeamId).toBeNull();
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });

    it('승인 — 자리를 쓰는 경기 중 하나라도 이미 시작됐으면 자리·사이드·조 편성을 그대로 두고 등록만 취소된다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('req-approve-started');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const teamId = await teamIdOf(registrationIds[0]);
      const using = await fixturesUsing(slot1.id);
      expect(using.length).toBeGreaterThan(1);
      // 첫 경기가 아니라 마지막 경기를 시작시킨다 — "첫 경기만 본다"는 구현이 통과하지 못하게.
      await prisma.v1Game.update({ where: { teamMatchId: using[using.length - 1].id }, data: { state: 'LIVE' } });
      await teamRequestsCancel(tournamentId, registrationIds[0]);

      await adminRegistrations.cancel(user, registrationIds[0], {});

      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBe(registrationIds[0]);
      for (const fixture of await fixturesUsing(slot1.id)) expect(fixture.homeSlotId === slot1.id ? fixture.hostTeamId : fixture.approvedApplicantTeamId).toBe(teamId);
      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId }, registrationId: registrationIds[0] } })).toBe(1);
      expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationIds[0] } })).status).toBe('cancelled');
    });
  });

  describe('SLOT_LINKED 가드', () => {
    it('자리에 연결된 사이드의 팀 변경(지정·null)은 409 이고 아무것도 바뀌지 않는다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('linked');
      const slot1 = await slotAt(tournamentId, 1);
      await slots.assignSlot(user, slot1.id, registrationIds[0]);
      const [fixture] = await fixturesUsing(slot1.id);
      const patch = fixture.homeSlotId === slot1.id ? 'homeRegistrationId' : 'awayRegistrationId';
      const snapshot = async () => {
        const details = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: fixture.id } });
        const match = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture.id } });
        return { home: details.homeRegistrationId, away: details.awayRegistrationId, host: match.hostTeamId, applicant: match.approvedApplicantTeamId };
      };
      const before = await snapshot();
      expect(before[patch === 'homeRegistrationId' ? 'home' : 'away']).toBe(registrationIds[0]);

      for (const value of [registrationIds[2], null]) {
        await expect(bracket.updateFixture(user, fixture.id, { [patch]: value }))
          .rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
      }
      expect(await snapshot()).toEqual(before);
    });

    it('대조군 — 같은 경기의 일정·장소 수정은 그대로 된다', async () => {
      const { tournamentId } = await leagueOf4('linked-schedule');
      const [fixture] = await fixturesUsing((await slotAt(tournamentId, 1)).id);
      await expect(bracket.updateFixture(user, fixture.id, { venue: '새 경기장', scheduledAt: '2026-11-02T10:00:00.000Z' }))
        .resolves.toMatchObject({ id: fixture.id, venue: '새 경기장' });
    });

    it('대조군 — 자리 없는 수동 경기의 팀 변경은 그대로 된다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('linked-manual');
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      const manual = await bracket.createFixture(user, tournamentId, {
        groupId: group.id, round: 'league_r9', fixtureNumber: 99,
        homeRegistrationId: registrationIds[0], awayRegistrationId: registrationIds[1],
      });
      await expect(bracket.updateFixture(user, manual.id, { homeRegistrationId: registrationIds[2] }))
        .resolves.toMatchObject({ homeRegistrationId: registrationIds[2] });
    });
  });

  describe('일괄 재생성과 자리의 충돌', () => {
    it('자리로 만든 조는 replaceExisting 재생성이 409 LEAGUE_SLOT_FIXTURES_USE_TEMPLATE 이고 경기는 그대로다', async () => {
      const { tournamentId, registrationIds } = await leagueOf4('regen-slot');
      for (const [index, registrationId] of registrationIds.entries()) {
        await slots.assignSlot(user, (await slotAt(tournamentId, index + 1)).id, registrationId);
      }
      const group = await prisma.v1TournamentGroup.findFirstOrThrow({ where: { tournamentId } });
      const before = await allFixtures(tournamentId);

      await expect(generator.generate(user, tournamentId, { groupId: group.id, legs: 1, replaceExisting: true }))
        .rejects.toMatchObject({ response: { code: 'LEAGUE_SLOT_FIXTURES_USE_TEMPLATE' } });
      expect((await allFixtures(tournamentId)).map((f) => [f.id, f.hostTeamId, f.approvedApplicantTeamId]))
        .toEqual(before.map((f) => [f.id, f.hostTeamId, f.approvedApplicantTeamId]));
    });

    it('대조군 — 자리 없이 조 편성으로 만드는 기존 흐름은 replaceExisting 이어도 막히지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'regen-plain', format: 'league', teamCount: 3 });
      const group = await bracket.createGroup(user, tournamentId, { name: 'A조', phase: 'group' });
      for (const registrationId of registrationIds) await bracket.createGroupTeam(user, tournamentId, { groupId: group.id, registrationId });
      await expect(generator.generate(user, tournamentId, { groupId: group.id, legs: 1, replaceExisting: true }))
        .resolves.toMatchObject({ created: 3 });
    });
  });

  describe('동시성', () => {
    it('같은 팀을 두 어드민이 서로 다른 자리에 동시에 넣으면 하나만 성공하고 경기 사이드가 일관된다', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('race-same-team');
      const [slotA, slotB] = [await slotAt(tournamentId, 1), await slotAt(tournamentId, 3)];

      const results = await Promise.allSettled([
        slots.assignSlot(user, slotA.id, registrationIds[0]),
        slots.assignSlot(user, slotB.id, registrationIds[0]),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ response: { code: 'SLOT_TEAM_ALREADY_PLACED' } });
      expect(await placedBySlot(tournamentId)).toEqual([registrationIds[0]]);
      // 팀이 들어간 사이드는 승자 자리를 쓰는 경기 수(3)와 정확히 같다 — 진 쪽이 사이드를 남기지 않았다
      const sides = (await allFixtures(tournamentId)).flatMap((f) => [f.hostTeamId, f.approvedApplicantTeamId]);
      expect(sides.filter((team) => team === teamIds[0])).toHaveLength(3);
    });

    it('서로 다른 팀을 같은 자리에 동시에 넣어도 둘 다 끝나고 마지막 결과 하나로 일관된다 (자리·사이드·조 편성)', async () => {
      const { tournamentId, registrationIds, teamIds } = await leagueOf4('race-same-slot');
      const slot1 = await slotAt(tournamentId, 1);

      const results = await Promise.allSettled([
        slots.assignSlot(user, slot1.id, registrationIds[0]),
        slots.assignSlot(user, slot1.id, registrationIds[1]),
      ]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      const winner = (await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId!;
      const winnerTeam = teamIds[registrationIds.indexOf(winner)];
      for (const fixture of await fixturesUsing(slot1.id)) expect(sideTeam(fixture, slot1.id)).toBe(winnerTeam);
      expect((await prisma.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId } } })).map((g) => g.registrationId)).toEqual([winner]);
    });

    it('팀 취소와 자리 배정이 겹쳐도 교착 없이 끝나고 취소된 팀이 자리에 남지 않는다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'race-cancel', format: 'knockout', teamCount: 1 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 8, thirdPlace: false });
      const slot1 = await slotAt(tournamentId, 1);

      const results = await Promise.allSettled([
        adminRegistrations.cancel(user, registrationIds[0], {}),
        slots.assignSlot(user, slot1.id, registrationIds[0]),
      ]);

      const [cancelResult, assignResult] = results;
      expect(cancelResult.status).toBe('fulfilled');
      // 배정이 먼저면 성공하고 취소가 비운다, 취소가 먼저면 확정이 아니라서 422 — 어느 쪽이든 교착(40P01)은 없다
      if (assignResult.status === 'rejected') {
        expect(assignResult.reason).toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
      }
      expect((await prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slot1.id } })).registrationId).toBeNull();
      expect((await fixturesUsing(slot1.id))[0].hostTeamId).toBeNull();
    });
  });

  describe('팀이 들어간 대진의 교체', () => {
    it('12강 대진에 팀·부전승이 들어가 있어도 교체되고, 자리·부전승·조 편성은 새 대진 기준으로 리셋된다', async () => {
      const { tournamentId, registrationIds } = await seedBracketTournament(prisma, { label: 'replace-placed', format: 'knockout', teamCount: 3 });
      await templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true });
      await slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0]);
      await slots.assignSlot(user, (await slotAt(tournamentId, 2)).id, registrationIds[1]);
      await slots.assignSlot(user, (await slotAt(tournamentId, 1, 'BYE')).id, registrationIds[2]);

      await expect(templates.apply(user, tournamentId, { kind: 'knockout', size: 12, thirdPlace: true, replaceExisting: true }))
        .resolves.toEqual({ groups: 5, slots: 12, fixtures: 12, edges: 12 });

      expect(await placedBySlot(tournamentId)).toEqual([]);
      expect((await prisma.v1TournamentByeSlot.findMany({ where: { group: { tournamentId } }, orderBy: { sortOrder: 'asc' } })).map((b) => b.sortOrder)).toEqual([0, 3, 4, 7]);
      expect(await prisma.v1TournamentGroupTeam.count({ where: { group: { tournamentId } } })).toBe(0);
      for (const fixture of await prisma.v1TeamMatch.findMany({ where: { tournamentId, deletedAt: null } })) {
        expect([fixture.hostTeamId, fixture.approvedApplicantTeamId]).toEqual([null, null]);
      }
      // 같은 등록으로 새 대진에 다시 배치할 수 있다
      await expect(slots.assignSlot(user, (await slotAt(tournamentId, 1)).id, registrationIds[0])).resolves.toBeDefined();
    });
  });
});

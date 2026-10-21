import { PrismaService } from '../../src/prisma/prisma.service';
import { TOURNAMENT_VENUE_SELECT } from '../../src/places/tournament-venue';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { createEmptyTournamentFixtureInTx, createGroupInTx } from '../../src/tournaments/tournament-bracket-tx';
import { updateTournamentMatchInTx } from '../../src/tournaments/tournament-match-update';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../../src/tournaments/tournament-surface-lookup';
import type { Prisma } from '@prisma/client';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-tx@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const bracket = new TournamentBracketService(prisma, adminContext, games);
let admin: Awaited<ReturnType<AdminContextService['getMutationAdmin']>>;
const [reg0, reg1] = ids.registrationIds;

const groupAuditCount = (name: string) =>
  prisma.v1AdminActionLog.count({ where: { action: 'tournament.bracket.group.create', afterJson: { path: ['name'], equals: name } } });

describe('대진 …InTx 함수 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    admin = await adminContext.getMutationAdmin(user.id);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('createGroupInTx', () => {
    it('바깥 트랜잭션이 롤백되면 그룹과 감사 로그가 함께 사라진다 (여러 변경을 한 트랜잭션에 묶을 수 있다)', async () => {
      await expect(prisma.$transaction(async (tx) => {
        await createGroupInTx(tx, admin, ids.tournamentId, { name: 'tx-rollback', phase: 'group', sortOrder: 9, advanceCount: null });
        throw new Error('rollback');
      })).rejects.toThrow('rollback');

      expect(await prisma.v1TournamentGroup.count({ where: { tournamentId: ids.tournamentId, name: 'tx-rollback' } })).toBe(0);
      expect(await groupAuditCount('tx-rollback')).toBe(0);
    });

    it('커밋되면 둘 다 남는다 (대조군) — 서비스 createGroup 도 같은 함수를 탄다', async () => {
      const viaService = await bracket.createGroup(user, ids.tournamentId, { name: 'tx-commit', phase: 'group' });

      expect(await prisma.v1TournamentGroup.count({ where: { id: viaService.id } })).toBe(1);
      expect(await groupAuditCount('tx-commit')).toBe(1);
    });
  });

  describe('deleteGroup + 자리', () => {
    const makeSlot = (data: { groupId: string | null; position: number; kind?: 'ENTRY' | 'GROUP_RANK'; sourceGroupId?: string }) =>
      prisma.v1TournamentSlot.create({
        data: { tournamentId: ids.tournamentId, kind: data.kind ?? 'ENTRY', groupId: data.groupId, position: data.position, sourceGroupId: data.sourceGroupId ?? null },
      });

    it('팀 미정이고 어느 경기에서도 쓰지 않는 자리는 조 삭제와 함께 정리한다', async () => {
      const group = await bracket.createGroup(user, ids.tournamentId, { name: 'slot-group', phase: 'group' });
      const slot = await makeSlot({ groupId: group.id, position: 1 });
      await expect(bracket.deleteGroup(user, group.id)).resolves.toEqual({ deleted: true });
      expect(await prisma.v1TournamentGroup.count({ where: { id: group.id } })).toBe(0);
      expect(await prisma.v1TournamentSlot.findUnique({ where: { id: slot.id } })).toBeNull();
    });

    it('실제 ENTRY 팀 배정은 편성 행이 없어도 보호하며, 미정으로 비운 뒤 삭제한다', async () => {
      const group = await bracket.createGroup(user, ids.tournamentId, { name: 'occupied-slot-group', phase: 'group' });
      const slot = await makeSlot({ groupId: group.id, position: 1 });
      await prisma.v1TournamentSlot.update({ where: { id: slot.id }, data: { registrationId: reg0 } });
      await expect(bracket.deleteGroup(user, group.id)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_TEAMS' } });
      expect(await prisma.v1TournamentGroup.count({ where: { id: group.id } })).toBe(1);
      await prisma.v1TournamentSlot.update({ where: { id: slot.id }, data: { registrationId: null } });
      await expect(bracket.deleteGroup(user, group.id)).resolves.toEqual({ deleted: true });
    });

    it('다른 조의 실제 결선 경기가 참조하는 순위 자리는 보호하고 경기 삭제 후 정리한다', async () => {
      const source = await bracket.createGroup(user, ids.tournamentId, { name: 'rank-source', phase: 'group' });
      const finals = await bracket.createGroup(user, ids.tournamentId, { name: 'rank-finals', phase: 'semi' });
      const rank = await makeSlot({ kind: 'GROUP_RANK', groupId: finals.id, position: 1, sourceGroupId: source.id });
      const row = await findTournamentOnSurface(prisma, TOURNAMENT_KINDS, {
        where: { id: ids.tournamentId },
        select: { id: true, sportId: true, regionId: true, title: true, competitionConfigVersionId: true, ...TOURNAMENT_VENUE_SELECT },
      });
      if (!row?.competitionConfigVersionId) throw new Error('fixture tournament has no competition config');
      const fixture = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${ids.tournamentId}`}, 0))`;
        return createEmptyTournamentFixtureInTx(tx, { games }, admin, {
          tournament: { ...row, competitionConfigVersionId: row.competitionConfigVersionId! }, groupId: finals.id,
          round: '4강', fixtureNumber: 98001, legNumber: 1, homeSlotId: rank.id, awaySlotId: null,
        });
      });
      await expect(bracket.deleteGroup(user, source.id)).rejects.toMatchObject({ response: { code: 'GROUP_HAS_SLOTS' } });
      expect(await prisma.v1TournamentSlot.findUnique({ where: { id: rank.id } })).not.toBeNull();
      await bracket.deleteFixture(user, fixture.id);
      await expect(bracket.deleteGroup(user, source.id)).resolves.toEqual({ deleted: true });
      expect(await prisma.v1TournamentSlot.findUnique({ where: { id: rank.id } })).toBeNull();
      await expect(bracket.deleteGroup(user, finals.id)).resolves.toEqual({ deleted: true });
    });

    it('자리가 없는 빈 조는 기존대로 지워진다 (대조군)', async () => {
      const group = await bracket.createGroup(user, ids.tournamentId, { name: 'plain-group', phase: 'group' });
      await expect(bracket.deleteGroup(user, group.id)).resolves.toEqual({ deleted: true });
      expect(await prisma.v1TournamentGroup.count({ where: { id: group.id } })).toBe(0);
    });
  });

  describe('빈 경기 · 자리 연결 · 소프트 삭제', () => {
    const lock = (tx: Prisma.TransactionClient) =>
      tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${ids.tournamentId}`}, 0))`;
    let groupId: string;
    let tournamentInfo: Parameters<typeof createEmptyTournamentFixtureInTx>[3]['tournament'];
    const slotOf = (position: number) =>
      prisma.v1TournamentSlot.create({ data: { tournamentId: ids.tournamentId, kind: 'ENTRY', groupId, position } });
    const emptyFixture = (fixtureNumber: number, homeSlotId: string | null, awaySlotId: string | null) =>
      prisma.$transaction(async (tx) => {
        await lock(tx);
        return createEmptyTournamentFixtureInTx(tx, { games }, admin, {
          tournament: tournamentInfo, groupId, round: 'league_r9', fixtureNumber, legNumber: 1, homeSlotId, awaySlotId,
        });
      });

    beforeAll(async () => {
      // 경기는 시작 전 대회(draft·open·closed)에서만 지울 수 있다 — 시드 대회는 in_progress 다.
      await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { status: 'closed' } });
      groupId = (await bracket.createGroup(user, ids.tournamentId, { name: 'empty-fixtures', phase: 'group' })).id;
      const row = await findTournamentOnSurface(prisma, TOURNAMENT_KINDS, {
        where: { id: ids.tournamentId },
        select: { id: true, sportId: true, regionId: true, title: true, competitionConfigVersionId: true, ...TOURNAMENT_VENUE_SELECT },
      });
      if (!row?.competitionConfigVersionId) throw new Error('fixture tournament has no competition config');
      tournamentInfo = { ...row, competitionConfigVersionId: row.competitionConfigVersionId };
    });
    afterAll(async () => {
      await prisma.v1Tournament.update({ where: { id: ids.tournamentId }, data: { status: 'in_progress' } });
    });

    it('빈 경기는 팀 없이 자리 둘에 연결되고 Game 사이드는 "미정" 이다', async () => {
      const [home, away] = [await slotOf(1), await slotOf(2)];
      const { id } = await emptyFixture(7001, home.id, away.id);

      const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id }, include: { game: { include: { sides: true } } } });
      expect(teamMatch).toMatchObject({ hostTeamId: null, approvedApplicantTeamId: null, homeSlotId: home.id, awaySlotId: away.id, status: 'matched' });
      expect(teamMatch.game?.sides.map((side) => [side.sideKey, side.teamId, side.displayNameSnapshot]).sort()).toEqual([
        ['AWAY', null, '어웨이 팀 미정'], ['HOME', null, '홈 팀 미정'],
      ]);
    });

    it('경기를 지우면 두 자리 연결이 풀려 자리를 지울 수 있다 — 다른 경기의 연결은 그대로다', async () => {
      const [homeA, awayA, homeB] = [await slotOf(11), await slotOf(12), await slotOf(13)];
      const target = await emptyFixture(7011, homeA.id, awayA.id);
      const bystander = await emptyFixture(7012, homeB.id, null);

      await expect(prisma.v1TournamentSlot.delete({ where: { id: homeA.id } })).rejects.toThrow();   // 연결이 남아 있으면 FK 가 막는다
      await bracket.deleteFixture(user, target.id);

      const after = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: target.id } });
      expect(after).toMatchObject({ homeSlotId: null, awaySlotId: null, status: 'archived' });
      await prisma.v1TournamentSlot.delete({ where: { id: homeA.id } });
      await prisma.v1TournamentSlot.delete({ where: { id: awayA.id } });
      expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: bystander.id } })).homeSlotId).toBe(homeB.id);
    });

    it('지운 좌표에 다시 만들면 새 경기가 생기고 멱등 키는 revision 접미사를 단다', async () => {
      const first = await emptyFixture(7021, null, null);
      await bracket.deleteFixture(user, first.id);

      const second = await emptyFixture(7021, null, null);

      expect(second.id).not.toBe(first.id);
      expect(await prisma.v1IdempotencyRecord.count({
        where: { idempotencyKey: `tournament-fixture:${ids.tournamentId}:league_r9:7021:1:revision:1` },
      })).toBe(1);
    });

    it('자리에 연결된 홈은 PATCH 로 못 바꾸고(SLOT_LINKED), 연결되지 않은 어웨이는 바꾼다', async () => {
      const home = await slotOf(21);
      const { id } = await emptyFixture(7031, home.id, null);

      await expect(bracket.updateFixture(user, id, { homeRegistrationId: reg0 })).rejects.toMatchObject({ response: { code: 'SLOT_LINKED' } });
      expect((await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id } })).hostTeamId).toBeNull();

      // reg1 은 시드 A조 편성에 있다 — empty-fixtures 조에 넣으려면 먼저 뗀다(한 팀 한 조).
      await prisma.v1TournamentGroupTeam.deleteMany({ where: { groupId: ids.groupId, registrationId: reg1 } });
      await bracket.updateFixture(user, id, { awayRegistrationId: reg1 });
      expect((await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: id } })).awayRegistrationId).toBe(reg1);
    });

    it('홈·어웨이 팀 교환 뒤에도 양 팀의 일정은 같은 시각에 활성 상태로 남는다', async () => {
      const { id } = await emptyFixture(7042, null, null);
      const scheduledAt = new Date('2026-10-20T10:00:00Z');
      await prisma.$transaction((tx) => updateTournamentMatchInTx(tx, {
        teamMatchId: id, homeRegistrationId: reg0, awayRegistrationId: reg1, scheduledAt,
      }));
      const before = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: id }, orderBy: { teamId: 'asc' } });
      expect(before).toHaveLength(2);
      await prisma.$transaction((tx) => updateTournamentMatchInTx(tx, {
        teamMatchId: id, homeRegistrationId: reg1, awayRegistrationId: reg0,
      }));
      const after = await prisma.v1TeamSchedule.findMany({ where: { teamMatchId: id }, orderBy: { teamId: 'asc' } });
      expect(after.map(({ id: scheduleId, teamId, state, cancelReason, startAt }) => ({ id: scheduleId, teamId, state, cancelReason, startAt })))
        .toEqual(before.map((row) => ({ id: row.id, teamId: row.teamId, state: 'SCHEDULED', cancelReason: null, startAt: scheduledAt })));
      expect(await prisma.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: id } }))
        .toMatchObject({ homeRegistrationId: reg1, awayRegistrationId: reg0 });
    });

    it('getBracket 은 자리 목록과 경기별 슬롯 id·game 블록을 실DB 에서 내고, 확정 결과 경기의 최신 리비전은 OFFICIAL 이다', async () => {
      const slot = await slotOf(31);
      const { id } = await emptyFixture(7041, slot.id, null);

      const view = await bracket.getBracket(user, ids.tournamentId);

      expect(view.slots.find((candidate) => candidate.id === slot.id)).toEqual({
        id: slot.id, kind: 'ENTRY', groupId, sourceGroupId: null, position: 31, byeSortOrder: null, automaticLabel: 'empty-fixtures 31번', displayLabel: null, label: 'empty-fixtures 31번', registrationId: null, teamName: null,
      });
      expect(view.fixtures.find((fixture) => fixture.id === id)).toMatchObject({
        homeSlotId: slot.id, awaySlotId: null,
        game: { state: 'SCHEDULED', hasLiveRecords: false, hasOfficialResult: false, latestRevision: null },
      });
      const decided = view.fixtures.filter((fixture) => fixture.result !== null);
      expect(decided.length).toBeGreaterThan(0);
      expect(decided.every((fixture) => fixture.game?.latestRevision?.state === 'OFFICIAL')).toBe(true);
    });
  });

  // ─── 통합 스펙 끝 (새 describe 는 이 줄 위에 추가한다) ───
});

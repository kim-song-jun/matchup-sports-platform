import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentSlotService } from '../../src/tournaments/slots/tournament-slot.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { runTournamentStandingsRecalculation } from '../../src/tournaments/tournament-standings-recalculation';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'group-tie@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const templates = new BracketTemplateService(prisma, adminContext, games);
const slots = new TournamentSlotService(prisma, adminContext, games);
const read = new TournamentsReadService(prisma, new TournamentStaffAccessService(prisma));

/** 확정 결과 하나를 직접 만든다 — 결과 입력 경로가 아니라 "끝난 조" 라는 전제가 필요하다. */
async function settle(teamMatchId: string, home: number, away: number) {
  const game = await prisma.v1Game.findFirstOrThrow({ where: { teamMatchId } });
  const revision = await prisma.v1GameResultRevision.create({
    data: {
      gameId: game.id,
      revision: 1,
      state: 'DRAFT',
      score: { home, away },
      eventsHash: `group-tie-${teamMatchId}`,
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'TEST_FIXTURE',
    },
  });
  await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date('2026-01-01T00:00:00.000Z') } });
  await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
  await prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'completed' } });
}

/**
 * 2조 x 3팀, 조 1·2위 진출. A조는 r0>r1>r2>r0 로 이겨 완전 동률, B조는 r0>r1>r2 로 동률 없음(대조).
 * 조별 경기를 모두 확정하고 순위표를 재계산한 뒤, 공개 상태로 돌려 둔다.
 */
async function seedSettledGroups(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 6 });
  await templates.apply(user, seeded.tournamentId, {
    kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 2, legs: 1, thirdPlace: false,
  });
  const entries = await prisma.v1TournamentSlot.findMany({
    where: { tournamentId: seeded.tournamentId, kind: 'ENTRY' },
    orderBy: [{ groupId: 'asc' }, { position: 'asc' }],
  });
  for (const [index, slot] of entries.entries()) await slots.assignSlot(user, slot.id, seeded.registrationIds[index]);

  const groups = await prisma.v1TournamentGroup.findMany({
    where: { tournamentId: seeded.tournamentId, phase: 'group' },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, groupTeams: { orderBy: { sortOrder: 'asc' }, select: { registrationId: true } } },
  });
  expect(groups).toHaveLength(2);
  const [tieGroup, cleanGroup] = groups;
  const tieTeams = tieGroup.groupTeams.map((row) => row.registrationId);
  const cleanTeams = cleanGroup.groupTeams.map((row) => row.registrationId);

  const details = await prisma.v1TournamentMatchDetails.findMany({
    where: { tournamentId: seeded.tournamentId, groupId: { in: groups.map((group) => group.id) } },
  });
  expect(details).toHaveLength(6);
  for (const detail of details) {
    const home = detail.homeRegistrationId!;
    const away = detail.awayRegistrationId!;
    if (detail.groupId === tieGroup.id) {
      const homeBeatsAway = tieTeams.indexOf(away) === (tieTeams.indexOf(home) + 1) % 3;
      await settle(detail.teamMatchId, homeBeatsAway ? 1 : 0, homeBeatsAway ? 0 : 1);
    } else {
      const homeBeatsAway = cleanTeams.indexOf(home) < cleanTeams.indexOf(away);
      await settle(detail.teamMatchId, homeBeatsAway ? 1 : 0, homeBeatsAway ? 0 : 1);
    }
  }

  const recalculated = await runTournamentStandingsRecalculation(prisma);
  expect(recalculated.quarantine.filter((q) => q.tournamentId === seeded.tournamentId)).toEqual([]);
  await prisma.v1Tournament.update({
    where: { id: seeded.tournamentId },
    data: { status: 'in_progress', bracketPublishedAt: new Date('2026-01-01T00:00:00.000Z') },
  });
  return { ...seeded, tieGroupId: tieGroup.id, cleanGroupId: cleanGroup.id, tieTeams, cleanTeams };
}

describe('동률 조 공개 순위표 — sharedRank·qualification (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('자리를 채우기 전: 동률 조는 공동 순위·진출 미정, 동률 없는 조는 상위 N팀(대조)', async () => {
    const seeded = await seedSettledGroups('tie-public-before');

    const detail = await read.get(seeded.tournamentId);

    const tie = detail.groups.find((group) => group.id === seeded.tieGroupId)!;
    expect(tie.qualification).toEqual({ advancingRegistrationIds: [], undecided: true });
    expect(tie.standings).toHaveLength(3);
    expect(new Set(tie.standings.map((row) => row.sharedRank))).toEqual(new Set([1]));

    const clean = detail.groups.find((group) => group.id === seeded.cleanGroupId)!;
    expect(clean.qualification?.undecided).toBe(false);
    expect([...(clean.qualification?.advancingRegistrationIds ?? [])].sort()).toEqual([seeded.cleanTeams[0], seeded.cleanTeams[1]].sort());
    expect(clean.standings.map((row) => row.sharedRank)).toEqual([null, null, null]);
  });

  it('어드민이 동률 팀을 직접 고른 뒤: 진출 팀 = 결선에 들어간 팀 (저장 순위 1·2위와 달라도 따른다)', async () => {
    const seeded = await seedSettledGroups('tie-public-after');
    const rankSlots = await prisma.v1TournamentSlot.findMany({
      where: { tournamentId: seeded.tournamentId, kind: 'GROUP_RANK', sourceGroupId: seeded.tieGroupId },
      orderBy: { position: 'asc' },
    });
    expect(rankSlots).toHaveLength(2);
    // 일부러 마지막 두 팀을 고른다 — 해시 순서로 position 1·2 를 받은 팀이 아닐 수 있는 쪽.
    const picked = [seeded.tieTeams[1], seeded.tieTeams[2]];

    await slots.fillFromStandings(user, seeded.tournamentId, [
      { slotId: rankSlots[0].id, registrationId: picked[0] },
      { slotId: rankSlots[1].id, registrationId: picked[1] },
    ]);
    const detail = await read.get(seeded.tournamentId);

    const tie = detail.groups.find((group) => group.id === seeded.tieGroupId)!;
    expect(tie.qualification).toEqual({ advancingRegistrationIds: [...picked].sort(), undecided: false });
    expect(new Set(tie.standings.map((row) => row.sharedRank))).toEqual(new Set([1]));
    // 동률 없는 B조 자리는 같은 채우기로 순위대로 들어갔다 — 배열 순서는 비교하지 않는다.
    const clean = detail.groups.find((group) => group.id === seeded.cleanGroupId)!;
    expect(clean.qualification?.undecided).toBe(false);
    expect([...(clean.qualification?.advancingRegistrationIds ?? [])].sort()).toEqual([seeded.cleanTeams[0], seeded.cleanTeams[1]].sort());
  });
});

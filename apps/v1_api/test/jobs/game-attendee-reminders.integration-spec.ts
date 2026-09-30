import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { formatKstMonthDayTime } from '../../src/common/kst-datetime';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { syncCompetitionTeamRosters } from '../../src/games/roster/game-roster-sync';
import { collectAttendeeReminderRows, type ReminderRow } from '../../src/jobs/lineup-reminders/game-attendee-reminders';
import { deliverReminderRows } from '../../src/jobs/lineup-reminders/lineup-reminder.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 180 G7 — 경기 전 알림의 수신자는 **발송 시점의 계산된 경기 명단**이다. 조정으로 빠진 선수, 팀을 나간
 * 선수, 팀원이 아닌 명단 선수는 받지 않고, (경기, 수신자)당 한 번만 쌓인다.
 */
describe('경기 전 알림 — 전날·킥오프 2시간 전 (Task 180 G7)', () => {
  const suiteId = randomUUID().slice(0, 8);
  const id = (key: string) => `g7-remind-${key}-${suiteId}`;
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  // 30일 뒤 14:00 KST(05:00 UTC) 경기. 2시간 전(12:00 KST)도, 전날 아침 스캔도 낮이다.
  const base = new Date();
  const kickoff = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + 30, 5, 0));
  const kickoffScanAt = new Date(kickoff.getTime() - 110 * 60_000); // 12:10 KST
  const dayBeforeScanAt = new Date(kickoff.getTime() - 24 * 60 * 60_000 - 4 * 60 * 60_000 + 30 * 60_000); // 전날 10:30 KST

  const users = ['owner-a', 'manager-a', 'a1', 'a2-excluded', 'a3-left', 'outsider', 'owner-b', 'b1-muted'];
  let tournamentId: string;
  let teamMatchId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    const regionId = (await prisma.v1Region.create({ data: { code: `g7r-${suiteId}`, name: 'G7 알림 지역', level: 2 } })).id;
    const config = await prisma.v1CompetitionConfigVersion.findFirst({ where: { name: 'futsal-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (config === null) throw new Error('futsal-v1 preset is required');
    await prisma.v1User.createMany({
      data: users.map((key) => ({ id: id(key), email: `${id(key)}@integration.test`, onboardingStatus: 'completed' as const, accountStatus: 'active' as const })),
    });
    const teamA = await prisma.v1Team.create({ data: { ownerUserId: id('owner-a'), sportId: sport.id, regionId, name: `마포 FC ${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId: id('owner-b'), sportId: sport.id, regionId, name: `합정 유나이티드 ${suiteId}` } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: teamA.id, userId: id('owner-a'), role: 'owner' },
        { teamId: teamA.id, userId: id('manager-a'), role: 'manager' },
        { teamId: teamA.id, userId: id('a1') },
        { teamId: teamA.id, userId: id('a2-excluded') },
        { teamId: teamA.id, userId: id('a3-left'), status: 'left' },
        { teamId: teamB.id, userId: id('owner-b'), role: 'owner' },
        { teamId: teamB.id, userId: id('b1-muted') },
      ],
    });
    await prisma.v1NotificationPreference.create({ data: { userId: id('b1-muted'), teamMatchEnabled: false } });

    const tournament = await prisma.v1Tournament.create({
      data: { sportId: sport.id, regionId, title: `G7 알림 대회 ${suiteId}`, competitionConfigVersionId: config.id, status: 'in_progress' },
    });
    tournamentId = tournament.id;
    const rosterOf: Record<string, string[]> = {
      [teamA.id]: ['owner-a', 'a1', 'a2-excluded', 'a3-left', 'outsider'],
      [teamB.id]: ['owner-b', 'b1-muted'],
    };
    const registrationIds = new Map<string, string>();
    for (const team of [teamA, teamB]) {
      const registration = await prisma.v1TournamentRegistration.create({
        data: { tournamentId, teamId: team.id, appliedByUserId: team.ownerUserId, status: 'confirmed' },
      });
      registrationIds.set(team.id, registration.id);
      await prisma.v1TournamentPlayer.createMany({
        data: rosterOf[team.id].map((key) => ({ registrationId: registration.id, userId: id(key), realName: key })),
      });
    }

    const teamMatch = await prisma.v1TeamMatch.create({
      data: {
        tournamentId, sportId: sport.id, regionId, title: 'G7 알림 경기', placeName: '망원 유수지 풋살장', status: 'matched',
        hostTeamId: teamA.id, approvedApplicantTeamId: teamB.id, startAt: kickoff, competitionConfigVersionId: config.id,
      },
    });
    teamMatchId = teamMatch.id;
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId, tournamentId, round: 'group', fixtureNumber: 1,
        homeRegistrationId: registrationIds.get(teamA.id)!, awayRegistrationId: registrationIds.get(teamB.id)!,
      },
    });
    const creation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatchId,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: teamA.id, displayNameSnapshot: '홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: teamB.id, displayNameSnapshot: '원정' },
      ],
      participants: [],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: id('owner-a'), role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `g7-remind-${suiteId}`,
      payloadHash: canonicalGameCommandPayloadHash(creation),
    };
    await prisma.$transaction((tx) => app.get(GamesService).createFromSourceInTransaction(tx, creation, context));
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { sides: true } });
    const sideA = game.sides.find((side) => side.teamId === teamA.id)!;
    await prisma.v1GameRosterAdjustment.create({
      data: { gameId: game.id, sideId: sideA.id, teamId: teamA.id, userId: id('a2-excluded'), action: 'EXCLUDE', actorUserId: id('owner-a'), actorRole: 'TEAM_MANAGER' },
    });
    for (const team of [teamA, teamB]) {
      await prisma.$transaction((tx: Prisma.TransactionClient) => syncCompetitionTeamRosters(tx, { competitionId: tournamentId, teamId: team.id }));
    }
  });

  afterAll(async () => cleanup?.());

  const mine = (rows: ReminderRow[]) => rows.filter((row) => row.targetId === `${tournamentId}:${teamMatchId}`);
  const byUser = (rows: ReminderRow[]) => new Map(mine(rows).map((row) => [row.userId.replace(`g7-remind-`, '').replace(`-${suiteId}`, ''), row]));

  it('전날: 계산된 경기 명단의 활성 팀원만 받고, 대회 팀장·매니저(명단 확인 대상)·빠진 선수·탈퇴자·비팀원은 받지 않는다', async () => {
    const rows = byUser(await prisma.$transaction((tx) => collectAttendeeReminderRows(tx, dayBeforeScanAt)));

    // owner-b 는 명단 선수지만 팀장이라 "명단 확인"을 따로 받는다. b1 은 수신 설정은 배달 단계에서 거른다.
    expect([...rows.keys()].sort()).toEqual(['a1', 'b1-muted']);
    expect(rows.get('a1')).toMatchObject({
      title: `${formatKstMonthDayTime(kickoff)} 경기가 있어요`,
      body: `vs 합정 유나이티드 ${suiteId} · 망원 유수지 풋살장. 출전 명단은 경기 전까지 바뀔 수 있어요.`,
      targetType: 'tournament',
      deepLink: `/tournaments/${tournamentId}/matches/${teamMatchId}`,
    });
  });

  it('킥오프 2시간 전: 출전자와 팀장·매니저가 받고, 두 번 돌려도 사람마다 한 건이며 경기 알림을 끈 사람은 빠진다', async () => {
    const collect = () => prisma.$transaction((tx) => collectAttendeeReminderRows(tx, kickoffScanAt));
    const rows = byUser(await collect());
    expect([...rows.keys()].sort()).toEqual(['a1', 'b1-muted', 'manager-a', 'owner-a', 'owner-b']);
    expect(rows.get('a1')?.body).toMatch(/지금 출전 명단에 있어요\.$/);
    expect(rows.get('owner-a')?.body).toMatch(/지금 출전 명단에 있어요\.$/); // 명단에 든 팀장
    expect(rows.get('manager-a')?.body).toBe(`14:00 vs 합정 유나이티드 ${suiteId} · 망원 유수지 풋살장.`);

    for (let round = 0; round < 2; round += 1) {
      const fresh = mine(await collect());
      await prisma.$transaction((tx) => deliverReminderRows(tx, fresh, { prefField: 'teamMatchEnabled' }));
    }
    const stored = await prisma.v1Notification.findMany({ where: { businessKey: { startsWith: 'game-kickoff:' }, targetId: `${tournamentId}:${teamMatchId}` } });
    expect(stored.map((row) => row.recipientUserId).sort()).toEqual(['a1', 'manager-a', 'owner-a', 'owner-b'].map(id).sort());
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { GamesService } from '../../src/games/games.service';
import {
  LEAGUE_ROSTER_MIGRATED_ACTION,
  leagueRosterMigrationRequestId,
  syncCompetitionTeamRosters,
} from '../../src/games/roster/game-roster-sync';
import { createLeagueFixture, loadLeagueTeamRosters } from '../../src/league-matches/league-fixture-creation';
import { migrateLeagueRosterAdjustments } from '../../src/league-matches/migration/league-roster-adjustment-migration';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../src/team-matches/resolve-team-match-competition-config';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 179 리그 이관 — 팀장 저장본(예전 `/team-matches/:id/lineup` 저장)을 경기 명단 조정으로 옮긴다.
 * dry-run 은 아무것도 남기지 않고, 적용 뒤 시작 전 경기 명단은 저장본(계정 있는 행)과 같으며 그 뒤로는 계산을 따른다.
 * 저장본은 지금 경로로 만들 수 없어(대회·리그 라인업 저장은 409) 저장 경로가 남기던 행·멱등 기록을 그대로 심는다.
 */
describe('리그 팀장 저장본 → 경기 명단 조정 이관', () => {
  const suiteId = randomUUID().slice(0, 8);
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let adminUserId: string;
  let seq = 0;
  const DAY = 86_400_000;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `lrm-region-${suiteId}`, name: '이관 지역', level: 2 } })).id;
    adminUserId = await makeUser('운영자');
  });

  afterAll(async () => cleanup?.());

  async function makeUser(label: string): Promise<string> {
    seq += 1;
    const id = `lrm-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0105176${String(seq).padStart(4, '0')}`,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: `${label}-${seq}`, realName: `${label}${seq}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    return id;
  }

  async function makeTeam(label: string, memberLabels: readonly string[]) {
    const ownerId = await makeUser(`${label}장`);
    const team = await prisma.v1Team.create({ data: { ownerUserId: ownerId, sportId, regionId, name: `lrm-${label}-${suiteId}-${seq}` } });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerId, role: 'owner', status: 'active' } });
    const members: string[] = [];
    for (const memberLabel of memberLabels) {
      const userId = await makeUser(memberLabel);
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId, role: 'member', status: 'active' } });
      members.push(userId);
    }
    return { id: team.id, ownerId, members };
  }

  const latestLineup = (gameId: string, sideId: string) =>
    prisma.v1GameLineup.findFirstOrThrow({ where: { gameId, sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
  async function rosterOf(gameId: string, sideId: string): Promise<string[]> {
    const rows = await prisma.v1GameParticipant.findMany({ where: { lineupId: (await latestLineup(gameId, sideId)).id } });
    return rows.map((row) => row.userId ?? `name:${row.displayNameSnapshot}`).sort();
  }
  const sorted = (ids: readonly string[]) => [...ids].sort();

  /** 팀장 저장본 한 리비전(SUBMITTED)과, `saver` 가 있으면 저장 요청이 남기던 멱등 기록. */
  async function saveLegacyLineup(
    target: { gameId: string; sideId: string; teamMatchId: string },
    rows: ReadonlyArray<{ userId: string | null; name: string; jersey?: number }>,
    saver: string | null,
  ) {
    const previous = await latestLineup(target.gameId, target.sideId);
    const lineup = await prisma.v1GameLineup.create({
      data: {
        gameId: target.gameId,
        sideId: target.sideId,
        revision: previous.revision + 1,
        supersedesId: previous.id,
        state: 'SUBMITTED',
        submittedAt: new Date(),
      },
    });
    for (const row of rows) {
      await prisma.v1GameParticipant.create({
        data: {
          gameId: target.gameId,
          sideId: target.sideId,
          lineupId: lineup.id,
          userId: row.userId,
          displayNameSnapshot: row.name,
          jerseyNumber: row.jersey ?? null,
          started: true,
        },
      });
    }
    if (saver !== null) {
      await prisma.v1IdempotencyRecord.create({
        data: {
          actorUserId: saver,
          action: 'save',
          resourceType: 'TEAM_MATCH_LINEUP',
          resourceId: target.teamMatchId,
          idempotencyKey: `lrm-${lineup.id}`,
          payloadHash: 'legacy',
          responseStatus: 200,
          responseBody: {
            teamMatchId: target.teamMatchId,
            gameId: target.gameId,
            sideId: target.sideId,
            lineupId: lineup.id,
            revision: lineup.revision,
            state: lineup.state,
            version: lineup.revision,
          },
          expiresAt: new Date(Date.now() + DAY),
        },
      });
    }
    return lineup;
  }

  /**
   * 리그 하나에 시작 전 경기(A·B 모두 팀장 저장본, B는 저장한 사람을 알 수 없음)와 끝난 경기(A 저장본),
   * 킥오프가 지났지만 결과 입력 전이라 SCHEDULED 인 경기(A 저장본 — 게스트 포함, 이미 치렀을 수 있다).
   * A팀 확정 신청은 명단 행이 한 번도 없는 상태 — 이관이 기준 명단을 읽으려고 채운다(dry-run 은 되돌린다).
   */
  async function seed() {
    const teamA = await makeTeam('A', ['m1', 'm2']);
    const teamB = await makeTeam('B', ['n1']);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `이관 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [teamA.id, teamB.id],
      appliedByUserId: teamA.ownerId,
    });
    const config = await resolveTeamMatchCompetitionConfig(prisma, sportId);
    const fixture = async (title: string, days: number) => {
      const teamMatchId = await prisma.$transaction(async (tx) => {
        const teams = await loadLeagueTeamRosters(tx, league.id, [teamA.id, teamB.id]);
        return createLeagueFixture(tx, app.get(GamesService), {
          leagueId: league.id,
          adminUserId,
          sportId,
          regionId,
          competitionConfigId: config!.id,
          title,
          placeName: '테스트 구장',
          startAt: new Date(Date.now() + days * DAY),
          endAt: null,
          home: teams.get(teamA.id)!,
          away: teams.get(teamB.id)!,
        });
      });
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { sides: true } });
      const sideOf = (teamId: string) => ({ gameId: game.id, sideId: game.sides.find((row) => row.teamId === teamId)!.id, teamMatchId });
      return { a: sideOf(teamA.id), b: sideOf(teamB.id) };
    };
    const upcoming = await fixture('이관 대상 경기', 7);
    const ended = await fixture('끝난 경기', 14);
    await prisma.v1Game.update({ where: { id: ended.a.gameId }, data: { state: 'ENDED' } });
    const played = await fixture('킥오프 지난 경기', 21);
    await prisma.v1TeamMatch.update({ where: { id: played.a.teamMatchId }, data: { startAt: new Date(Date.now() - DAY) } });
    const [m1] = teamA.members;
    const legacyA = await saveLegacyLineup(
      upcoming.a,
      [
        { userId: teamA.ownerId, name: 'A팀장' },
        // 참가 명단(채움)에는 번호가 없다 — 옮긴 뒤 명단은 참가 명단 번호를 따르므로 dry-run 이 따로 센다.
        { userId: m1, name: '선수 m1', jersey: 7 },
        { userId: null, name: '용병 김' },
      ],
      teamA.ownerId,
    );
    const legacyB = await saveLegacyLineup(upcoming.b, [{ userId: teamB.ownerId, name: 'B팀장' }], null);
    const legacyEnded = await saveLegacyLineup(ended.a, [{ userId: teamA.ownerId, name: 'A팀장' }], teamA.ownerId);
    const legacyPlayed = await saveLegacyLineup(
      played.a,
      [
        { userId: teamA.ownerId, name: 'A팀장' },
        { userId: null, name: '용병 박' },
      ],
      teamA.ownerId,
    );
    const registrationA = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: teamA.id } },
    });
    await prisma.v1TournamentPlayer.deleteMany({ where: { registrationId: registrationA.id } });
    return { league, teamA, teamB, upcoming, ended, played, legacyA, legacyB, legacyEnded, legacyPlayed, registrationA };
  }

  const reportOf = (result: Awaited<ReturnType<typeof migrateLeagueRosterAdjustments>>, sideId: string) =>
    result.sides.find((row) => row.sideId === sideId);

  it('dry-run 은 적용과 같은 계산을 보고하고 아무것도 남기지 않는다 — 기준 명단을 읽으려 채운 참가 명단까지 되돌린다', async () => {
    const f = await seed();

    const result = await migrateLeagueRosterAdjustments(prisma);

    expect(result.dryRun).toBe(true);
    expect(reportOf(result, f.upcoming.a.sideId)).toMatchObject({
      status: 'WOULD_MIGRATE',
      excludeCount: 1,
      unrepresentableRows: 1,
      jerseyChangedRows: 1,
      rosterChanged: true,
    });
    expect(result.jerseyChangedRows).toBe(1);
    expect(reportOf(result, f.upcoming.b.sideId)).toMatchObject({ status: 'ACTOR_UNRESOLVED', excludeCount: 1 });
    expect(reportOf(result, f.ended.a.sideId)).toBeUndefined();
    // 킥오프가 지난 팀장 저장본은 옮기지 않고 따로 센다(승인 판단용). 저장본이 없는 상대 사이드는 세지 않는다.
    expect(reportOf(result, f.played.a.sideId)).toMatchObject({ status: 'KICKOFF_PASSED', excludeCount: 0 });
    expect(reportOf(result, f.played.b.sideId)).toBeUndefined();
    expect(result.kickoffPassedSides).toBe(result.sides.filter((row) => row.status === 'KICKOFF_PASSED').length);
    expect(result.migratedSides).toBe(result.sides.filter((row) => row.status === 'WOULD_MIGRATE').length);
    expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: f.upcoming.a.gameId } })).toBe(0);
    expect(
      await prisma.v1OperationAudit.findFirst({
        where: { requestId: leagueRosterMigrationRequestId(f.upcoming.a.gameId, f.upcoming.a.sideId) },
      }),
    ).toBeNull();
    expect((await latestLineup(f.upcoming.a.gameId, f.upcoming.a.sideId)).id).toBe(f.legacyA.id);
    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: f.registrationA.id } })).toBe(0);
  });

  it('적용하면 저장본에 없던 사람만 팀장 이름으로 빠지고 경기 명단이 저장본(계정 행)과 같아지며, 그 뒤로는 계산을 따른다', async () => {
    const f = await seed();
    const [m1, m2] = f.teamA.members;

    const result = await migrateLeagueRosterAdjustments(prisma, { apply: true });

    expect(reportOf(result, f.upcoming.a.sideId)).toMatchObject({ status: 'MIGRATED', excludeCount: 1, unrepresentableRows: 1 });
    expect(reportOf(result, f.upcoming.b.sideId)).toMatchObject({ status: 'ACTOR_UNRESOLVED' });
    const adjustments = await prisma.v1GameRosterAdjustment.findMany({ where: { gameId: f.upcoming.a.gameId } });
    expect(
      adjustments.map((row) => [row.sideId, row.teamId, row.userId, row.actorUserId, row.actorRole, row.reason, row.revokedAt]),
    ).toEqual([[f.upcoming.a.sideId, f.teamA.id, m2, f.teamA.ownerId, 'TEAM_MANAGER', null, null]]);
    expect(
      await prisma.v1OperationAudit.findFirst({
        where: {
          requestId: leagueRosterMigrationRequestId(f.upcoming.a.gameId, f.upcoming.a.sideId),
          action: LEAGUE_ROSTER_MIGRATED_ACTION,
        },
      }),
    ).not.toBeNull();
    const latestA = await latestLineup(f.upcoming.a.gameId, f.upcoming.a.sideId);
    expect([latestA.state, latestA.supersedesId]).toEqual(['SUBMITTED', f.legacyA.id]);
    expect(await rosterOf(f.upcoming.a.gameId, f.upcoming.a.sideId)).toEqual(sorted([f.teamA.ownerId, m1]));
    // 저장한 사람을 모르는 사이드와 끝난 경기는 그대로다.
    expect((await latestLineup(f.upcoming.b.gameId, f.upcoming.b.sideId)).id).toBe(f.legacyB.id);
    expect((await latestLineup(f.ended.a.gameId, f.ended.a.sideId)).id).toBe(f.legacyEnded.id);
    expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: f.ended.a.gameId } })).toBe(0);
    // 킥오프가 지난 경기의 저장본(게스트 포함)은 덮지 않는다 — 이관 표시도 남기지 않아 동기화도 건드리지 않는다.
    expect(reportOf(result, f.played.a.sideId)).toMatchObject({ status: 'KICKOFF_PASSED' });
    expect((await latestLineup(f.played.a.gameId, f.played.a.sideId)).id).toBe(f.legacyPlayed.id);
    expect(await rosterOf(f.played.a.gameId, f.played.a.sideId)).toEqual(sorted([f.teamA.ownerId, 'name:용병 박']));
    expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: f.played.a.gameId } })).toBe(0);
    expect(
      await prisma.v1OperationAudit.findFirst({
        where: { requestId: leagueRosterMigrationRequestId(f.played.a.gameId, f.played.a.sideId) },
      }),
    ).toBeNull();

    const m3 = await makeUser('m3');
    await prisma.v1TeamMembership.create({ data: { teamId: f.teamA.id, userId: m3, role: 'member', status: 'active' } });
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registrationA.id, userId: m3, realName: '명단 선수' } });
    await prisma.$transaction((tx) => syncCompetitionTeamRosters(tx, { competitionId: f.league.id, teamId: f.teamA.id }));
    expect(await rosterOf(f.upcoming.a.gameId, f.upcoming.a.sideId)).toEqual(sorted([f.teamA.ownerId, m1, m3]));

    const again = await migrateLeagueRosterAdjustments(prisma, { apply: true });
    expect(reportOf(again, f.upcoming.a.sideId)).toBeUndefined();
    expect(reportOf(again, f.upcoming.b.sideId)).toMatchObject({ status: 'ACTOR_UNRESOLVED' });
  });
});

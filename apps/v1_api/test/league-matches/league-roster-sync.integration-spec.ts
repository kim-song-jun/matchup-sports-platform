import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { GamesService } from '../../src/games/games.service';
import { createLeagueFixture, loadLeagueTeamRosters } from '../../src/league-matches/league-fixture-creation';
import { LEAGUE_ROSTER_SYNC_ACTION, syncLeagueRosterLineups } from '../../src/league-matches/league-roster-sync';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../src/team-matches/resolve-team-match-competition-config';
import { TournamentPlayersService } from '../../src/tournaments/tournament-players.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 170 D1′ — 리그 참가 명단이 바뀌면 시작 전 경기의 시스템 명단(리비전 1 또는 동기화 리비전,
 * DRAFT)을 참가 명단에 다시 맞추고, 팀이 저장·제출한 라인업과 시작 시각이 지난 경기는 건드리지 않는다.
 */
describe('리그 참가 명단 → 시작 전 경기 명단 동기화', () => {
  const suiteId = randomUUID().slice(0, 8);
  const adminUserId = `t170-sync-admin-${suiteId}`;
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let seq = 0;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: { id: adminUserId, email: `${adminUserId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' },
    });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    const region = await prisma.v1Region.create({ data: { code: `t170-sync-region-${suiteId}`, name: 'T170 동기화 지역', level: 2 } });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  /** 명단 추가 자격을 모두 갖춘 사용자. */
  async function makeUser(): Promise<string> {
    seq += 1;
    const userId = `t170-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id: userId,
        email: `${userId}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0101170${String(seq).padStart(4, '0')}`,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: `동기화선수${seq}`, realName: `동기화선수${seq}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    return userId;
  }

  async function makeMember(teamId: string): Promise<string> {
    const userId = await makeUser();
    await prisma.v1TeamMembership.create({ data: { teamId, userId, role: 'member', status: 'active' } });
    return userId;
  }

  async function seedFixture() {
    const captainId = await makeUser();
    const team = await prisma.v1Team.create({
      data: { ownerUserId: captainId, sportId, regionId, name: `t170-team-${suiteId}-${seq}` },
    });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: captainId, role: 'owner', status: 'active' } });
    const members = [await makeMember(team.id), await makeMember(team.id)];
    const opponent = await prisma.v1Team.create({
      data: { ownerUserId: captainId, sportId, regionId, name: `t170-opp-${suiteId}-${seq}` },
    });
    await makeMember(opponent.id);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `T170 동기화 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [team.id, opponent.id],
      appliedByUserId: captainId,
    });
    const registration = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: team.id } },
    });
    const config = await resolveTeamMatchCompetitionConfig(prisma, sportId);
    const teamMatchId = await prisma.$transaction(async (tx) => {
      const teams = await loadLeagueTeamRosters(tx, league.id, [team.id, opponent.id]);
      return createLeagueFixture(tx, app.get(GamesService), {
        leagueId: league.id,
        adminUserId,
        sportId,
        regionId,
        competitionConfigId: config!.id,
        title: `T170 동기화 대진 ${seq}`,
        placeName: '테스트 구장',
        startAt: new Date(Date.now() + 7 * 86_400_000),
        endAt: null,
        home: teams.get(team.id)!,
        away: teams.get(opponent.id)!,
      });
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const side = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: game.id, teamId: team.id } });
    const opponentSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: game.id, teamId: opponent.id } });
    const captain: V1AuthUser = {
      id: captainId,
      email: `${captainId}@integration.test`,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    return { league, team, registration, members, captain, game, side, opponentSide, teamMatchId };
  }

  const latestLineup = (gameId: string, sideId: string) =>
    prisma.v1GameLineup.findFirstOrThrow({ where: { gameId, sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
  const participantsOf = (lineupId: string) =>
    prisma.v1GameParticipant.findMany({ where: { lineupId }, orderBy: { displayNameSnapshot: 'asc' } });
  const sync = (leagueId: string, teamId: string) =>
    prisma.$transaction((tx) => syncLeagueRosterLineups(tx, { leagueId, teamId }));

  /**
   * #9 (2026-09-19 QA) 이후: `seedFixture()`의 팀장·팀원 전부(활성 멤버십엔 역할 구분이 없다 —
   * `fillLeagueTeamRoster`는 owner 도 후보로 본다)가 자격을 갖췄으므로 대진 생성 시점에
   * 이미 자동으로 명단에 올라간다(`loadLeagueTeamRosters`가 `fillLeagueTeamRoster`를 즉시
   * 부른다 — D10 크론을 기다리지 않는다). 그래서 "명단 변경 → 동기화"를 재현하려면
   * **대진 생성 뒤에** 새로 합류한 팀원을 써야 한다 — 이미 자동으로 올라간 사람을 다시
   * 추가하면 `PLAYER_ALREADY_REGISTERED` 409 가 난다.
   */
  it('명단에 선수를 추가하면 시작 전 경기 명단이 그 선수(계정 포함)로 바뀌고, 상대 사이드는 그대로다', async () => {
    const f = await seedFixture();
    const newMember = await makeMember(f.team.id);

    await app.get(TournamentPlayersService).addPlayer(f.captain, f.league.id, f.registration.id, { userId: newMember } as never);

    const latest = await latestLineup(f.game.id, f.side.id);
    expect([latest.revision, latest.state]).toEqual([2, 'DRAFT']);
    const rows = await participantsOf(latest.id);
    expect(rows.map((row) => row.userId).sort()).toEqual([f.captain.id, f.members[0], f.members[1], newMember].sort());
    expect(rows.every((row) => row.started)).toBe(true);
    const newRow = rows.find((row) => row.userId === newMember)!;
    const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({ where: { participantId: newRow.id } });
    expect(links.map((link) => link.userId)).toEqual([newMember]);
    const events = await prisma.v1ParticipantIdentityLinkEvent.findMany({ where: { participantId: newRow.id } });
    expect(events.map((event) => [event.action, event.systemActor])).toEqual([['ROSTER_ASSERTED', 'LEAGUE_ROSTER_SYNC']]);
    const marker = await prisma.v1OperationAudit.findFirst({
      where: { requestId: `${f.game.id}:${latest.id}`, action: LEAGUE_ROSTER_SYNC_ACTION },
    });
    expect(marker).not.toBeNull();
    expect((await latestLineup(f.game.id, f.opponentSide.id)).revision).toBe(1);
  });

  it('명단에서 선수를 빼면 그 선수가 빠진 리비전으로 다시 맞춘다 — 동기화 리비전 위에서도 이어진다', async () => {
    const f = await seedFixture();
    const players = app.get(TournamentPlayersService);
    // 팀장·members[0]·[1] 전원이 대진 생성 시점에 이미 자동 등록돼 있다 — members[0]의 행을 찾아서 뺀다.
    const first = await prisma.v1TournamentPlayer.findFirstOrThrow({
      where: { registrationId: f.registration.id, userId: f.members[0] },
    });

    await players.removePlayer(f.captain, f.league.id, f.registration.id, first.id);

    const latest = await latestLineup(f.game.id, f.side.id);
    expect(latest.revision).toBe(2);
    expect((await participantsOf(latest.id)).map((row) => row.userId).sort()).toEqual(
      [f.captain.id, f.members[1]].sort(),
    );
  });

  /**
   * #9 후속 리뷰 지적(2026-09-19): `loadLeagueTeamRosters`가 "명단 비어 있음" 을 활성
   * 선수 수로 재던 시절엔, 미래 경기가 있는 등록에서 **마지막 활성 선수를 지우면** 같은
   * 트랜잭션의 동기화가 활성 0명을 보고 그 팀 멤버십으로 즉시 재채움을 시도했다. 방금
   * 지운 유저도 여전히 활성 팀원이라 다시 넣으려다 `(registrationId, userId)` 유니크
   * 제약(soft-delete 와 무관하게 전역)에 걸려 예외가 났고, 같은 트랜잭션 안이라 **삭제
   * 자체가 롤백됐다.** 지금은 "행이 아예 없는가" 로 재므로(전체 행 수), 소프트 삭제된
   * 행이 있는 등록은 다시 채우지 않는다 — 삭제가 정상적으로 끝나야 한다.
   */
  it('#9 후속: 마지막 참가자를 삭제해도 롤백되지 않고, 다시 채워지지 않는다', async () => {
    const f = await seedFixture();
    const players = app.get(TournamentPlayersService);
    // 대진 생성 시 팀장 + members[0] + members[1] 전원이 이미 자동 등록돼 있다.
    const rows = await prisma.v1TournamentPlayer.findMany({
      where: { registrationId: f.registration.id, removedAt: null },
    });
    expect(rows).toHaveLength(3);

    for (const row of rows) {
      await expect(
        players.removePlayer(f.captain, f.league.id, f.registration.id, row.id),
      ).resolves.toBeDefined();
    }

    const active = await prisma.v1TournamentPlayer.count({
      where: { registrationId: f.registration.id, removedAt: null },
    });
    expect(active).toBe(0);
    // "올렸다가 전원 뺀 팀" 은 자동 채움 대상이 아니다 — 소프트 삭제된 3건 그대로이고
    // 새로 생기지 않는다.
    const everRegistered = await prisma.v1TournamentPlayer.count({
      where: { registrationId: f.registration.id },
    });
    expect(everRegistered).toBe(3);
  });

  it('팀장이 저장한 라인업은 덮지 않는다', async () => {
    const f = await seedFixture();
    const generated = await latestLineup(f.game.id, f.side.id);
    const teamSaved = await prisma.v1GameLineup.create({
      data: { gameId: f.game.id, sideId: f.side.id, revision: 2, supersedesId: generated.id },
    });
    const newMember = await makeMember(f.team.id);
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: newMember, realName: '명단 선수' } });

    expect(await sync(f.league.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).id).toBe(teamSaved.id);
  });

  it('자동 명단(리비전 1)이라도 팀장이 제출했으면 덮지 않는다', async () => {
    const f = await seedFixture();
    const generated = await latestLineup(f.game.id, f.side.id);
    await prisma.v1GameLineup.update({
      where: { id: generated.id },
      data: { state: 'SUBMITTED', submittedAt: new Date(), version: { increment: 1 } },
    });
    const newMember = await makeMember(f.team.id);
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: newMember, realName: '명단 선수' } });

    expect(await sync(f.league.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).id).toBe(generated.id);
  });

  it('시작 시각이 지난 경기는 맞추지 않는다', async () => {
    const f = await seedFixture();
    await prisma.v1TeamMatch.update({ where: { id: f.teamMatchId }, data: { startAt: new Date(Date.now() - 60_000) } });
    const newMember = await makeMember(f.team.id);
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: newMember, realName: '명단 선수' } });

    expect(await sync(f.league.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(1);
  });

  it('명단이 이미 같으면 새 리비전을 만들지 않는다', async () => {
    const f = await seedFixture();
    const newMember = await makeMember(f.team.id);
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: newMember, realName: '명단 선수' } });

    expect(await sync(f.league.id, f.team.id)).toBe(1);
    expect(await sync(f.league.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(2);
  });

  it('초안(draft) 리그에서도 팀장이 참가 명단을 낼 수 있다 — 대진 전에 명단을 받는다', async () => {
    const captainId = await makeUser();
    const team = await prisma.v1Team.create({
      data: { ownerUserId: captainId, sportId, regionId, name: `t170-draft-team-${suiteId}-${seq}` },
    });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: captainId, role: 'owner', status: 'active' } });
    const member = await makeMember(team.id);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `T170 초안 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'draft',
      teamIds: [team.id],
      appliedByUserId: captainId,
    });
    const registration = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: team.id } },
    });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: league.id } })).status).toBe('draft');

    await app.get(TournamentPlayersService).addPlayer(
      { id: captainId, email: `${captainId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' },
      league.id,
      registration.id,
      { userId: member } as never,
    );

    expect(await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id, removedAt: null } })).toBe(1);
  });

  /**
   * #9 후속 리뷰 지적(2026-09-19): 대진 생성이 즉시 채우기를 하는데, 그 결과를
   * `notifyLeagueRosterFillOutcomes` 로 알리지 않으면 팀장은 "명단이 자동으로 채워졌다"는
   * 것도, "일부는 자격 미달로 빠졌다"는 것도 알 방법이 없다. 게다가 한 번 채워지면 그
   * 등록은 D10 크론의 대상(`players: { none: {} }`)에서도 빠지므로 **영영 알림을 못 받는다.**
   */
  it('#9 후속: 대진 생성이 즉시 채우면 팀장에게 제외 사유가 담긴 알림이 간다', async () => {
    const captainId = await makeUser();
    const team = await prisma.v1Team.create({
      data: { ownerUserId: captainId, sportId, regionId, name: `t170-notify-team-${suiteId}-${seq}` },
    });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: captainId, role: 'owner', status: 'active' } });
    const eligibleMember = await makeMember(team.id);
    // 자격 미달 팀원 — 실명·생년월일·휴대폰이 없다.
    seq += 1;
    const ineligibleId = `t170-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: { id: ineligibleId, email: `${ineligibleId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' },
    });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ineligibleId, role: 'member', status: 'active' } });
    const opponent = await prisma.v1Team.create({
      data: { ownerUserId: captainId, sportId, regionId, name: `t170-notify-opp-${suiteId}-${seq}` },
    });
    await makeMember(opponent.id);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `T170 알림 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [team.id, opponent.id],
      appliedByUserId: captainId,
    });
    const registration = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: team.id } },
    });
    const config = await resolveTeamMatchCompetitionConfig(prisma, sportId);

    await prisma.$transaction(async (tx) => {
      const teams = await loadLeagueTeamRosters(tx, league.id, [team.id, opponent.id]);
      return createLeagueFixture(tx, app.get(GamesService), {
        leagueId: league.id,
        adminUserId,
        sportId,
        regionId,
        competitionConfigId: config!.id,
        title: 'T170 알림 대진',
        placeName: '테스트 구장',
        startAt: new Date(Date.now() + 7 * 86_400_000),
        endAt: null,
        home: teams.get(team.id)!,
        away: teams.get(opponent.id)!,
      });
    });

    // 캡틴(owner) 도 자격을 갖춘 활성 멤버라 함께 채워진다 — 팀원 3명(캡틴+eligible+ineligible)
    // 중 2명 등록, 1명 제외.
    expect(
      await prisma.v1TournamentPlayer.count({ where: { registrationId: registration.id, removedAt: null } }),
    ).toBe(2);
    const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registration.id } });
    expect(players.map((p) => p.userId).sort()).toEqual([captainId, eligibleMember].sort());

    const notifications = await prisma.v1Notification.findMany({
      where: { recipientUserId: captainId, targetType: 'tournament', targetId: league.id },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('리그 명단이 자동 확정됐어요');
    expect(notifications[0].body).toContain('3명 중 2명이 등록됐어요');
    expect(notifications[0].body).toContain('제외:');
  });
});

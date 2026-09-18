import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';
import { TOURNAMENT_ROSTER_SYNC_ACTION, syncTournamentRosterLineups } from '../../src/tournaments/tournament-roster-sync';
import { AdminRegistrationsService } from '../../src/tournaments/admin-registrations.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { TournamentPlayersService } from '../../src/tournaments/tournament-players.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * 실사용자 발견 결함(2026-09-15) — 대회는 대진 생성 시점에 신청 명단을 한 번 복사해 경기
 * 참가자를 만드는데, 로스터 잠금 여부를 보지 않고 한 번 만든 뒤로는 절대 다시 돌지 않는다.
 * 로스터가 아직 비었을 때 대진부터 생기면(또는 대진 생성 뒤 명단이 바뀌면) 경기 참가자가
 * 그 시점 스냅샷에 영원히 고정된다. 리그는 Task 170 D1′(league-roster-sync.ts)가 이미
 * 막았지만 그 태스크 문서 자체가 "대회는 범위 밖"이라고 적어 뒀다 — 이 스펙은 그 대회판.
 */
describe('대회 참가 명단 → 시작 전 대진 경기 명단 동기화', () => {
  const suiteId = randomUUID().slice(0, 8);
  const adminUserId = `roster-sync-admin-${suiteId}`;
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
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner', status: 'active' } });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    const region = await prisma.v1Region.create({ data: { code: `roster-sync-region-${suiteId}`, name: '동기화 지역', level: 2 } });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  async function makeUser(): Promise<string> {
    seq += 1;
    const userId = `rs-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id: userId,
        email: `${userId}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0102170${String(seq).padStart(4, '0')}`,
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

  /**
   * 팀 하나(선수 후보 2명, 상대팀은 신청만 확정)와 이미 만들어진 시작 전 대진 하나를 세팅한다 —
   * 정확히 실사용자가 겪은 순서(신청 확정 → 명단 채우기 전에 대진 생성)를 재현한다.
   */
  async function seedFixture() {
    const captainId = await makeUser();
    const team = await prisma.v1Team.create({
      data: { ownerUserId: captainId, sportId, regionId, name: `rs-team-${suiteId}-${seq}` },
    });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: captainId, role: 'owner', status: 'active' } });
    const members = [await makeMember(team.id), await makeMember(team.id)];
    const opponentCaptainId = await makeUser();
    const opponent = await prisma.v1Team.create({
      data: { ownerUserId: opponentCaptainId, sportId, regionId, name: `rs-opp-${suiteId}-${seq}` },
    });

    const tournament = await prisma.v1Tournament.create({
      data: { sportId, title: `동기화 대회 ${suiteId}-${seq}`, status: 'in_progress' },
    });
    // v1_pin_tournament_competition_config 트리거는 확장/수축 마이그레이션 대상이라 이 통합
    // 스펙 환경에서는 자동으로 안 채워진다 — createFixture가 요구하는 pinned config를
    // 프로덕션과 같은 백필 CLI로 직접 채운다([[local-integration-needs-competition-config-backfill]]).
    await runCompetitionConfigContractPhaseBackfill(prisma);

    const [homeRegistration, awayRegistration] = await Promise.all([
      prisma.v1TournamentRegistration.create({
        data: { tournamentId: tournament.id, teamId: team.id, appliedByUserId: captainId, status: 'confirmed' },
      }),
      prisma.v1TournamentRegistration.create({
        data: { tournamentId: tournament.id, teamId: opponent.id, appliedByUserId: opponentCaptainId, status: 'confirmed' },
      }),
    ]);

    const bracket = app.get(TournamentBracketService);
    const admin: V1AuthUser = {
      id: adminUserId,
      email: `${adminUserId}@integration.test`,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    // 실사용자가 겪은 정확한 순서 — 로스터가 아직 비어 있을 때 대진부터 만든다.
    const teamMatch = await bracket.createFixture(admin, tournament.id, {
      round: '1라운드',
      fixtureNumber: 1,
      homeRegistrationId: homeRegistration.id,
      awayRegistrationId: awayRegistration.id,
      venue: '테스트 구장',
    });

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id } });
    const side = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: game.id, teamId: team.id } });
    const opponentSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: game.id, teamId: opponent.id } });
    const captain: V1AuthUser = {
      id: captainId,
      email: `${captainId}@integration.test`,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    return { tournament, team, registration: homeRegistration, members, captain, game, side, opponentSide, teamMatchId: teamMatch.id };
  }

  const latestLineup = (gameId: string, sideId: string) =>
    prisma.v1GameLineup.findFirstOrThrow({ where: { gameId, sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
  const participantsOf = (lineupId: string) =>
    prisma.v1GameParticipant.findMany({ where: { lineupId }, orderBy: { displayNameSnapshot: 'asc' } });
  const sync = (tournamentId: string, teamId: string) =>
    prisma.$transaction((tx) => syncTournamentRosterLineups(tx, { tournamentId, teamId }));

  it('대진 생성 시점에 로스터가 비어 있었어도, 이후 선수를 추가하면 시작 전 경기 참가자가 채워진다', async () => {
    const f = await seedFixture();
    // 대진이 이미 비어 있는 로스터로 만들어졌다는 전제를 실측으로 확인한다.
    expect(await participantsOf((await latestLineup(f.game.id, f.side.id)).id)).toHaveLength(0);

    await app.get(TournamentPlayersService).addPlayer(f.captain, f.tournament.id, f.registration.id, { userId: f.members[0] } as never);

    const latest = await latestLineup(f.game.id, f.side.id);
    expect([latest.revision, latest.state]).toEqual([2, 'DRAFT']);
    const rows = await participantsOf(latest.id);
    expect(rows.map((row) => [row.userId, row.started])).toEqual([[f.members[0], true]]);
    const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({ where: { participantId: rows[0].id } });
    expect(links.map((link) => link.userId)).toEqual([f.members[0]]);
    const events = await prisma.v1ParticipantIdentityLinkEvent.findMany({ where: { participantId: rows[0].id } });
    expect(events.map((event) => [event.action, event.systemActor])).toEqual([['ROSTER_ASSERTED', 'TOURNAMENT_ROSTER_SYNC']]);
    const marker = await prisma.v1OperationAudit.findFirst({
      where: { requestId: `${f.game.id}:${latest.id}`, action: TOURNAMENT_ROSTER_SYNC_ACTION },
    });
    expect(marker).not.toBeNull();
    // 상대 사이드는 건드리지 않는다.
    expect((await latestLineup(f.game.id, f.opponentSide.id)).revision).toBe(1);
  });

  it('명단에서 선수를 빼면 그 선수가 빠진 리비전으로 다시 맞춘다 — 동기화 리비전 위에서도 이어진다', async () => {
    const f = await seedFixture();
    const players = app.get(TournamentPlayersService);
    const first = (await players.addPlayer(f.captain, f.tournament.id, f.registration.id, { userId: f.members[0] } as never)) as { id: string };
    await players.addPlayer(f.captain, f.tournament.id, f.registration.id, { userId: f.members[1] } as never);

    await players.removePlayer(f.captain, f.tournament.id, f.registration.id, first.id);

    const latest = await latestLineup(f.game.id, f.side.id);
    expect(latest.revision).toBe(4);
    expect((await participantsOf(latest.id)).map((row) => row.userId)).toEqual([f.members[1]]);
  });

  it('명단에 등번호를 단 선수가 있으면 새 참가자 행에도 그 번호가 찍힌다', async () => {
    const f = await seedFixture();
    await app.get(TournamentPlayersService).addPlayer(
      f.captain,
      f.tournament.id,
      f.registration.id,
      { userId: f.members[0], jerseyNumber: 7 } as never,
    );

    const rows = await participantsOf((await latestLineup(f.game.id, f.side.id)).id);
    expect(rows.map((row) => row.jerseyNumber)).toEqual([7]);
  });

  it('멤버십은 그대로인데 등번호만 바뀌어도 새 리비전에 그 번호가 찍힌다 — Copilot 지적 회귀 테스트', async () => {
    const f = await seedFixture();
    await app.get(TournamentPlayersService).addPlayer(
      f.captain,
      f.tournament.id,
      f.registration.id,
      { userId: f.members[0], jerseyNumber: 7 } as never,
    );
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(2);

    const player = await prisma.v1TournamentPlayer.findFirstOrThrow({
      where: { registrationId: f.registration.id, userId: f.members[0], removedAt: null },
    });
    await app.get(TournamentPlayersService).updatePlayerJersey(f.captain, f.tournament.id, f.registration.id, player.id, 9);

    const latest = await latestLineup(f.game.id, f.side.id);
    expect(latest.revision).toBe(3);
    expect((await participantsOf(latest.id)).map((row) => row.jerseyNumber)).toEqual([9]);
  });

  it('팀장이 저장한 라인업은 덮지 않는다', async () => {
    const f = await seedFixture();
    const generated = await latestLineup(f.game.id, f.side.id);
    const teamSaved = await prisma.v1GameLineup.create({
      data: { gameId: f.game.id, sideId: f.side.id, revision: 2, supersedesId: generated.id },
    });
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: f.members[0], realName: '명단 선수' } });

    expect(await sync(f.tournament.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).id).toBe(teamSaved.id);
  });

  it('자동 명단(리비전 1)이라도 팀장이 제출했으면 덮지 않는다', async () => {
    const f = await seedFixture();
    const generated = await latestLineup(f.game.id, f.side.id);
    await prisma.v1GameLineup.update({
      where: { id: generated.id },
      data: { state: 'SUBMITTED', submittedAt: new Date(), version: { increment: 1 } },
    });
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: f.members[0], realName: '명단 선수' } });

    expect(await sync(f.tournament.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).id).toBe(generated.id);
  });

  it('시작 시각이 지난 경기는 맞추지 않는다', async () => {
    const f = await seedFixture();
    await prisma.v1TeamMatch.update({ where: { id: f.teamMatchId }, data: { startAt: new Date(Date.now() - 60_000) } });
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: f.members[0], realName: '명단 선수' } });

    expect(await sync(f.tournament.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(1);
  });

  it('명단이 이미 같으면 새 리비전을 만들지 않는다 — 두 번째 호출은 0을 돌려준다', async () => {
    const f = await seedFixture();
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: f.members[0], realName: '명단 선수' } });

    expect(await sync(f.tournament.id, f.team.id)).toBe(1);
    expect(await sync(f.tournament.id, f.team.id)).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(2);
  });

  it('확정된 신청이 없는 팀(신청 취소 등)은 조용히 no-op이다', async () => {
    const f = await seedFixture();
    await prisma.v1TournamentRegistration.update({ where: { id: f.registration.id }, data: { status: 'cancelled' } });

    expect(await sync(f.tournament.id, f.team.id)).toBe(0);
  });

  it('대진 생성 뒤 선수 등록 없이 "명단 잠금"만 눌러도 시작 전 경기 참가자가 되살아난다', async () => {
    const f = await seedFixture();
    // TournamentPlayersService 를 거치지 않고 직접 심는다 — 기존 4개 동기화 호출 지점이
    // 하나도 안 탔다는 걸 보장한다. 그런데도 "명단을 잠그면" 되살아나야 한다는 게 이 테스트의
    // 요지다 — 실사용자 순서(참가 신청 → 명단 잠금 → 대진 생성 → 그 뒤로 손 안 댐)에서는
    // 선수 추가/삭제 이벤트 자체가 다시는 안 일어나므로, 그 4개 지점만으로는 절대 못 미친다.
    await prisma.v1TournamentPlayer.create({
      data: { registrationId: f.registration.id, userId: f.members[0], realName: '명단 선수' },
    });
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(1);

    const admin: V1AuthUser = {
      id: adminUserId,
      email: `${adminUserId}@integration.test`,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    await app.get(AdminRegistrationsService).rosterLock(admin, f.registration.id, {});

    const latest = await latestLineup(f.game.id, f.side.id);
    expect(latest.revision).toBe(2);
    expect((await participantsOf(latest.id)).map((row) => row.userId)).toEqual([f.members[0]]);
    // 상대 사이드는 안 건드린다 — 잠근 건 이쪽 팀 신청 하나뿐이다.
    expect((await latestLineup(f.game.id, f.opponentSide.id)).revision).toBe(1);
  });

  it('리그 전용 함수(syncLeagueRosterLineups)는 이 대회 경기에 손대지 않는다 — leagueId가 null이라 대상이 아니다', async () => {
    const f = await seedFixture();
    const { syncLeagueRosterLineups } = await import('../../src/league-matches/league-roster-sync');
    await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: f.members[0], realName: '명단 선수' } });

    const changed = await prisma.$transaction((tx) => syncLeagueRosterLineups(tx, { leagueId: f.tournament.id, teamId: f.team.id }));

    expect(changed).toBe(0);
    expect((await latestLineup(f.game.id, f.side.id)).revision).toBe(1);
  });
});

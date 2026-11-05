import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentRegistrationsService } from '../../src/tournaments/tournament-registrations.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const u = (name: string) => `next-season-${name}-${suiteId}`;

/**
 * 독립 리그 → 독립 리그 다음 시즌 잇기(2026-11-03 사용자 확정, real DB).
 *
 * 유닛의 fake 로는 증명할 수 없는 것만 본다: `previous_league_id` 유니크 인덱스가 둘째 연결을 막는지,
 * 리그 체계 전환이 그 연결을 실제 행으로 보고 막는지, 재참가 제출·어드민 한 번에 넣기가 지난 시즌 명단을
 * 실제로 옮겨 담는지(멤버십 잠금·다른 팀 중복 판정 포함), 접수 시작 알림이 지난 시즌 팀장에게만 가는지.
 */
describe('독립 리그 다음 시즌 잇기', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let registrations: TournamentRegistrationsService;
  let sportId: string;
  let regionId: string;
  const team: Record<'a' | 'b' | 'c', string> = { a: '', b: '', c: '' };
  let season1: string;
  let season2: string;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const admin = u('admin');
  const owner = { a: u('owner-a'), b: u('owner-b'), c: u('owner-c') };
  const players = { a1: u('p-a1'), a2: u('p-a2'), aLeft: u('p-a-left'), b1: u('p-b1') };

  const createLeague = (body: Record<string, unknown>) =>
    http().post('/api/v1/admin/league-matches').set('x-v1-user-id', admin).send({
      sportId, regionId,
      startsOn: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      endsOn: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      teamIds: [],
      ...body,
    });

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const people = [admin, ...Object.values(owner), ...Object.values(players)];
    for (const id of people) {
      seq += 1;
      await prisma.v1User.create({
        data: {
          id, email: `${id}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed',
          phone: `0103100${String(seq).padStart(4, '0')}`, phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
          profile: { create: { nickname: `선수${seq}`, realName: `선수${seq}`, birthDate: '1995-01-01', gender: 'male' } },
        },
      });
    }
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(people.map((id) => terms.acceptSignupTerms(id, required)));
    await prisma.v1AdminUser.create({ data: { userId: admin, adminRole: 'owner' } });
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `next-season-region-${suiteId}`, name: '테스트 지역', level: 2 } })).id;
    for (const key of ['a', 'b', 'c'] as const) {
      team[key] = (await prisma.v1Team.create({
        data: { ownerUserId: owner[key], sportId, regionId, name: `next-season-${key}-${suiteId}` },
      })).id;
      await prisma.v1TeamMembership.create({ data: { teamId: team[key], userId: owner[key], role: 'owner', status: 'active' } });
    }
    const join = (teamId: string, userId: string, jerseyNumber: number, status: 'active' | 'left' = 'active') =>
      prisma.v1TeamMembership.create({ data: { teamId, userId, role: 'member', status, jerseyNumber } });
    await join(team.a, players.a1, 7);
    await join(team.a, players.a2, 10);
    // 지난 시즌엔 뛰었지만 팀을 떠난 선수 — 다음 시즌 명단으로 옮기지 않는다.
    await join(team.a, players.aLeft, 99, 'left');
    await join(team.b, players.b1, 3);

    season1 = (await createLeague({ title: `1시즌 ${suiteId}`, teamIds: [team.a, team.b, team.c] }).expect(201)).body.data.leagueId;
    // 지난 시즌 명단 — 등번호를 바꿔 둔다(옮길 때 팀 기본 번호가 아니라 지난 시즌 번호를 쓴다).
    const rosterOf = async (teamId: string) =>
      (await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { tournamentId_teamId: { tournamentId: season1, teamId } } })).id;
    const addPlayer = async (registrationId: string, userId: string, jerseyNumber: number) =>
      prisma.v1TournamentPlayer.create({ data: { registrationId, userId, realName: userId, jerseyNumber, eligibilityStatus: 'non_pro' } });
    const rosterA = await rosterOf(team.a);
    await addPlayer(rosterA, players.a1, 17);
    await addPlayer(rosterA, players.a2, 20);
    await addPlayer(rosterA, players.aLeft, 99);
    await addPlayer(await rosterOf(team.b), players.b1, 13);
    await prisma.v1Tournament.update({ where: { id: season1 }, data: { status: 'in_progress' } });

    registrations = new TournamentRegistrationsService(
      prisma,
      { emitNotification: jest.fn() } as never,
      {
        assertTournamentAcceptances: jest.fn().mockResolvedValue({ acceptedCodes: new Set(['tournament_rules', 'tournament_privacy', 'tournament_refund']) }),
        recordTournamentDecisions: jest.fn(),
        resolveDecisions: jest.fn().mockResolvedValue({ acceptedCodes: new Set() }),
      } as never,
    );
  });
  afterAll(async () => cleanup?.());

  const adminDetail = async (id: string) =>
    (await http().get(`/api/v1/admin/league-matches/${id}`).set('x-v1-user-id', admin).expect(200)).body.data;
  const playersOf = (leagueId: string, teamId: string) =>
    prisma.v1TournamentPlayer.findMany({
      where: { registration: { tournamentId: leagueId, teamId }, removedAt: null },
      select: { userId: true, jerseyNumber: true, eligibilityStatus: true },
      orderBy: { jerseyNumber: 'asc' },
    });

  it('시작 전 리그로는 다음 시즌을 만들 수 없다', async () => {
    const draft = (await createLeague({ title: `초안 ${suiteId}` }).expect(201)).body.data.leagueId;
    const res = await createLeague({ title: `초안의 다음 ${suiteId}`, previousLeagueId: draft }).expect(422);
    expect(res.body.code).toBe('LEAGUE_PREVIOUS_SEASON_INVALID');
  });

  it('진행 중인 독립 리그에서 다음 시즌을 만들면 두 리그가 서로를 가리킨다', async () => {
    season2 = (await createLeague({ title: `2시즌 ${suiteId}`, previousLeagueId: season1 }).expect(201)).body.data.leagueId;

    expect((await adminDetail(season1)).nextSeason).toEqual({ leagueId: season2, title: `2시즌 ${suiteId}` });
    expect(await adminDetail(season2)).toMatchObject({ previousSeason: { leagueId: season1, title: `1시즌 ${suiteId}` }, nextSeason: null });
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: season2, action: 'league_match.create' } });
    expect(audit.afterJson).toMatchObject({ previousLeagueId: season1 });
  });

  it('한 리그에는 다음 시즌을 하나만 잇는다', async () => {
    const res = await createLeague({ title: `또 다른 2시즌 ${suiteId}`, previousLeagueId: season1 }).expect(409);
    expect(res.body.code).toBe('LEAGUE_NEXT_SEASON_EXISTS');
  });

  it('다음 시즌을 이은 리그는 리그 체계로 전환할 수 없다', async () => {
    await prisma.v1Tournament.update({ where: { id: season1 }, data: { status: 'completed' } });
    const res = await http().post(`/api/v1/admin/league-matches/${season1}/series-conversion/preview`)
      .set('x-v1-user-id', admin).send({ tierSizes: [3] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEAGUE_NEXT_SEASON_EXISTS');
  });

  it('접수를 열면 지난 시즌 팀장에게 한 번만 알리고, 공개 화면이 다음 시즌 신청으로 잇는다', async () => {
    const open = () => http().post(`/api/v1/admin/league-matches/${season2}/open-registration`).set('x-v1-user-id', admin)
      .send({ registrationDeadlineAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    await open().expect(200);
    const notified = () => prisma.v1Notification.findMany({
      where: { targetId: season2, businessKey: { startsWith: `league-next-season-open:${season2}` } },
      select: { recipientUserId: true, deepLink: true },
    });
    for (let attempt = 0; attempt < 50 && (await notified()).length < 3; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
    const rows = await notified();
    expect(rows.map((row) => row.recipientUserId).sort()).toEqual([owner.a, owner.b, owner.c].sort());
    expect(rows[0].deepLink).toBe(`/tournaments/${season2}/apply`);

    // 닫았다 다시 열어도 같은 사람에게 또 보내지 않는다.
    await http().post(`/api/v1/admin/league-matches/${season2}/close-registration`).set('x-v1-user-id', admin).send({}).expect(200);
    await open().expect(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await notified()).toHaveLength(3);

    const previousPublic = (await http().get(`/api/v1/league-matches/${season1}`).expect(200)).body.data;
    expect(previousPublic.nextRound).toMatchObject({ leagueId: season2, registrationOpen: true, seasonNo: null });
    const nextPublic = (await http().get(`/api/v1/league-matches/${season2}`).expect(200)).body.data;
    expect(nextPublic.previousRound).toEqual({ leagueId: season1, title: `1시즌 ${suiteId}` });
    const detail = (await http().get(`/api/v1/tournaments/${season2}`).expect(200)).body.data;
    expect(detail.previousSeason).toEqual({ leagueId: season1, title: `1시즌 ${suiteId}` });
  });

  it('지난 시즌 팀이 재참가 신청을 내면 지난 명단 중 아직 팀에 있는 선수를 지난 번호로 옮겨 담는다', async () => {
    const actor = { id: owner.a } as never;
    const draft = (await registrations.create(actor, season2, { teamId: team.a } as never)) as { id: string };
    await registrations.submit(actor, season2, draft.id, { termsDocumentIds: [], paymentMethod: 'bank_transfer', depositorName: '입금자' } as never);

    expect(await playersOf(season2, team.a)).toEqual([
      { userId: players.a1, jerseyNumber: 17, eligibilityStatus: 'needs_review' },
      { userId: players.a2, jerseyNumber: 20, eligibilityStatus: 'needs_review' },
    ]);
  });

  it('어드민이 지난 시즌 팀을 한 번에 넣으면 참가 확정되고 명단을 이어받는다 — 지난 시즌에 없던 팀은 거절한다', async () => {
    const stranger = (await prisma.v1Team.create({
      data: { ownerUserId: owner.c, sportId, regionId, name: `next-season-stranger-${suiteId}` },
    })).id;
    const rejected = await http().post(`/api/v1/admin/league-matches/${season2}/previous-season-teams`)
      .set('x-v1-user-id', admin).send({ teamIds: [team.b, stranger] }).expect(422);
    expect(rejected.body.code).toBe('LEAGUE_TEAM_INVALID');
    expect(await prisma.v1TournamentRegistration.count({ where: { tournamentId: season2, teamId: team.b } })).toBe(0);

    const res = await http().post(`/api/v1/admin/league-matches/${season2}/previous-season-teams`)
      .set('x-v1-user-id', admin).send({ teamIds: [team.b] }).expect(201);
    expect(res.body.data).toMatchObject({ leagueId: season2, teamIds: [team.b], carriedPlayerCount: 1, hasExistingFixtures: false });
    expect(await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: season2, teamId: team.b } },
      select: { status: true, entrySource: true },
    })).toEqual({ status: 'confirmed', entrySource: 'seeded' });
    expect(await playersOf(season2, team.b)).toEqual([{ userId: players.b1, jerseyNumber: 13, eligibilityStatus: 'needs_review' }]);
    // MD-QA #208: 지난 시즌 화면이 이 팀에게 재참가 신청을 다시 걸지 않도록 확정 팀을 알려 준다.
    const previousPublic = (await http().get(`/api/v1/league-matches/${season1}`).expect(200)).body.data;
    expect(previousPublic.nextRound.teamIds).toContain(team.b);
  });

  // 2026-11-04 알파 QA: 입금 대기 팀을 넣으면 결제가 '대기'인 채 참가 확정이 됐다.
  it('이미 신청이 진행 중인 팀(입금 확인 중)은 한 번에 넣기로 넣지 않는다', async () => {
    const res = await http().post(`/api/v1/admin/league-matches/${season2}/previous-season-teams`)
      .set('x-v1-user-id', admin).send({ teamIds: [team.a] }).expect(422);
    expect(res.body.code).toBe('LEAGUE_TEAM_ALREADY_APPLIED');
    expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: season2, teamId: team.a } },
      select: { status: true },
    })).status).not.toBe('confirmed');
  });

  // 2026-11-04 사용자 확정: 리그 체계 전환도 다음 시즌 잇기처럼 지난 명단을 옮긴다. 전환한 리그의 공개 화면은
  // 첫 시즌 티어와 편성 팀을 준다(전엔 다음 시즌 링크가 비어 리그 목록으로만 갔다).
  it('리그 체계로 전환하면 첫 시즌 티어에 원본 리그 명단을 옮기고, 원본 공개 화면이 티어를 잇는다', async () => {
    const source = (await createLeague({ title: `전환 원본 ${suiteId}`, teamIds: [team.a, team.b, team.c] }).expect(201)).body.data.leagueId;
    const rosterOf = async (teamId: string) =>
      (await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { tournamentId_teamId: { tournamentId: source, teamId } } })).id;
    await prisma.v1TournamentPlayer.create({ data: { registrationId: await rosterOf(team.a), userId: players.a1, realName: players.a1, jerseyNumber: 8, eligibilityStatus: 'non_pro' } });
    await prisma.v1TournamentPlayer.create({ data: { registrationId: await rosterOf(team.b), userId: players.b1, realName: players.b1, jerseyNumber: 4, eligibilityStatus: 'non_pro' } });
    await http().post(`/api/v1/admin/league-matches/${source}/state`).set('x-v1-user-id', admin).send({ state: 'active' }).expect(200);
    const fixtures = await http().post(`/api/v1/admin/league-matches/${source}/fixtures`).set('x-v1-user-id', admin).send({ weeksCount: 1 }).expect(201);
    const projection = new GameResultOfficialProjectionService();
    for (const [index, teamMatchId] of (fixtures.body.data.teamMatchIds as string[]).entries()) {
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
      const revision = await prisma.v1GameResultRevision.create({
        data: {
          gameId: game.id, revision: 1, state: 'OFFICIAL', score: { home: index + 1, away: 0 }, eventsHash: `conv-${randomUUID()}`,
          createdByActorType: 'SYSTEM', createdBySystemActor: 'NEXT_SEASON_TEST', submittedAt: new Date(), officialAt: new Date(),
        },
      });
      await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
      await prisma.$transaction((tx) => projection.handler({ payload: { revisionId: revision.id } } as never, tx));
    }
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: source } })).status).toBe('completed');

    const path = `/api/v1/admin/league-matches/${source}/series-conversion`;
    const preview = (await http().post(`${path}/preview`).set('x-v1-user-id', admin).send({ tierSizes: [3] }).expect(201)).body.data;
    const committed = (await http().post(`${path}/commit`).set('x-v1-user-id', admin).send({
      title: `전환 체계 ${suiteId}`, tierSizes: [3], fingerprint: preview.fingerprint,
      startsOn: new Date(Date.now() + 70 * 86_400_000).toISOString(), endsOn: new Date(Date.now() + 120 * 86_400_000).toISOString(),
      entries: (preview.entries as Array<{ teamId: string; suggestedTier: number }>).map((e) => ({ teamId: e.teamId, tier: e.suggestedTier })),
    }).expect(201)).body.data;
    const tier1 = committed.leagues[0].id as string;

    expect(await playersOf(tier1, team.a)).toEqual([{ userId: players.a1, jerseyNumber: 8, eligibilityStatus: 'needs_review' }]);
    expect(await playersOf(tier1, team.b)).toEqual([{ userId: players.b1, jerseyNumber: 4, eligibilityStatus: 'needs_review' }]);

    const publicSource = (await http().get(`/api/v1/league-matches/${source}`).expect(200)).body.data;
    expect(publicSource.nextRound).toBeNull();
    expect(publicSource.nextSeasonTiers).toEqual([
      { leagueId: tier1, title: `전환 체계 ${suiteId} 1시즌 1부`, tier: 1, teamIds: expect.arrayContaining([team.a, team.b, team.c]) },
    ]);
  });
});

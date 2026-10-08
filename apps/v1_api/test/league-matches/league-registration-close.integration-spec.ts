import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentRegistrationsService } from '../../src/tournaments/tournament-registrations.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const adminUserId = `close-admin-${suiteId}`;
const supportUserId = `close-support-${suiteId}`;
const ownerAId = `close-owner-a-${suiteId}`;
const ownerBId = `close-owner-b-${suiteId}`;

/**
 * 리그 신청 즉시 마감(MD-QA #35) — 마감하면 그 리그만 신청이 막히고, 낸 신청은 남고, open-registration 으로 다시 열린다.
 */
describe('리그 신청 즉시 마감 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let registrations: TournamentRegistrationsService;
  let leagueA: string;
  let leagueB: string;
  let tournamentId: string;
  let teamA: string;

  const http = () => request(app.getHttpServer());
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const ids = [adminUserId, supportUserId, ownerAId, ownerBId];
    await prisma.v1User.createMany({
      data: ids.map((id) => ({
        id, email: `${id}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date(), accountStatus: 'active',
      })),
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const required = (await terms.currentSignupTerms()).items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
    await Promise.all(ids.map((id) => terms.acceptSignupTerms(id, required)));
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
    await prisma.v1AdminUser.create({ data: { userId: supportUserId, adminRole: 'support' } });
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    const region = await prisma.v1Region.create({ data: { code: `%(p)s-region-${suiteId}`, name: '테스트 지역', level: 2 } });
    const makeTeam = async (suffix: string, ownerUserId: string) => {
      const team = await prisma.v1Team.create({ data: { ownerUserId, sportId: sport.id, regionId: region.id, name: `%(p)s-${suffix}-${suiteId}` } });
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerUserId, role: 'owner', status: 'active' } });
      return team.id;
    };
    teamA = await makeTeam('a', ownerAId);
    const seedTeams = [await makeTeam('s1', adminUserId), await makeTeam('s2', supportUserId)];
    const createLeague = async (title: string, open: boolean) => {
      const created = await http().post('/api/v1/admin/league-matches').set('x-v1-user-id', adminUserId).send({
        title: `${title} ${suiteId}`, sportId: sport.id, regionId: region.id,
        startsOn: new Date(Date.now() + 5 * 86_400_000).toISOString(), endsOn: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        teamIds: seedTeams,
      }).expect(201);
      const id = created.body.data.leagueId as string;
      if (open) {
        await http().post(`/api/v1/admin/league-matches/${id}/open-registration`).set('x-v1-user-id', adminUserId)
          .send({ registrationDeadlineAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }).expect(200);
      }
      return id;
    };
    leagueA = await createLeague('대상 리그', true);
    leagueB = await createLeague('대조 리그', true);
    tournamentId = (await prisma.v1Tournament.create({
      data: { title: `대회 ${suiteId}`, sportId: sport.id, regionId: region.id, kind: 'regular_tournament', status: 'open', scheduledAt: new Date(Date.now() + 30 * 86_400_000) },
    })).id;
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

  const closeUrl = (id: string) => `/api/v1/admin/league-matches/${id}/close-registration`;
  const postClose = (id: string, body: object = {}, user = adminUserId) =>
    http().post(closeUrl(id)).set('x-v1-user-id', user).send(body);
  const submitTeamA = async () => {
    const owner = { id: ownerAId } as never;
    const draft = (await registrations.create(owner, leagueA, { teamId: teamA } as never)) as { id: string };
    return registrations.submit(owner, leagueA, draft.id, {
      termsDocumentIds: [], paymentMethod: 'bank_transfer', depositorName: '입금자',
    } as never);
  };
  const publicDetail = async (id: string) => (await http().get(`/api/v1/league-matches/${id}`).expect(200)).body.data;

  it('권한: support 는 403, 대회 id 는 404, 잘못된 id 는 400', async () => {
    await postClose(leagueA, {}, supportUserId).expect(403);
    expect((await postClose(tournamentId).expect(404)).body.code).toBe('LEAGUE_NOT_FOUND');
    await postClose('not-a-uuid').expect(400);
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueA } })).registrationDeadlineAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('검증: 사유 201자는 400, 모르는 필드도 400', async () => {
    await postClose(leagueA, { reason: 'a'.repeat(201) }).expect(400);
    await postClose(leagueA, { registrationDeadlineAt: '2030-01-01T00:00:00Z' }).expect(400);
  });

  it('A 를 마감하면 A 의 신청 제출은 409 이고 B 는 여전히 신청할 수 있다 — 감사 before·after 가 남는다', async () => {
    const before = (await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueA } })).registrationDeadlineAt!;
    const res = await postClose(leagueA, { reason: '정원 마감' }).expect(200);
    expect(res.body.data).toMatchObject({ leagueId: leagueA, registrationOpen: false, alreadyProcessed: false });
    await sleep(20);

    await expect(submitTeamA()).rejects.toMatchObject({ response: { code: 'REGISTRATION_DEADLINE_PASSED' } });
    expect((await publicDetail(leagueA)).registrationOpen).toBe(false);
    // 대조군: 같은 시각에 B 는 열려 있다(마감이 전체로 번지지 않았다).
    expect((await publicDetail(leagueB)).registrationOpen).toBe(true);
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueB } })).registrationDeadlineAt!.getTime()).toBeGreaterThan(Date.now());

    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: leagueA, action: 'league_match.close_registration' } });
    expect(audit.reason).toBe('정원 마감');
    expect(audit.beforeJson).toEqual({ registrationDeadlineAt: before.toISOString() });
    expect(new Date((audit.afterJson as { registrationDeadlineAt: string }).registrationDeadlineAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('두 번째 마감은 alreadyProcessed 이고 감사 행은 1건으로 남는다', async () => {
    const res = await postClose(leagueA).expect(200);
    expect(res.body.data).toMatchObject({ registrationOpen: false, alreadyProcessed: true });
    expect(await prisma.v1AdminActionLog.count({ where: { targetId: leagueA, action: 'league_match.close_registration' } })).toBe(1);
  });

  it('open-registration 으로 다시 열면 신청이 가능하고, 낸 신청은 마감해도 그대로다', async () => {
    await http().post(`/api/v1/admin/league-matches/${leagueA}/open-registration`).set('x-v1-user-id', adminUserId)
      .send({ registrationDeadlineAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }).expect(200);
    expect((await publicDetail(leagueA)).registrationOpen).toBe(true);
    const submitted = (await submitTeamA()) as { id: string };

    await postClose(leagueA).expect(200);
    const kept = await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: submitted.id } });
    expect(kept.status).not.toBe('cancelled');
  });

  it('끝난 리그는 409 LEAGUE_REGISTRATION_NOT_ALLOWED 이고 마감은 바뀌지 않는다', async () => {
    const before = (await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueB } })).registrationDeadlineAt;
    await prisma.v1Tournament.update({ where: { id: leagueB }, data: { status: 'completed' } });
    expect((await postClose(leagueB).expect(409)).body.code).toBe('LEAGUE_REGISTRATION_NOT_ALLOWED');
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueB } })).registrationDeadlineAt).toEqual(before);
  });
});

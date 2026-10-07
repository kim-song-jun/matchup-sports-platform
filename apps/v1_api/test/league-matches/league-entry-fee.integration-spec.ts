import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentRegistrationsService } from '../../src/tournaments/tournament-registrations.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const adminUserId = `fee-admin-${suiteId}`;
const supportUserId = `fee-support-${suiteId}`;
const ownerAId = `fee-owner-a-${suiteId}`;
const ownerBId = `fee-owner-b-${suiteId}`;
const strangerId = `fee-stranger-${suiteId}`;

// 은행명·계좌번호·예금주마다 서로 다른 고유 문자열 — 한 곳만 검사하면 다른 필드 누출을 놓친다.
const BANK = { bankName: `SENTINEL-BANK-${suiteId}`, bankAccount: `SENTINEL-ACCT-${suiteId}`, bankHolder: `SENTINEL-HOLDER-${suiteId}` };

/**
 * 리그 참가비·입금 계좌(MD-QA #36) — 설정·사유 규칙, 기존 신청 금액 스냅샷 유지, 공개 응답 계좌 비노출,
 * 입금 안내(payment.amount 기준).
 */
describe('리그 참가비 설정 HTTP/DB 계약', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let registrations: TournamentRegistrationsService;
  let leagueId: string;
  let otherLeagueId: string;
  let tournamentId: string;
  const teamIds: Record<'a' | 'b', string> = { a: '', b: '' };

  const http = () => request(app.getHttpServer());
  const feeUrl = (id = leagueId) => `/api/v1/admin/league-matches/${id}/entry-fee`;
  const patchFee = (body: object, user = adminUserId, id = leagueId) =>
    http().patch(feeUrl(id)).set('x-v1-user-id', user).send(body);
  const adminDetail = (id = leagueId) =>
    http().get(`/api/v1/admin/league-matches/${id}`).set('x-v1-user-id', adminUserId).expect(200);

  const submitTeam = async (team: 'a' | 'b', targetLeagueId = leagueId) => {
    const owner = { id: team === 'a' ? ownerAId : ownerBId } as never;
    const draft = (await registrations.create(owner, targetLeagueId, { teamId: teamIds[team] } as never)) as { id: string };
    const submitted = await registrations.submit(owner, targetLeagueId, draft.id, {
      termsDocumentIds: [], paymentMethod: 'bank_transfer', depositorName: '입금자',
    } as never);
    return { id: draft.id, submitted };
  };

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const ids = [adminUserId, supportUserId, ownerAId, ownerBId, strangerId];
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
    const region = await prisma.v1Region.create({ data: { code: `fee-region-${suiteId}`, name: '참가비 테스트 지역', level: 2 } });
    const makeTeam = async (suffix: string, ownerUserId: string) => {
      const team = await prisma.v1Team.create({ data: { ownerUserId, sportId: sport.id, regionId: region.id, name: `fee-${suffix}-${suiteId}` } });
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerUserId, role: 'owner', status: 'active' } });
      return team.id;
    };
    teamIds.a = await makeTeam('a', ownerAId);
    teamIds.b = await makeTeam('b', ownerBId);
    const seedTeams = [await makeTeam('s1', adminUserId), await makeTeam('s2', supportUserId)];
    const createLeague = async (title: string) => {
      const created = await http().post('/api/v1/admin/league-matches').set('x-v1-user-id', adminUserId).send({
        title: `${title} ${suiteId}`, sportId: sport.id, regionId: region.id,
        startsOn: new Date(Date.now() + 5 * 86_400_000).toISOString(), endsOn: new Date(Date.now() + 60 * 86_400_000).toISOString(),
        teamIds: seedTeams,
      }).expect(201);
      const id = created.body.data.leagueId as string;
      await http().post(`/api/v1/admin/league-matches/${id}/open-registration`).set('x-v1-user-id', adminUserId)
        .send({ registrationDeadlineAt: new Date(Date.now() + 3 * 86_400_000).toISOString() }).expect(200);
      return id;
    };
    leagueId = await createLeague('참가비 리그');
    otherLeagueId = await createLeague('대조 리그');
    tournamentId = (await prisma.v1Tournament.create({
      data: { title: `참가비 대회 ${suiteId}`, sportId: sport.id, regionId: region.id, kind: 'regular_tournament', status: 'open', scheduledAt: new Date(Date.now() + 30 * 86_400_000) },
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

  it('권한: support·비어드민은 403, 대회 id 는 404, 잘못된 id 는 400', async () => {
    await patchFee({ entryFee: 0 }, supportUserId).expect(403);
    await patchFee({ entryFee: 0 }, strangerId).expect(403);
    expect((await patchFee({ entryFee: 0 }, adminUserId, tournamentId).expect(404)).body.code).toBe('LEAGUE_NOT_FOUND');
    await patchFee({ entryFee: 0 }, adminUserId, 'not-a-uuid').expect(400);
  });

  it('검증: 유료인데 계좌가 비면 422, 빈 문자열 금액은 400(무료 확정으로 저장되지 않는다)', async () => {
    expect((await patchFee({ entryFee: 70000, bankName: BANK.bankName }).expect(422)).body.code).toBe('LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED');
    await patchFee({ entryFee: '' }).expect(400);
    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } });
    expect(row).toMatchObject({ entryFee: 0, entryFeeConfiguredAt: null });
  });

  it('미설정 리그의 0원은 무료 확정으로 기록되고, 대조 리그는 그대로 미설정이다', async () => {
    const before = (await adminDetail()).body.data;
    expect(before).toMatchObject({ entryFee: 0, entryFeeConfiguredAt: null, activeRegistrationCount: 0 });
    const res = await patchFee({ entryFee: 0 }).expect(200);
    expect(res.body.data).toMatchObject({ entryFee: 0, alreadyProcessed: false });
    expect((await adminDetail()).body.data.entryFeeConfiguredAt).not.toBeNull();
    expect((await adminDetail(otherLeagueId)).body.data.entryFeeConfiguredAt).toBeNull();
    expect((await patchFee({ entryFee: 0 }).expect(200)).body.data.alreadyProcessed).toBe(true);
  });

  it('유료 설정 후 신청 팀 A 는 70,000, 금액을 80,000 으로 바꾼 뒤 신청한 팀 B 는 80,000 이고 A 는 그대로다', async () => {
    await patchFee({ entryFee: 70000, ...BANK }).expect(200);
    const a = await submitTeam('a');
    expect(a.submitted).toMatchObject({ payment: { amount: 70000 }, paymentInstructions: expect.objectContaining({ bankAccount: BANK.bankAccount }) });
    expect((await adminDetail()).body.data).toMatchObject({ activeRegistrationCount: 1, confirmedRegistrationCount: 0 });

    // 신청이 있으니 사유가 필요하다 — 없으면 422 이고 DB 값은 그대로.
    expect((await patchFee({ entryFee: 80000 }).expect(422)).body.code).toBe('LEAGUE_ENTRY_FEE_REASON_REQUIRED');
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).entryFee).toBe(70000);
    await patchFee({ entryFee: 80000, reason: '물가 인상' }).expect(200);

    const b = await submitTeam('b');
    expect(b.submitted).toMatchObject({ payment: { amount: 80000 } });
    const aPayment = await prisma.v1TournamentPayment.findUniqueOrThrow({ where: { registrationId: a.id } });
    expect(aPayment.amount).toBe(70000);
    const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: leagueId, action: 'league_match.entry_fee_updated', reason: '물가 인상' } });
    expect(JSON.stringify([audit.beforeJson, audit.afterJson])).not.toContain(BANK.bankAccount);
  });

  it('참가비를 0 으로 내려도 70,000 으로 신청한 팀 A 의 입금 안내는 유지되고, 유료 리그 입금 확인 흐름이 이어진다', async () => {
    await patchFee({ entryFee: 0, reason: '무료 전환' }).expect(200);
    const mine = await http().get(`/api/v1/tournaments/${leagueId}/registrations/my-registration`).set('x-v1-user-id', ownerAId).expect(200);
    expect(mine.body.data).toMatchObject({ payment: { amount: 70000 }, paymentInstructions: { bankAccount: BANK.bankAccount } });
    await patchFee({ entryFee: 80000, reason: '원복' }).expect(200);
    await http().patch(`/api/v1/admin/registrations/${mine.body.data.id}/confirm-payment`).set('x-v1-user-id', adminUserId).send({}).expect(200);
    expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: mine.body.data.id } })).status).toBe('payment_checking');
    await http().patch(`/api/v1/admin/registrations/${mine.body.data.id}/confirm`).set('x-v1-user-id', adminUserId).send({ decision: 'confirm' }).expect(200);
    expect((await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: mine.body.data.id } })).status).toBe('confirmed');
  });

  it('회귀(Task 164 BE-4a): 미설정(0원) 리그의 신청은 입금 대기 없이 바로 통과 상태로 들어간다 — 유료 리그의 입금 확인 흐름은 위 케이스가 awaiting_payment 에서 시작해 증명한다', async () => {
    const free = await submitTeam('b', otherLeagueId);
    const row = await prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: free.id } });
    expect(row.status).toBe('payment_checking');
    expect((await prisma.v1TournamentPayment.findUniqueOrThrow({ where: { registrationId: free.id } })).amount).toBe(0);
    expect((await adminDetail(otherLeagueId)).body.data).toMatchObject({ entryFee: 0, entryFeeConfiguredAt: null, activeRegistrationCount: 1 });
  });

  it('공개 응답 어디에도 계좌가 없다 — 비로그인·무관한 사용자·다른 팀 팀장 모두(어드민 상세에는 있다)', async () => {
    const admin = JSON.stringify((await adminDetail()).body);
    for (const value of Object.values(BANK)) expect(admin).toContain(value);

    const paths = [
      `/api/v1/league-matches/${leagueId}`,
      `/api/v1/league-matches/${leagueId}/standings`,
      `/api/v1/league-matches/${leagueId}/player-records`,
      '/api/v1/tournaments?kind=league',
      `/api/v1/tournaments/${leagueId}`,
    ];
    for (const viewer of [null, strangerId, ownerBId]) {
      for (const path of paths) {
        const req = http().get(path);
        const res = await (viewer === null ? req : req.set('x-v1-user-id', viewer)).expect(200);
        const text = JSON.stringify(res.body);
        for (const value of Object.values(BANK)) expect(text).not.toContain(value);
        expect(text).not.toContain('entryFeeConfiguredAt');
      }
    }
    // 일정과 무관 사용자의 내 신청 응답에도 계좌가 새지 않는다(상태 코드는 계약 밖 — 본문만 본다).
    for (const path of [`/api/v1/tournaments/${leagueId}/schedule`, `/api/v1/tournaments/${leagueId}/registrations/my-registration`]) {
      for (const viewer of [null, strangerId]) {
        const req = http().get(path);
        const res = await (viewer === null ? req : req.set('x-v1-user-id', viewer));
        expect(res.status).toBeLessThan(500);
        const text = JSON.stringify(res.body);
        for (const value of Object.values(BANK)) expect(text).not.toContain(value);
      }
    }
    const publicDetail = (await http().get(`/api/v1/league-matches/${leagueId}`).expect(200)).body.data;
    expect(publicDetail).toMatchObject({ entryFee: 80000, entryFeeConfigured: true });
    expect((await http().get(`/api/v1/league-matches/${otherLeagueId}`).expect(200)).body.data).toMatchObject({ entryFee: 0, entryFeeConfigured: false });
  });

  it('presenter: 리그(미설정)=false · 리그(설정)=true · 대회=true', async () => {
    const detail = async (id: string) => (await http().get(`/api/v1/tournaments/${id}`).expect(200)).body.data;
    expect((await detail(otherLeagueId)).entryFeeConfigured).toBe(false);
    expect((await detail(leagueId)).entryFeeConfigured).toBe(true);
    expect((await detail(tournamentId)).entryFeeConfigured).toBe(true);
  });

  it('끝난 리그는 409 LEAGUE_ENTRY_FEE_NOT_ALLOWED', async () => {
    await prisma.v1Tournament.update({ where: { id: otherLeagueId }, data: { status: 'completed' } });
    expect((await patchFee({ entryFee: 0 }, adminUserId, otherLeagueId).expect(409)).body.code).toBe('LEAGUE_ENTRY_FEE_NOT_ALLOWED');
  });
});

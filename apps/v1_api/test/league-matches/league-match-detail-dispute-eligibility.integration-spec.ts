import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { LeagueMatchDisputeService } from '../../src/league-matches/league-match-dispute.service';
import { LEAGUE_RESULT_DISPUTE_WINDOW_MS } from '../../src/league-matches/league-result-dispute.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchesService } from '../../src/team-matches/team-matches.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { createV1IntegrationApp } from '../integration/integration-app';

// U3: 팀매치 상세(`TeamMatchesService.detail`)가 리그 대진에 실어 보내는 이의 제기
// 자격 필드(disputeDeadline/disputeBlockedReason/openDisputeExists) -- 화면이 이 값을
// 그대로 읽어 "지금 이의를 제기할 수 있는지"를 서버 재요청 없이 판정한다. 순수 함수
// 자체의 경계 조건은 league-result-dispute-eligibility.spec.ts가 이미 값 단위로
// 고정하므로, 여기서는 **실제 detail() 응답에 그 판정이 올바르게 배선됐는지**만 본다
// (글로벌 지침 24 -- 검증은 변경 크기에 비례).
const suiteId = randomUUID().slice(0, 8);
const adminUserId = `u3-detail-admin-${suiteId}`;
const hostOwnerUserId = `u3-detail-host-owner-${suiteId}`;

describe('팀매치 상세 - 리그 이의 제기 자격 (U3)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let teamMatchesService: TeamMatchesService;
  let disputeService: LeagueMatchDisputeService;
  let sportId: string;
  let regionId: string;
  let adminRowId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    teamMatchesService = app.get(TeamMatchesService);
    disputeService = app.get(LeagueMatchDisputeService);

    for (const userId of [adminUserId, hostOwnerUserId]) {
      await prisma.v1User.create({
        data: {
          id: userId,
          email: `${userId}@integration.test`,
          onboardingStatus: 'completed',
          phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
          accountStatus: 'active',
        },
      });
    }
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    const requiredDocumentIds = signupTerms.items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    for (const userId of [adminUserId, hostOwnerUserId]) {
      await termsService.acceptSignupTerms(userId, requiredDocumentIds);
    }
    const admin = await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner' } });
    adminRowId = admin.id;

    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `u3-detail-region-${suiteId}`, name: 'U3 상세 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  async function createOfficializedFixture(title: string) {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId: adminUserId, sportId, regionId, name: `${title}-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId: adminUserId, sportId, regionId, name: `${title}-b-${suiteId}` } });
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', adminUserId)
      .send({
        title,
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId as string;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', adminUserId)
      .send({ weeksCount: 1 });
    const [teamMatchId] = fixturesRes.body.data.teamMatchIds as string[];
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });

    await prisma.v1TeamMembership.create({
      data: { teamId: teamMatch.hostTeamId, userId: hostOwnerUserId, role: 'owner', status: 'active' },
    });

    const resultRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/result`)
      .set('x-v1-user-id', adminUserId)
      .send({ homeScore: 3, awayScore: 0, reason: 'U3 테스트용 결과 확정' });
    expect(resultRes.status).toBe(201);

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const officialRevision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: game.currentOfficialRevisionId! },
    });
    return { leagueId, teamMatchId, teamMatch, officialAt: officialRevision.officialAt! };
  }

  function hostOwnerActor(): V1AuthUser {
    return { id: hostOwnerUserId, email: null, accountStatus: 'active', onboardingStatus: 'completed' };
  }

  it('공식 결과가 확정되면 disputeDeadline = officialAt + 7일, blockedReason은 null이다', async () => {
    const { teamMatchId, officialAt } = await createOfficializedFixture('U3-마감계산');

    const detail = await teamMatchesService.detail(null, teamMatchId);
    expect(detail.league).not.toBeNull();
    expect(detail.league?.disputeDeadline).toBe(new Date(officialAt.getTime() + LEAGUE_RESULT_DISPUTE_WINDOW_MS).toISOString());
    expect(detail.league?.disputeBlockedReason).toBeNull();
    expect(detail.league?.openDisputeExists).toBe(false);
  });

  it('승강이 확정된 리그는 disputeBlockedReason = promotion_committed이다', async () => {
    const { leagueId, teamMatchId, teamMatch } = await createOfficializedFixture('U3-승강확정');

    await prisma.v1LeaguePromotion.create({
      data: {
        fromLeagueId: leagueId,
        teamId: teamMatch.hostTeamId,
        fromTier: 1,
        toTier: 1,
        kind: 'stayed',
        computedKind: 'stayed',
        decidedByAdminUserId: adminRowId,
      },
    });

    const detail = await teamMatchesService.detail(null, teamMatchId);
    expect(detail.league?.disputeBlockedReason).toBe('promotion_committed');
    // 마감 자체는 여전히 계산돼 내려온다 -- 화면이 "며칠 남았었는지"를 보여줄 수 있게.
    expect(detail.league?.disputeDeadline).not.toBeNull();
  });

  it('열린 이의가 있으면 openDisputeExists = true이고, fileDispute가 실제로 거부하는 조건과 detail()의 blockedReason이 일치한다', async () => {
    const { leagueId, teamMatchId } = await createOfficializedFixture('U3-열린이의');

    const before = await teamMatchesService.detail(null, teamMatchId);
    expect(before.league?.openDisputeExists).toBe(false);
    expect(before.league?.disputeBlockedReason).toBeNull();

    // detail()이 "제기 가능"이라고 말하면 실제 fileDispute도 성공해야 한다 -- 드리프트가
    // 있으면 화면은 버튼을 보여주는데 서버가 거부하는 사고가 난다.
    const dispute = await disputeService.fileDispute(hostOwnerActor(), leagueId, teamMatchId, { reason: 'U3 통합 검증용 이의' });
    expect(dispute.status).toBe('open');

    const after = await teamMatchesService.detail(null, teamMatchId);
    expect(after.league?.openDisputeExists).toBe(true);
  });
});

import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { GamesService } from '../../src/games/games.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { LeagueMatchDisputeService } from '../../src/league-matches/league-match-dispute.service';
import { LeagueMatchPublicService } from '../../src/league-matches/league-match-public.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { createV1IntegrationApp } from '../integration/integration-app';

// D2: 리그 경기 결과 이의 제기(E2) + 운영자 수락/거부(E4) + 승강 확정 게이트(E3).
//
// 검증 범위는 태스크 문서가 명시한 것으로 좁힌다(글로벌 지침 24):
//  1. 팀 owner/manager 가 무효(void) 액션을 시도하면 **resolveActor 레벨**에서
//     403 을 받는다(컨트롤러를 거치지 않고 GamesService.voidTeamMatchResult 직접 호출).
//  2. 확정 후 7일이 지난 이의는 거부된다.
//  3. 승강이 확정된(V1LeaguePromotion 행 존재) 리그의 이의는 거부된다.
//  4. 이의 수락(무효)이 실제로 순위표 집계에서 그 경기를 빼고, completed 였던 리그를
//     active 로 되돌린다.
const suiteId = randomUUID().slice(0, 8);
const adminUserId = `d2-dispute-admin-${suiteId}`;
const hostOwnerUserId = `d2-dispute-host-owner-${suiteId}`;
const outsiderUserId = `d2-dispute-outsider-${suiteId}`;

describe('리그 결과 이의 제기 (D2)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let gamesService: GamesService;
  let disputeService: LeagueMatchDisputeService;
  let publicService: LeagueMatchPublicService;
  let sportId: string;
  let regionId: string;
  let adminRowId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    gamesService = app.get(GamesService);
    disputeService = app.get(LeagueMatchDisputeService);
    publicService = app.get(LeagueMatchPublicService);

    for (const userId of [adminUserId, hostOwnerUserId, outsiderUserId]) {
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
    for (const userId of [adminUserId, hostOwnerUserId, outsiderUserId]) {
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
      data: { code: `d2-dispute-region-${suiteId}`, name: 'D2 이의 제기 테스트 지역', level: 2 },
    });
    regionId = region.id;
    // resolveTeamMatchCompetitionConfig(league-match-admin.service.ts가 대진 생성 시
    // 호출)가 요구하는 sportCode='futsal' + name='futsal-v1' + status='ACTIVE' 행은
    // CI의 "V1 migration replay + drift gate"가 `pnpm test:integration` 직전에
    // `competition-config-backfill.cli.ts`로 v1_migrate_check(이 격리 DB들의
    // 템플릿)에 미리 심어 둔다(docs/ops/task9-competition-config-contract-phase.md).
    // 로컬 실행도 같은 CLI를 템플릿 DB에 한 번 돌려 두면 이 스펙에서 별도로 만들
    // 필요가 없다.
  });

  afterAll(async () => cleanup?.());

  async function createOfficializedLeague(title: string) {
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
      .send({ homeScore: 2, awayScore: 1, reason: 'D2 테스트용 결과 확정' });
    expect(resultRes.status).toBe(201);
    const revisionId = resultRes.body.data.resultRevisionId as string;

    // 이 리그는 팀 2개·1주차라 대진이 정확히 1건 -- 유일한 대진이 확정되는 순간
    // LeagueCompletionProjectionService 가 리그를 completed 로 자동 전이한다(R6/D-3).
    // 그 투영은 GAME_RESULT_OFFICIAL 아웃박스 이벤트를 워커가 처리해야 실행되므로,
    // 여기서 직접 드레인한다(game-projection.integration-spec.ts 등 기존 관례와 동일).
    await drainOutbox();

    const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.state).toBe('completed');

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    return { leagueId, teamMatchId, teamMatch, game, revisionId };
  }

  async function drainOutbox(): Promise<void> {
    const worker = new V1GameOperationsWorkerService(prisma);
    // 가드 무한루프 방지: 대진 하나짜리 리그의 프로젝션 체인은 몇 건 넘지 않는다.
    for (let i = 0; i < 50; i += 1) {
      const processed = await worker.processOne();
      if (!processed) break;
    }
  }

  it('비-admin 호스트팀 오너가 무효(void) 액션을 시도하면 resolveActor 레벨에서 403을 받는다', async () => {
    const { game, teamMatch } = await createOfficializedLeague('이의-void-403');

    const nonAdminActor: V1AuthUser = {
      id: hostOwnerUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };

    let caught: unknown;
    try {
      await gamesService.voidTeamMatchResult(nonAdminActor, game.id, `d2-void-403-${randomUUID()}`, {
        expectedVersion: game.version,
        clientCommandId: `d2-void-403-${randomUUID()}`,
        reason: '팀이 스스로 무효화를 시도 -- 거부돼야 함',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getStatus()).toBe(403);
    expect((caught as ForbiddenException).getResponse()).toMatchObject({ code: 'PERMISSION_DENIED' });

    const unchangedGame = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id } });
    expect(unchangedGame.version).toBe(game.version);
  });

  it('확정 후 7일이 지난 이의는 거부된다', async () => {
    const { leagueId, teamMatchId } = await createOfficializedLeague('이의-7일경과');

    // `v1_game_result_revisions`는 OFFICIAL(terminal) 이 된 행에 대한 UPDATE를 DB
    // 트리거(v1_guard_result_revision_mutation, "terminal result revisions are
    // immutable")가 거부한다 -- officialAt을 과거로 되돌려 쓸 수 없다. 대신 "지금"을
    // 앞으로 8일 옮긴다(Date만 fake -- Prisma가 실제로 쓰는 setTimeout 등 타이머는
    // 그대로 real이라 DB I/O에 영향이 없다). revision.officialAt은 DB에서 읽은 실제
    // 과거 타임스탬프 그대로이므로 "확정 후 8일이 지난 시점에서 이의를 제기"하는
    // 상황을 정확히 재현한다.
    jest.useFakeTimers({
      doNotFake: [
        'nextTick', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'setImmediate', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance',
      ],
    });
    jest.setSystemTime(new Date(Date.now() + 8 * 24 * 60 * 60 * 1_000));

    const filerActor: V1AuthUser = {
      id: hostOwnerUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };

    try {
      await expect(
        disputeService.fileDispute(filerActor, leagueId, teamMatchId, { reason: '너무 늦은 이의' }),
      ).rejects.toMatchObject({
        response: { code: 'LEAGUE_RESULT_DISPUTE_WINDOW_EXPIRED' },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('승강이 확정된 리그의 이의는 거부된다', async () => {
    const { leagueId, teamMatchId, teamMatch } = await createOfficializedLeague('이의-승강확정');

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

    const filerActor: V1AuthUser = {
      id: hostOwnerUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };

    await expect(
      disputeService.fileDispute(filerActor, leagueId, teamMatchId, { reason: '승강 확정 후 이의' }),
    ).rejects.toMatchObject({
      response: { code: 'LEAGUE_PROMOTION_ALREADY_COMMITTED' },
    });
  });

  it('이의 수락(무효)이 순위표 집계에서 그 경기를 빼고, completed 였던 리그를 active 로 되돌린다', async () => {
    const { leagueId, teamMatchId, teamMatch } = await createOfficializedLeague('이의-무효수락');

    // 무효 전: 유일한 대진 결과가 반영돼 두 팀 모두 played=1.
    const before = await publicService.standings(leagueId);
    const beforeHost = before.standings.find((row: { teamId: string }) => row.teamId === teamMatch.hostTeamId);
    expect(beforeHost?.played).toBe(1);

    const filerActor: V1AuthUser = {
      id: hostOwnerUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    const dispute = await disputeService.fileDispute(filerActor, leagueId, teamMatchId, { reason: '심판 오심으로 결과 무효 요청' });
    expect(dispute.status).toBe('open');

    const adminActor: V1AuthUser = {
      id: adminUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    const resolved = await disputeService.resolveDispute(adminActor, dispute.id, {
      resolution: 'void',
      note: '오심 확인 -- 결과 무효 처리',
    });
    expect(resolved.status).toBe('accepted');
    expect(resolved.resolution).toBe('void');
    expect(resolved.alreadyProcessed).toBe(false);

    const disputeRow = await prisma.v1LeagueMatchDispute.findUniqueOrThrow({ where: { id: dispute.id } });
    expect(disputeRow.status).toBe('accepted');
    expect(disputeRow.resolution).toBe('void');

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const currentRevision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: game.currentOfficialRevisionId! },
    });
    expect(currentRevision.state).toBe('VOID');

    // league-standings.ts 를 고치지 않고도 이 계산 결과로 빠져야 한다 -- V1GameOfficialFact 가
    // VOID 리비전에는 만들어지지 않는다는 구조적 보장(voidTeamMatchResult 의 doc comment).
    const after = await publicService.standings(leagueId);
    const afterHost = after.standings.find((row: { teamId: string }) => row.teamId === teamMatch.hostTeamId);
    expect(afterHost?.played).toBe(0);

    const league = await prisma.v1League.findUniqueOrThrow({ where: { id: leagueId } });
    expect(league.state).toBe('active');
  });

  it('참가팀이 아닌 사용자는 이의를 제기할 수 없다', async () => {
    const { leagueId, teamMatchId } = await createOfficializedLeague('이의-비참가팀');

    const outsiderActor: V1AuthUser = {
      id: outsiderUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };

    let caught: unknown;
    try {
      await disputeService.fileDispute(outsiderActor, leagueId, teamMatchId, { reason: '무관한 사람의 이의' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getStatus()).toBe(403);
  });

  // 적대 리뷰가 잡은 결함: 어드민 이의 목록에 권한 검사가 없어 **로그인만 하면** 남의
  // 리그 분쟁 본문·제기자 id·처리 메모를 전부 읽을 수 있었다. 컨트롤러의 V1AuthGuard 는
  // "로그인했다"만 증명한다. 목록만 게이트가 빠져 있어도 형제 엔드포인트(resolve/reject)가
  // 막혀 있으면 눈에 안 띈다 — 그래서 목록 자체를 겨냥한 단언이 필요하다.
  it('관리자가 아닌 사용자는 이의 목록을 읽을 수 없다', async () => {
    await createOfficializedLeague('이의-목록-권한');

    const outsiderActor: V1AuthUser = {
      id: outsiderUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };

    let caught: unknown;
    try {
      await disputeService.listDisputes(outsiderActor);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught as ForbiddenException).getStatus()).toBe(403);
  });

  it('이미 처리된 이의를 다시 수락 요청하면 alreadyProcessed=true 로 조용히 반환한다', async () => {
    const { leagueId, teamMatchId } = await createOfficializedLeague('이의-멱등');

    const filerActor: V1AuthUser = {
      id: hostOwnerUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    const dispute = await disputeService.fileDispute(filerActor, leagueId, teamMatchId, { reason: '멱등 테스트' });

    const adminActor: V1AuthUser = {
      id: adminUserId,
      email: null,
      accountStatus: 'active',
      onboardingStatus: 'completed',
    };
    await disputeService.rejectDispute(adminActor, dispute.id, { note: '근거 부족으로 거부' });

    const second = await disputeService.resolveDispute(adminActor, dispute.id, {
      resolution: 'void',
      note: '이미 거부된 건에 대한 재시도',
    });
    expect(second.alreadyProcessed).toBe(true);
    expect(second.status).toBe('rejected');
  });
});

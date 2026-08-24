import { LeagueMatchDisputeService } from './league-match-dispute.service';

// 리그 알림 문구 전용화(2026-08-25) 문제 2 전용 유닛 스펙. LeagueMatchDisputeService의
// 나머지 계약(권한/윈도우/승강 게이트/멱등)은 이미 통합 스펙
// (test/league-matches/league-match-dispute.integration-spec.ts)이 실 DB로 검증한다 --
// 여기서는 새로 추가된 "누구에게 알리는가" 만 team-contacts.service.spec.ts 관례(prisma
// 전체 jest.fn() mock + emitToManyDeferred 클로저를 직접 실행해 실제 쿼리 필터를 검증)로
// 좁게 확인한다(글로벌 지침 24 -- 변경 크기에 비례).

function makePrisma() {
  const prisma: any = {
    v1TeamMatch: { findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    v1GameResultRevision: { findUnique: jest.fn() },
    v1LeaguePromotion: { findFirst: jest.fn().mockResolvedValue(null) },
    v1LeagueMatchDispute: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue([]) },
    v1AdminUser: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = jest.fn().mockImplementation((cb: any) => cb(prisma));
  return prisma;
}

function makeNotifications() {
  return { emitToManyDeferred: jest.fn() } as any;
}

function makeService(prisma: any, notifications: any) {
  const adminContext = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-row-1' }), getActiveAdmin: jest.fn() } as any;
  const games = {
    assertTeamResultDisputeFileAuthority: jest.fn(),
    voidTeamMatchResult: jest.fn().mockResolvedValue(undefined),
  } as any;
  const leagueAdmin = { revertCompletionInTx: jest.fn().mockResolvedValue(undefined) } as any;
  const resultEntry = { correctResult: jest.fn().mockResolvedValue(undefined) } as any;
  return new LeagueMatchDisputeService(prisma, adminContext, games, notifications, leagueAdmin, resultEntry);
}

const filerActor = { id: 'user-host-owner', email: null, accountStatus: 'active', onboardingStatus: 'completed' } as any;
const adminActor = { id: 'admin-user-1', email: null, accountStatus: 'active', onboardingStatus: 'completed' } as any;

/** notifications.emitToManyDeferred.mock.calls 중 주어진 type의 첫 호출을 찾는다. */
function findCall(notifications: any, type: string) {
  const call = notifications.emitToManyDeferred.mock.calls.find((c: unknown[]) => c[1] === type);
  if (!call) throw new Error(`no emitToManyDeferred call found for type ${type}`);
  return call as [() => Promise<string[]>, string, string, string | undefined];
}

describe('LeagueMatchDisputeService 알림 수신자', () => {
  describe('fileDispute', () => {
    function setupOfficializedMatch(prisma: any, filerTeamId: 'team-host' | 'team-away') {
      prisma.v1TeamMatch.findFirst.mockResolvedValue({
        id: 'tm-1',
        hostTeamId: 'team-host',
        approvedApplicantTeamId: 'team-away',
        game: { id: 'game-1', currentOfficialRevisionId: 'rev-1' },
      });
      prisma.v1GameResultRevision.findUnique.mockResolvedValue({
        id: 'rev-1',
        state: 'OFFICIAL',
        officialAt: new Date('2026-08-20T00:00:00Z'),
      });
      prisma.v1LeagueMatchDispute.create.mockResolvedValue({ id: 'dispute-1', createdAt: new Date() });
      return filerTeamId;
    }

    it('이의를 낸 팀(host)이 아니라 상대 팀(away)의 owner/manager에게만 알린다', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      setupOfficializedMatch(prisma, 'team-host');
      const service = makeService(prisma, notifications);
      (service as any).games.assertTeamResultDisputeFileAuthority.mockResolvedValue({
        actorUserId: 'user-host-owner',
        teamId: 'team-host',
      });

      await service.fileDispute(filerActor, 'league-1', 'tm-1', { reason: '오심으로 결과가 잘못됐어요' });

      const [resolveUserIds, , targetId, body] = findCall(notifications, 'league_match_dispute_received');
      expect(targetId).toBe('tm-1');
      expect(body).toContain('오심으로 결과가 잘못됐어요');

      prisma.v1TeamMembership.findMany.mockResolvedValue([{ userId: 'away-owner' }, { userId: 'away-manager' }]);
      await expect(resolveUserIds()).resolves.toEqual(['away-owner', 'away-manager']);
      expect(prisma.v1TeamMembership.findMany).toHaveBeenLastCalledWith({
        where: { teamId: { in: ['team-away'] }, status: 'active', role: { in: ['owner', 'manager'] } },
        select: { userId: true },
      });
    });

    it('이의를 낸 팀이 away일 때는 반대로 host에게만 알린다', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      setupOfficializedMatch(prisma, 'team-away');
      const service = makeService(prisma, notifications);
      (service as any).games.assertTeamResultDisputeFileAuthority.mockResolvedValue({
        actorUserId: 'user-away-owner',
        teamId: 'team-away',
      });

      await service.fileDispute(
        { ...filerActor, id: 'user-away-owner' },
        'league-1',
        'tm-1',
        { reason: '경기 시간이 잘못 기록됐어요' },
      );

      const [resolveUserIds] = findCall(notifications, 'league_match_dispute_received');
      prisma.v1TeamMembership.findMany.mockResolvedValue([{ userId: 'host-owner' }]);
      await expect(resolveUserIds()).resolves.toEqual(['host-owner']);
      expect(prisma.v1TeamMembership.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ teamId: { in: ['team-host'] } }) }),
      );
    });
  });

  describe('resolveDispute', () => {
    function setupOpenDispute(prisma: any) {
      prisma.v1LeagueMatchDispute.findUnique.mockResolvedValue({
        id: 'dispute-1',
        status: 'open',
        leagueId: 'league-1',
        teamMatchId: 'tm-1',
        resolution: null,
      });
      prisma.v1LeagueMatchDispute.updateMany.mockResolvedValue({ count: 1 });
    }

    it('정정(correction) 수락 시 양 팀 owner/manager 전원에게 알리고 문구는 "정정"이다', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      setupOpenDispute(prisma);
      const service = makeService(prisma, notifications);

      await service.resolveDispute(adminActor, 'dispute-1', {
        resolution: 'correction',
        note: '스코어 오기입 수정',
        homeScore: 3,
        awayScore: 1,
      });

      const [resolveUserIds, , targetId, body] = findCall(notifications, 'league_match_dispute_corrected');
      expect(targetId).toBe('tm-1');
      expect(body).toContain('스코어 오기입 수정');
      expect(body).toContain('정정');

      prisma.v1TeamMatch.findUnique.mockResolvedValue({ hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away' });
      prisma.v1TeamMembership.findMany.mockResolvedValue([{ userId: 'host-owner' }, { userId: 'away-manager' }]);
      await expect(resolveUserIds()).resolves.toEqual(['host-owner', 'away-manager']);
      expect(prisma.v1TeamMembership.findMany).toHaveBeenLastCalledWith({
        where: { teamId: { in: ['team-host', 'team-away'] }, status: 'active', role: { in: ['owner', 'manager'] } },
        select: { userId: true },
      });
    });

    it('무효(void) 수락 시 문구는 "무효 처리"이고 타입은 voided다', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      setupOpenDispute(prisma);
      prisma.v1TeamMatch.findUniqueOrThrow.mockResolvedValue({ game: { id: 'game-1', version: 3 } });
      const service = makeService(prisma, notifications);

      await service.resolveDispute(adminActor, 'dispute-1', { resolution: 'void', note: '심판 오심 확인' });

      const [, , , body] = findCall(notifications, 'league_match_dispute_voided');
      expect(body).toContain('심판 오심 확인');
      expect(body).toContain('무효 처리');
    });

    it('이미 처리된(open이 아닌) 이의는 알리지 않는다', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      prisma.v1LeagueMatchDispute.findUnique.mockResolvedValue({
        id: 'dispute-1',
        status: 'rejected',
        resolution: null,
      });
      const service = makeService(prisma, notifications);

      const result = await service.resolveDispute(adminActor, 'dispute-1', { resolution: 'void', note: '재시도' });

      expect(result.alreadyProcessed).toBe(true);
      expect(notifications.emitToManyDeferred).not.toHaveBeenCalledWith(
        expect.anything(),
        'league_match_dispute_voided',
        expect.anything(),
        expect.anything(),
      );
      expect(notifications.emitToManyDeferred).not.toHaveBeenCalledWith(
        expect.anything(),
        'league_match_dispute_corrected',
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('rejectDispute', () => {
    it('거부 시 양 팀 owner/manager 전원에게 알린다', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      prisma.v1LeagueMatchDispute.updateMany.mockResolvedValue({ count: 1 });
      prisma.v1LeagueMatchDispute.findUniqueOrThrow.mockResolvedValue({ teamMatchId: 'tm-1' });
      const service = makeService(prisma, notifications);

      await service.rejectDispute(adminActor, 'dispute-1', { note: '근거 부족' });

      const [resolveUserIds, , targetId, body] = findCall(notifications, 'league_match_dispute_rejected');
      expect(targetId).toBe('tm-1');
      expect(body).toContain('근거 부족');

      prisma.v1TeamMatch.findUnique.mockResolvedValue({ hostTeamId: 'team-host', approvedApplicantTeamId: 'team-away' });
      prisma.v1TeamMembership.findMany.mockResolvedValue([{ userId: 'host-owner' }]);
      await expect(resolveUserIds()).resolves.toEqual(['host-owner']);
    });
  });
});

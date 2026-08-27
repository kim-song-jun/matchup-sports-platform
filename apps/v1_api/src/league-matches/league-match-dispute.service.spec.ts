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
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
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
        // 고정 날짜(2026-08-20)를 쓰면 **테스트가 달력에 의존한다** — fileDispute 는
        // officialAt 으로부터 7일이 지났는지를 `new Date()` 로 판정하므로, 그 날짜가
        // 7일 넘게 과거가 되는 순간 이 스펙이 window_expired 로 깨진다(2026-08-27 에
        // 실제로 깨져 dev 기준 모든 PR 의 API job 을 막았다).
        // 이 스펙의 관심사는 **알림 수신자**이지 기간 만료가 아니므로, 창 안쪽임이
        // 보장되는 상대 시각으로 고정한다.
        officialAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 하루 전 — 7일 창 안
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

    // 감사 L-E finding 1: fileDispute는 제기 시점에만 승강 확정 여부를 본다 -- 이의가
    // 열려 있는 동안 승강이 확정될 수 있으므로 resolveDispute도 처리 직전에 같은 검사를
    // 다시 태워야 한다. 이 게이트가 없으면 정정/무효로 순위표가 바뀌는데 이미 확정된
    // 승강 결정은 옛 순위 그대로 남는다.
    it('승강이 이미 확정된 리그의 이의는 수락할 수 없다 -- 결과를 건드리지 않고 409', async () => {
      const prisma = makePrisma();
      const notifications = makeNotifications();
      setupOpenDispute(prisma);
      prisma.v1LeaguePromotion.findFirst.mockResolvedValue({ id: 'promotion-row-1' });
      const service = makeService(prisma, notifications);

      await expect(
        service.resolveDispute(adminActor, 'dispute-1', {
          resolution: 'correction',
          note: '승강 확정 후 뒤늦은 정정 시도',
          homeScore: 2,
          awayScore: 1,
        }),
      ).rejects.toMatchObject({ response: { code: 'LEAGUE_PROMOTION_ALREADY_COMMITTED' } });

      expect(prisma.v1LeaguePromotion.findFirst).toHaveBeenCalledWith({
        where: { fromLeagueId: 'league-1' },
        select: { id: true },
      });
      expect((service as any).resultEntry.correctResult).not.toHaveBeenCalled();
      expect(prisma.v1LeagueMatchDispute.updateMany).not.toHaveBeenCalled();
      expect(notifications.emitToManyDeferred).not.toHaveBeenCalled();
    });

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

describe('LeagueMatchDisputeService.listDisputes 상태 탭 카운트', () => {
  it('counts 는 status 필터와 무관한 전체 분포이고, 없는 상태는 0 으로 채운다', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma, makeNotifications());
    prisma.v1LeagueMatchDispute.findMany.mockResolvedValue([]);
    prisma.v1LeagueMatchDispute.groupBy.mockResolvedValue([
      { status: 'open', _count: { _all: 2 } },
      { status: 'rejected', _count: { _all: 1 } },
    ]);

    const result = await service.listDisputes(adminActor, 'open');

    expect(result.counts).toEqual({ open: 2, accepted: 0, rejected: 1 });
    // 필터된 where 를 groupBy 에 재사용하면 비활성 탭이 항상 0 이 된다 — 무필터 계약 고정.
    expect(prisma.v1LeagueMatchDispute.groupBy).toHaveBeenCalledWith({ by: ['status'], _count: { _all: true } });
  });
});

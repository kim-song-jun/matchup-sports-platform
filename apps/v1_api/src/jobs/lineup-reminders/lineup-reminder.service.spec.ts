import { buildDailyMessages, buildRosterCheckMessages, LineupReminderService } from './lineup-reminder.service';
import type { CompetitionRosterCheck, LineupTodo } from '../../team-lineups/lineup-todo.service';

/**
 * 2026-08-27 감사 41/44/45 회귀 커버리지.
 *
 * 이 서비스는 이전까지 스펙이 없었다 — 두 결함을 고치면서 함께 만든다:
 * - 45: `scheduleNextScan`이 스캔과 **분리된** 트랜잭션으로 먼저 커밋되는가(스캔이
 *   실패해도 예약이 살아남는가).
 * - 41/44: 웹 푸시가 `claim.afterCommit`에만 담기고 워커 트랜잭션 안에서 즉시
 *   나가지 않는가.
 */
describe('LineupReminderService', () => {
  // KST 11:00 — QUIET_START_HOUR(21)/QUIET_END_HOUR(9) 사이가 아니라 스캔이 실제로 돈다.
  // scanHandler는 인자로 now를 받지 않고 내부에서 `new Date()`를 직접 읽으므로, 이 값으로
  // 시스템 시각을 고정해 두지 않으면 테스트를 실제로 돌리는 벽시계 시각이 우연히 quiet
  // hour(21~09시 KST)에 걸릴 때 runScan이 조용히 no-op돼 테스트가 간헐적으로 깨진다.
  const NOT_QUIET_HOUR = new Date('2026-08-27T02:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOT_QUIET_HOUR);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function fakeTodo(overrides: Partial<LineupTodo> = {}): LineupTodo {
    return {
      source: 'TEAM_MATCH',
      competitionKind: 'FRIENDLY',
      teamId: 'team-1',
      teamName: '테스트 팀',
      gameId: 'game-1',
      tournamentId: null,
      tournamentTitle: null,
      title: '팀 매치',
      opponentName: '상대팀',
      // 킥오프 2시간 이내 최종 알림 창에 걸리지 않도록 충분히 멀리 둔다 — 이 스펙은
      // "매일 알림" 한 건만 만들어지는 것을 전제로 한다.
      scheduledAt: new Date('2026-08-29T00:00:00Z'),
      state: 'MISSING',
      deepLink: '/team-matches/tm-1',
      ...overrides,
    };
  }

  function fakeRosterCheck(overrides: Partial<CompetitionRosterCheck> = {}): CompetitionRosterCheck {
    return {
      source: 'TEAM_MATCH',
      competitionKind: 'LEAGUE',
      teamId: 'team-home',
      teamName: '성수 FC',
      gameId: 'game-league',
      tournamentId: 'league-1',
      tournamentTitle: '가을 리그',
      title: '가을 리그 2주차',
      opponentName: '망원 FC',
      scheduledAt: new Date('2026-08-28T10:00:00Z'),
      lineupState: 'DONE',
      deepLink: '/teams/team-home/games/game-league/roster',
      rosterSummary: { participating: 10, excluded: 0, unavailable: 0, suspended: 0 },
      ...overrides,
    };
  }

  // MD-QA #14 이후 할 일은 친선 참석명단뿐이다(Task 179 R1) — 경기마다 한 건, "참석명단" 문구.
  it('친선 참석명단 일일 알림은 경기마다 한 건이고 "참석명단" 문구를 쓴다', () => {
    const messages = buildDailyMessages([
      fakeTodo({ gameId: 'friendly-1', state: 'MISSING' }),
      fakeTodo({ gameId: 'friendly-2', state: 'DRAFT', opponentName: null }),
    ], '2026-08-27');

    expect(messages.map((message) => message.keyPrefix)).toEqual([
      'lineup-daily:game:friendly-1:team-1:2026-08-27',
      'lineup-daily:game:friendly-2:team-1:2026-08-27',
    ]);
    expect(messages[0]).toMatchObject({
      title: '팀 매치 참석명단을 확인해 주세요',
      body: '테스트 팀 · 1경기는 참석명단이 비어 있고. 가장 가까운 경기는 팀 매치 vs 상대팀예요.',
    });
    expect(messages[1].body).toBe('테스트 팀 · 1경기는 아직 제출 전이에요. 가장 가까운 경기는 팀 매치예요.');
    expect(messages.some((message) => message.body.includes('라인업'))).toBe(false);
  });

  it('명단 확인 알림은 계산된 출전 인원(빠짐·정지 제외)과 경기 명단 화면 링크를 싣고 키에 날짜가 없다', () => {
    const [message] = buildRosterCheckMessages([
      fakeRosterCheck({ rosterSummary: { participating: 9, excluded: 2, unavailable: 1, suspended: 1 } }),
    ]);

    expect(message).toEqual({
      teamId: 'team-home',
      targetId: 'team-home',
      title: '가을 리그 2주차 vs 망원 FC 명단을 확인해 주세요',
      body: '내일 경기 출전 9명 · 빠지는 사람이 있으면 조정해 주세요',
      deepLink: '/teams/team-home/games/game-league/roster',
      keyPrefix: 'roster-check:game-league:team-home',
    });
  });

  function fakeClaim(overrides: { id?: string; afterCommit?: Array<() => void | Promise<void>> } = {}) {
    return {
      id: overrides.id ?? 'outbox-1',
      businessKey: 'lineup-reminder-scan:slot',
      aggregateType: 'LINEUP_REMINDER',
      aggregateId: 'scan',
      revisionId: null,
      type: 'LINEUP_REMINDER_SCAN',
      payload: {},
      attempts: 0,
      retryGeneration: 0,
      version: 0,
      leaseOwner: 'owner-1',
      leaseUntil: new Date(),
      // 실제 워커는 매 클레임마다 이 배열을 빈 배열로 채운 뒤 handler를 부른다
      // (v1-game-operations-worker.service.ts:419) — 그 계약을 그대로 흉내낸다.
      afterCommit: overrides.afterCommit ?? [],
    };
  }

  type StartAtFilter = { gt?: Date; gte?: Date; lt?: Date; lte?: Date };
  const inWindow = (at: Date, filter: StartAtFilter) =>
    (filter.gt === undefined || at > filter.gt) &&
    (filter.gte === undefined || at >= filter.gte) &&
    (filter.lt === undefined || at < filter.lt) &&
    (filter.lte === undefined || at <= filter.lte);

  function fakeTx(
    options: {
      /** 팀 운영 알림(owner·manager 조회) — `where.teamId` 가 문자열인 조회. */
      memberships?: Array<{ userId: string }> | Record<string, Array<{ userId: string }>>;
      /** 경기 알림 수신자 계산 — `where.teamId.in` 조회. */
      teamMembers?: Array<{ teamId: string; userId: string; role: string }>;
      teamMatches?: Array<{ startAt: Date } & Record<string, unknown>>;
      lineups?: Array<{ id: string; sideId: string; state: string }>;
      participants?: Array<{ lineupId: string; sideId: string; userId: string | null }>;
      preferences?: Array<{ userId: string; teamEnabled?: boolean; teamMatchEnabled?: boolean }>;
      alreadyDelivered?: string[];
    } = {},
  ) {
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    return {
      v1TeamMembership: {
        findMany: jest.fn(({ where }: { where: { teamId: string | { in: string[] } } }) =>
          Promise.resolve(
            typeof where.teamId !== 'string'
              ? (options.teamMembers ?? []).filter((row) => (where.teamId as { in: string[] }).in.includes(row.teamId))
              : Array.isArray(options.memberships) ? options.memberships : (options.memberships?.[where.teamId] ?? []),
          ),
        ),
      },
      v1TeamMatch: {
        findMany: jest.fn(({ where }: { where: { startAt: StartAtFilter } }) =>
          Promise.resolve((options.teamMatches ?? []).filter((row) => inWindow(row.startAt, where.startAt))),
        ),
      },
      v1GameLineup: { findMany: jest.fn().mockResolvedValue(options.lineups ?? []) },
      v1GameParticipant: {
        findMany: jest.fn(({ where }: { where: { lineupId: { in: string[] } } }) =>
          Promise.resolve((options.participants ?? []).filter((row) => where.lineupId.in.includes(row.lineupId) && row.userId !== null)),
        ),
      },
      v1NotificationPreference: { findMany: jest.fn().mockResolvedValue(options.preferences ?? []) },
      v1Notification: {
        findMany: jest
          .fn()
          .mockResolvedValue((options.alreadyDelivered ?? []).map((businessKey) => ({ businessKey }))),
        createMany,
      },
    };
  }

  function fakePrisma() {
    const scheduleTx = { v1OutboxEvent: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    return {
      scheduleTx,
      prisma: {
        $transaction: jest.fn((callback: (tx: unknown) => unknown) => Promise.resolve(callback(scheduleTx))),
      },
    };
  }

  describe('감사 45: 다음 스캔 예약은 스캔과 분리된 독립 트랜잭션으로 먼저 커밋된다', () => {
    it('scanHandler는 runScan을 시작하기 전에 이미 별도 트랜잭션으로 다음 스캔을 예약한다', async () => {
      const todoService = { listAllPending: jest.fn().mockResolvedValue([]), listCompetitionRosterChecks: jest.fn().mockResolvedValue([]) };
      const { prisma, scheduleTx } = fakePrisma();
      const service = new LineupReminderService(todoService as never, prisma as never);
      const tx = fakeTx();

      await service.scanHandler(fakeClaim() as never, tx as never);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(scheduleTx.v1OutboxEvent.createMany).toHaveBeenCalledTimes(1);
    });

    it('runScan이 실패해도(DB 오류 등) 이미 커밋된 다음 스캔 예약은 되돌아가지 않는다', async () => {
      // 이 실패는 워커의 15초 데드라인 초과나 도중 DB 오류를 흉내낸다 — 예전 코드는
      // scheduleNextScan을 스캔과 "같은" tx에 finally로 걸어 뒀기 때문에, 이 예외가
      // 워커의 $transaction 콜백 밖으로 전파되면 예약 INSERT까지 함께 롤백됐다.
      const todoService = { listAllPending: jest.fn().mockRejectedValue(new Error('DB timeout')) };
      const { prisma, scheduleTx } = fakePrisma();
      const service = new LineupReminderService(todoService as never, prisma as never);
      const tx = fakeTx();

      await expect(service.scanHandler(fakeClaim() as never, tx as never)).rejects.toThrow('DB timeout');

      // 예약은 runScan과 무관하게 독립 트랜잭션으로 이미 커밋됐어야 한다.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(scheduleTx.v1OutboxEvent.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('감사 41/44: 웹 푸시는 claim.afterCommit에 담기고 워커 트랜잭션 안에서 즉시 나가지 않는다', () => {
    it('claim.afterCommit이 있으면 push를 즉시 보내지 않고 커밋 후 실행할 effect로만 담는다', async () => {
      const todoService = { listAllPending: jest.fn().mockResolvedValue([fakeTodo()]), listCompetitionRosterChecks: jest.fn().mockResolvedValue([]) };
      const { prisma } = fakePrisma();
      const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      const service = new LineupReminderService(todoService as never, prisma as never, webPush as never);
      const tx = fakeTx({ memberships: [{ userId: 'manager-1' }] });
      const afterCommit: Array<() => void | Promise<void>> = [];
      const claim = fakeClaim({ afterCommit });

      await service.scanHandler(claim as never, tx as never);

      // 아직 워커 트랜잭션이 커밋되지 않았다고 가정하는 시점 — 알림 row는 이미
      // durable하게 만들어졌지만 푸시가 나가면 안 된다.
      expect(tx.v1Notification.createMany).toHaveBeenCalled();
      expect(webPush.sendToUser).not.toHaveBeenCalled();
      expect(afterCommit).toHaveLength(1);

      // 워커가 커밋 확정 뒤 afterCommit을 실행하는 시점을 흉내낸다.
      await afterCommit[0]();
      expect(webPush.sendToUser).toHaveBeenCalledWith('manager-1', expect.anything());
    });
  });

  describe('Task 179 R1: 대회·리그 경기는 전날 "명단 확인" 한 번', () => {
    const managers = {
      'team-home': [{ userId: 'home-owner' }, { userId: 'home-manager' }],
      'team-away': [{ userId: 'away-owner' }],
    };
    const checks = () => [
      fakeRosterCheck(),
      fakeRosterCheck({ teamId: 'team-away', teamName: '망원 FC', opponentName: '성수 FC', deepLink: '/teams/team-away/games/game-league/roster', rosterSummary: { participating: 7, excluded: 1, unavailable: 0, suspended: 0 } }),
    ];

    function serviceWith(rosterChecks: CompetitionRosterCheck[]) {
      const todoService = {
        listAllPending: jest.fn().mockResolvedValue([]),
        listCompetitionRosterChecks: jest.fn().mockResolvedValue(rosterChecks),
      };
      const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      const service = new LineupReminderService(todoService as never, fakePrisma().prisma as never, webPush as never);
      return { service, todoService, webPush };
    }

    it('내일(KST) 하루 창으로 대상 경기를 묻는다', async () => {
      const { service, todoService } = serviceWith([]);
      await service.scanHandler(fakeClaim() as never, fakeTx() as never);
      // 지금 = KST 8/27 11:00 → 8/28 00:00 ~ 8/29 00:00 KST.
      expect(todoService.listCompetitionRosterChecks).toHaveBeenCalledWith(
        new Date('2026-08-27T15:00:00Z'),
        new Date('2026-08-28T15:00:00Z'),
      );
    });

    it('양 팀 owner·manager 각자에게 그 팀의 출전 인원으로 한 건씩 보낸다', async () => {
      const { service, webPush } = serviceWith(checks());
      const tx = fakeTx({ memberships: managers });
      const afterCommit: Array<() => void | Promise<void>> = [];
      await service.scanHandler(fakeClaim({ afterCommit }) as never, tx as never);

      const rows = tx.v1Notification.createMany.mock.calls.flatMap(([arg]) => arg.data);
      expect(rows.map((row: { recipientUserId: string; businessKey: string; body: string }) => [row.recipientUserId, row.businessKey, row.body])).toEqual([
        ['home-owner', 'roster-check:game-league:team-home:home-owner', '내일 경기 출전 10명 · 빠지는 사람이 있으면 조정해 주세요'],
        ['home-manager', 'roster-check:game-league:team-home:home-manager', '내일 경기 출전 10명 · 빠지는 사람이 있으면 조정해 주세요'],
        ['away-owner', 'roster-check:game-league:team-away:away-owner', '내일 경기 출전 7명 · 빠지는 사람이 있으면 조정해 주세요'],
      ]);
      await Promise.all(afterCommit.map((effect) => effect()));
      expect(webPush.sendToUser).toHaveBeenCalledTimes(3);
      expect(webPush.sendToUser).toHaveBeenCalledWith('away-owner', expect.objectContaining({ url: '/teams/team-away/games/game-league/roster' }));
    });

    it('같은 날 다음 스캔에서 이미 받은 사람에게는 푸시를 다시 보내지 않는다', async () => {
      const { service, webPush } = serviceWith(checks());
      const tx = fakeTx({
        memberships: managers,
        alreadyDelivered: [
          'roster-check:game-league:team-home:home-owner',
          'roster-check:game-league:team-home:home-manager',
          'roster-check:game-league:team-away:away-owner',
        ],
      });
      const afterCommit: Array<() => void | Promise<void>> = [];
      await service.scanHandler(fakeClaim({ afterCommit }) as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
      expect(afterCommit).toHaveLength(0);
      expect(webPush.sendToUser).not.toHaveBeenCalled();
    });

    it('팀 알림을 끈 사람에게는 가지 않는다', async () => {
      const { service } = serviceWith([fakeRosterCheck()]);
      const tx = fakeTx({ memberships: managers, preferences: [{ userId: 'home-manager', teamEnabled: false }] });
      await service.scanHandler(fakeClaim() as never, tx as never);

      const recipients = tx.v1Notification.createMany.mock.calls.flatMap(([arg]) => arg.data).map((row: { recipientUserId: string }) => row.recipientUserId);
      expect(recipients).toEqual(['home-owner']);
    });

    it('야간(KST 21~9시)에는 대상 조회도 하지 않는다', async () => {
      jest.setSystemTime(new Date('2026-08-27T13:00:00Z')); // KST 22:00
      const { service, todoService } = serviceWith(checks());
      const tx = fakeTx({ memberships: managers });
      await service.scanHandler(fakeClaim() as never, tx as never);

      expect(todoService.listCompetitionRosterChecks).not.toHaveBeenCalled();
      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('Task 180 G7: 킥오프 2시간 전 — 친선은 제출된 참석명단이 출전자', () => {
    // 지금 = KST 11:00, 킥오프 = KST 13:00 → 2시간 전 창 안이고 2시간 전 시각도 낮이다.
    const friendlyMatch = {
      id: 'tm-f',
      startAt: new Date('2026-08-27T04:00:00Z'),
      placeName: '망원 풋살장',
      leagueId: null,
      tournamentId: null,
      hostTeamId: 'team-home',
      hostTeam: { name: '성수 FC' },
      approvedApplicantTeam: { name: '망원 FC' },
      game: { id: 'game-f', sides: [{ id: 'side-home', teamId: 'team-home' }, { id: 'side-away', teamId: 'team-away' }] },
    };
    const scenario = {
      teamMatches: [friendlyMatch],
      teamMembers: [
        { teamId: 'team-home', userId: 'home-owner', role: 'owner' }, // 참석명단 밖 팀장
        { teamId: 'team-home', userId: 'home-p1', role: 'member' }, // 출전자
        { teamId: 'team-home', userId: 'home-p2', role: 'member' }, // 명단 밖 팀원
        { teamId: 'team-away', userId: 'away-owner', role: 'owner' },
      ],
      lineups: [
        { id: 'lineup-h', sideId: 'side-home', state: 'SUBMITTED' },
        { id: 'lineup-a', sideId: 'side-away', state: 'DRAFT' }, // 원정은 아직 제출 전
      ],
      participants: [
        { lineupId: 'lineup-h', sideId: 'side-home', userId: 'home-p1' },
        { lineupId: 'lineup-h', sideId: 'side-home', userId: 'ex-member' }, // 명단에 남은 탈퇴자
        { lineupId: 'lineup-a', sideId: 'side-away', userId: 'away-owner' },
      ],
    };
    function serviceWithPush() {
      const todoService = { listAllPending: jest.fn().mockResolvedValue([]), listCompetitionRosterChecks: jest.fn().mockResolvedValue([]) };
      const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      return { service: new LineupReminderService(todoService as never, fakePrisma().prisma as never, webPush as never), webPush };
    }
    const sentRows = (tx: ReturnType<typeof fakeTx>) =>
      tx.v1Notification.createMany.mock.calls.flatMap(([arg]) => arg.data) as Array<{ recipientUserId: string; body: string; businessKey: string }>;

    it('제출된 참석명단의 활성 팀원과 팀장·매니저가 받고, 명단 밖·탈퇴자·미제출 사이드는 받지 않는다', async () => {
      const { service } = serviceWithPush();
      const tx = fakeTx(scenario);
      await service.scanHandler(fakeClaim() as never, tx as never);

      expect(sentRows(tx).map((row) => [row.recipientUserId, row.businessKey, row.body])).toEqual([
        ['home-p1', `game-kickoff:game-f:${friendlyMatch.startAt.getTime()}:home-p1`, '13:00 vs 망원 FC · 망원 풋살장. 지금 출전 명단에 있어요.'],
        ['home-owner', `game-kickoff:game-f:${friendlyMatch.startAt.getTime()}:home-owner`, '13:00 vs 망원 FC · 망원 풋살장.'],
      ]);
    });

    it('경기·대회 알림(teamMatchEnabled)을 끈 사람은 빠지고, 팀 활동 알림만 끈 사람은 받는다', async () => {
      const { service } = serviceWithPush();
      const tx = fakeTx({
        ...scenario,
        preferences: [
          { userId: 'home-p1', teamEnabled: true, teamMatchEnabled: false },
          { userId: 'home-owner', teamEnabled: false, teamMatchEnabled: true },
        ],
      });
      await service.scanHandler(fakeClaim() as never, tx as never);

      expect(sentRows(tx).map((row) => row.recipientUserId)).toEqual(['home-owner']);
    });

    it('두 번째 스캔에서 이미 받은 사람에게는 푸시를 다시 보내지 않는다', async () => {
      const { service, webPush } = serviceWithPush();
      const tx = fakeTx({ ...scenario, alreadyDelivered: [`game-kickoff:game-f:${friendlyMatch.startAt.getTime()}:home-p1`, `game-kickoff:game-f:${friendlyMatch.startAt.getTime()}:home-owner`] });
      const afterCommit: Array<() => void | Promise<void>> = [];
      await service.scanHandler(fakeClaim({ afterCommit }) as never, tx as never);

      expect(tx.v1Notification.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
      expect(afterCommit).toHaveLength(0);
      expect(webPush.sendToUser).not.toHaveBeenCalled();
    });

    it('야간(KST 21~9시) 스캔은 경기를 조회하지도 않는다', async () => {
      jest.setSystemTime(new Date('2026-08-27T13:00:00Z')); // KST 22:00
      const { service } = serviceWithPush();
      const tx = fakeTx({ ...scenario, teamMatches: [{ ...friendlyMatch, startAt: new Date('2026-08-27T15:00:00Z') }] });
      await service.scanHandler(fakeClaim() as never, tx as never);

      expect(tx.v1TeamMatch.findMany).not.toHaveBeenCalled();
      expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
    });
  });
});

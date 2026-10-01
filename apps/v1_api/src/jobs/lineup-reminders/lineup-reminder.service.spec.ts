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

  describe('Task 180 H1-lineup-included: 참석명단에 오른 선수에게 한 번', () => {
    // 지금 = KST 8/27 11:00(beforeEach). 킥오프 = KST 9/1 (화) 19:00.
    const KICKOFF = new Date('2026-09-01T10:00:00Z');
    const match = {
      id: 'tm-f',
      startAt: KICKOFF,
      placeName: '망원 풋살장',
      hostTeamId: 'team-home',
      hostTeam: { name: '성수 FC' },
      approvedApplicantTeam: { name: '망원 FC' },
    };

    function includedTx(options: {
      lineupState?: string;
      startAt?: Date;
      listed?: string[];
      activeMembers?: string[];
      existingKeys?: string[];
      matchFound?: boolean;
    }) {
      const existing = new Set(options.existingKeys ?? []);
      const activeMembers = options.activeMembers ?? options.listed ?? [];
      return {
        v1GameLineup: { findUnique: jest.fn().mockResolvedValue({ id: 'lineup-2', gameId: 'game-f', sideId: 'side-home', state: options.lineupState ?? 'SUBMITTED', invalidatedAt: null }) },
        v1GameSide: { findUnique: jest.fn().mockResolvedValue({ teamId: 'team-home' }) },
        v1TeamMatch: { findFirst: jest.fn().mockResolvedValue(options.matchFound === false ? null : { ...match, startAt: options.startAt ?? KICKOFF }) },
        v1GameParticipant: {
          // where.userId 가 문자열이면(늦은 추가) 그 사람 행만 — 실제 쿼리처럼 필터를 지킨다.
          findMany: jest.fn(({ where }: { where: { userId: string | { not: null } } }) =>
            Promise.resolve((options.listed ?? []).filter((userId) => typeof where.userId !== 'string' || where.userId === userId).map((userId) => ({ userId }))),
          ),
        },
        v1TeamMembership: {
          // 명단의 모든 사람이 멤버십 행을 갖고, activeMembers 밖은 'left' 다 — status 조건을 빼면 탈퇴자가 섞인다.
          findMany: jest.fn(({ where }: { where: { status?: string; userId: { in: string[] } } }) =>
            Promise.resolve(
              where.userId.in
                .filter((userId) => where.status === undefined || (where.status === 'active') === activeMembers.includes(userId))
                .map((userId) => ({ userId })),
            ),
          ),
        },
        v1NotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
        v1Notification: {
          findMany: jest.fn(({ where }: { where: { businessKey: { in: string[] } } }) =>
            Promise.resolve(where.businessKey.in.filter((key) => existing.has(key)).map((businessKey) => ({ businessKey }))),
          ),
          // 쓴 키는 다음 조회에 보인다 — 같은 핸들러가 두 번 돌 때(재전달) 두 번째가 첫 번째 행을 봐야 한다.
          createMany: jest.fn(({ data }: { data: Array<{ businessKey: string }> }) => {
            data.forEach((row) => existing.add(row.businessKey));
            return Promise.resolve({ count: data.length });
          }),
        },
      };
    }
    const includedClaim = (payload: Record<string, string> = { lineupId: 'lineup-2' }) => ({
      ...fakeClaim(),
      type: 'TEAM_MATCH_LINEUP_INCLUDED_NOTIFICATION',
      payload,
      afterCommit: undefined,
    });
    function run(tx: ReturnType<typeof includedTx>, payload?: Record<string, string>) {
      const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      const service = new LineupReminderService({} as never, fakePrisma().prisma as never, webPush as never);
      return { webPush, done: service.lineupIncludedHandler(includedClaim(payload) as never, tx as never) };
    }
    const rowsOf = (tx: ReturnType<typeof includedTx>) =>
      tx.v1Notification.createMany.mock.calls.flatMap(([arg]) => arg.data) as Array<Record<string, string>>;
    const kickoffKey = (userId: string, startAt = KICKOFF) => `game-kickoff:game-f:${startAt.getTime()}:${userId}`;

    it('명단에 오른 지금의 팀원만 받고(탈퇴자 제외) 우리 팀·상대·일시·장소를 싣는다', async () => {
      const tx = includedTx({ listed: ['p1', 'p2', 'left-member'], activeMembers: ['p1', 'p2'] });
      const { webPush, done } = run(tx);
      await done;

      expect(rowsOf(tx).map((row) => [row.recipientUserId, row.businessKey])).toEqual([
        ['p1', 'lineup-included:game-f:p1'],
        ['p2', 'lineup-included:game-f:p2'],
      ]);
      expect(rowsOf(tx)[0]).toMatchObject({
        targetType: 'team_match',
        targetId: 'tm-f',
        title: '참석명단에 올랐어요',
        body: '"성수 FC" · vs 망원 FC · 9/1 (화) 19:00 · 망원 풋살장',
        deepLink: '/team-matches/tm-f',
      });
      expect(webPush.sendToUser).toHaveBeenCalledTimes(2);
    });

    it('다시 제출하면 새로 오른 사람만 받는다 — 이미 받은 사람에게 두 번 가지 않는다', async () => {
      const tx = includedTx({ listed: ['p1', 'p3'], existingKeys: ['lineup-included:game-f:p1'] });
      const { done } = run(tx);
      await done;

      expect(rowsOf(tx).map((row) => row.recipientUserId)).toEqual(['p3']);
    });

    it('[H5 늦은 추가] payload 의 그 선수만 받는다 — 제출 때 알림이 없던 기존 선수(배포 전 제출본 등)에게 경기 중에 가지 않는다', async () => {
      const tx = includedTx({ listed: ['p1', 'p2', 'late'] });
      await run(tx, { lineupId: 'lineup-2', userId: 'late' }).done;

      expect(rowsOf(tx).map((row) => [row.recipientUserId, row.title])).toEqual([['late', '참석명단에 올랐어요']]);
    });

    it('[H5 늦은 추가] 같은 알림이 두 번 처리돼도(재전달·두 번 추가) 한 건이다', async () => {
      const tx = includedTx({ listed: ['p1', 'late'] });
      await run(tx, { lineupId: 'lineup-2', userId: 'late' }).done;
      await run(tx, { lineupId: 'lineup-2', userId: 'late' }).done;

      expect(rowsOf(tx).map((row) => row.recipientUserId)).toEqual(['late']);
    });

    it('[H5 늦은 추가] userId 가 빈 문자열이거나 문자열이 아니면 잘못된 payload 로 실패한다(아무에게도 쓰지 않는다)', async () => {
      for (const userId of ['', 42]) {
        const tx = includedTx({ listed: ['p1'] });
        await expect(run(tx, { lineupId: 'lineup-2', userId } as never).done).rejects.toThrow('userId');
        expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
      }
    });

    it('킥오프 2시간 안에 제출하면 킥오프 알림의 키로 써서 뒤이은 킥오프 알림과 한 건으로 합친다', async () => {
      const soon = new Date('2026-08-27T03:30:00Z'); // KST 12:30 — 1시간 30분 뒤
      const tx = includedTx({ listed: ['p1'], startAt: soon });
      await run(tx).done;

      expect(rowsOf(tx).map((row) => row.businessKey)).toEqual([kickoffKey('p1', soon)]);
    });

    it('킥오프 알림을 이미 받은 사람(명단이 다시 열렸다 제출됨)은 건너뛴다', async () => {
      const soon = new Date('2026-08-27T03:30:00Z');
      const tx = includedTx({ listed: ['p1', 'p2'], startAt: soon, existingKeys: [kickoffKey('p2', soon)] });
      await run(tx).done;

      expect(rowsOf(tx).map((row) => row.recipientUserId)).toEqual(['p1']);
    });

    it('밤에는 알림함에만 남기고, 그 밤이 끝나기 전에 시작하는 경기만 푸시한다', async () => {
      jest.setSystemTime(new Date('2026-08-27T14:00:00Z')); // KST 23:00
      const laterTx = includedTx({ listed: ['p1'] }); // 9/1 19:00
      const later = run(laterTx);
      await later.done;
      expect(rowsOf(laterTx)).toHaveLength(1);
      expect(later.webPush.sendToUser).not.toHaveBeenCalled();

      const earlyTx = includedTx({ listed: ['p1'], startAt: new Date('2026-08-27T16:10:00Z') }); // KST 01:10
      const early = run(earlyTx);
      await early.done;
      expect(early.webPush.sendToUser).toHaveBeenCalledWith('p1', expect.objectContaining({ title: '참석명단에 올랐어요' }));
    });

    it('초안이거나 친선 매치가 아니면(리그·대회·취소) 보내지 않는다', async () => {
      const draftTx = includedTx({ listed: ['p1'], lineupState: 'DRAFT' });
      await run(draftTx).done;
      const noMatchTx = includedTx({ listed: ['p1'], matchFound: false });
      await run(noMatchTx).done;

      expect(draftTx.v1Notification.createMany).not.toHaveBeenCalled();
      expect(noMatchTx.v1Notification.createMany).not.toHaveBeenCalled();
      expect(noMatchTx.v1TeamMatch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ leagueId: null, tournamentId: null, status: 'matched' }) }),
      );
    });
  });

  describe('Task 180 L35·H5: 참석명단 미제출 안내 — 밤 경기는 앞당기고, 킥오프가 지나면 한 번 더', () => {
    const NIGHT_KICKOFF = new Date('2026-08-27T16:10:00Z'); // KST 8/28 (금) 01:10
    function scanAt(nowIso: string, todos: LineupTodo[]) {
      jest.setSystemTime(new Date(nowIso));
      const todoService = { listAllPending: jest.fn().mockResolvedValue(todos), listCompetitionRosterChecks: jest.fn().mockResolvedValue([]) };
      const webPush = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      const tx = fakeTx({ memberships: [{ userId: 'manager-1' }] });
      const service = new LineupReminderService(todoService as never, fakePrisma().prisma as never, webPush as never);
      return { tx, webPush, todoService, done: service.scanHandler({ ...fakeClaim(), afterCommit: undefined } as never, tx as never) };
    }
    const rowsTitled = (tx: ReturnType<typeof fakeTx>, title: string) =>
      (tx.v1Notification.createMany.mock.calls.flatMap(([arg]) => arg.data) as Array<Record<string, string>>).filter((row) => row.title === title);
    const FINAL = '곧 경기가 시작돼요 — 참석명단을 확인해 주세요';
    const MISSING = '경기 시간이 됐어요 — 참석명단을 제출해 주세요';

    it('2시간 전 시각이 밤인 경기는 밤이 시작되기 전 마지막 스캔(20:45~21:00)이 킥오프 일시를 붙여 앞당겨 푸시한다', async () => {
      const cutoff = scanAt('2026-08-27T11:50:00Z', [fakeTodo({ scheduledAt: NIGHT_KICKOFF })]); // KST 20:50
      await cutoff.done;
      expect(rowsTitled(cutoff.tx, FINAL)).toEqual([
        expect.objectContaining({ recipientUserId: 'manager-1', body: '8/28 (금) 01:10 팀 매치 참석명단이 아직 비어 있어요.', businessKey: 'lineup-final:game-1:team-1:manager-1' }),
      ]);
      expect(cutoff.webPush.sendToUser).toHaveBeenCalledWith('manager-1', expect.objectContaining({ title: FINAL }));

      const earlier = scanAt('2026-08-27T11:30:00Z', [fakeTodo({ scheduledAt: NIGHT_KICKOFF })]); // KST 20:30 — 아직 마지막 스캔이 아니다
      await earlier.done;
      expect(rowsTitled(earlier.tx, FINAL)).toEqual([]);
    });

    it('밤이 시작된 뒤에 잡힌 경기는 2시간 창에 들면 알림함에만 남기고 푸시하지 않는다', async () => {
      const night = scanAt('2026-08-27T15:15:00Z', [fakeTodo({ scheduledAt: NIGHT_KICKOFF })]); // KST 00:15
      await night.done;

      expect(rowsTitled(night.tx, FINAL)).toHaveLength(1);
      expect(night.webPush.sendToUser).not.toHaveBeenCalled();
      expect(night.todoService.listCompetitionRosterChecks).not.toHaveBeenCalled();
    });

    it('킥오프가 지났는데 미제출이면 30분 안의 스캔이 한 번 알리고(낮은 푸시), 그보다 오래된 경기는 다시 알리지 않는다', async () => {
      const day = scanAt('2026-08-27T10:10:00Z', [
        fakeTodo({ gameId: 'just-started', scheduledAt: new Date('2026-08-27T10:00:00Z') }), // KST 19:00 — 10분 전
        fakeTodo({ gameId: 'long-ago', scheduledAt: new Date('2026-08-27T09:20:00Z') }), // 50분 전
      ]);
      await day.done;

      expect(day.todoService.listAllPending).toHaveBeenCalledWith(new Date('2026-08-27T09:40:00Z'));
      expect(rowsTitled(day.tx, MISSING)).toEqual([
        expect.objectContaining({
          body: '팀 매치 vs 상대팀 · 참석명단을 내야 경기 기록을 시작할 수 있어요.',
          businessKey: `lineup-kickoff-missing:just-started:team-1:${new Date('2026-08-27T10:00:00Z').getTime()}:manager-1`,
          deepLink: '/team-matches/tm-1',
        }),
      ]);
      expect(day.webPush.sendToUser).toHaveBeenCalledWith('manager-1', expect.objectContaining({ title: MISSING }));
      // 킥오프가 지난 경기는 매일 알림 대상이 아니다.
      expect(rowsTitled(day.tx, '팀 매치 참석명단을 확인해 주세요')).toEqual([]);
    });

    // W4-V11: 매칭 직후 09:30 스캔이 같은 경기로 일일 알림과 킥오프 안내를 함께 보냈다.
    const DAILY = '팀 매치 참석명단을 확인해 주세요';
    it('W4-V11: 이 스캔이 킥오프 안내를 내는 경기는 일일 알림을 따로 받지 않고, 먼 경기는 일일 알림을 받는다(대조군)', async () => {
      const scan = scanAt('2026-10-01T00:30:00Z', [ // KST 09:30
        fakeTodo({ gameId: 'soon', scheduledAt: new Date('2026-10-01T01:55:00Z') }), // KST 10:55 — 1시간 25분 뒤
        fakeTodo({ gameId: 'later', scheduledAt: new Date('2026-10-03T01:55:00Z') }),
      ]);
      await scan.done;

      expect(rowsTitled(scan.tx, FINAL).map((row) => row.businessKey)).toEqual(['lineup-final:soon:team-1:manager-1']);
      expect(rowsTitled(scan.tx, DAILY).map((row) => row.businessKey)).toEqual(['lineup-daily:game:later:team-1:2026-10-01:manager-1']);
    });

    it('W4-V11: 킥오프 안내를 이미 받은 경기(키 중복)도, 밤 경기를 앞당겨 알리는 저녁 마지막 스캔도 일일 알림을 더하지 않는다', async () => {
      const again = scanAt('2026-10-01T00:45:00Z', [fakeTodo({ gameId: 'soon', scheduledAt: new Date('2026-10-01T01:55:00Z') })]);
      await again.done;
      expect(rowsTitled(again.tx, DAILY)).toEqual([]);

      const cutoff = scanAt('2026-08-27T11:50:00Z', [fakeTodo({ scheduledAt: NIGHT_KICKOFF })]); // KST 20:50
      await cutoff.done;
      expect(rowsTitled(cutoff.tx, FINAL)).toHaveLength(1);
      expect(rowsTitled(cutoff.tx, DAILY)).toEqual([]);
    });

    it('밤 킥오프의 미제출 안내는 알림함에만 남는다', async () => {
      const night = scanAt('2026-08-27T16:20:00Z', [fakeTodo({ scheduledAt: NIGHT_KICKOFF })]); // KST 01:20
      await night.done;

      expect(rowsTitled(night.tx, MISSING)).toHaveLength(1);
      expect(night.webPush.sendToUser).not.toHaveBeenCalled();
    });
  });
});

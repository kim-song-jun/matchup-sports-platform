import { LineupReminderService } from './lineup-reminder.service';
import type { LineupTodo } from '../../team-lineups/lineup-todo.service';

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

  function fakeTx(
    options: {
      memberships?: Array<{ userId: string }>;
      preferences?: Array<{ userId: string; teamEnabled: boolean }>;
      alreadyDelivered?: string[];
    } = {},
  ) {
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    return {
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue(options.memberships ?? []) },
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
      const todoService = { listAllPending: jest.fn().mockResolvedValue([]) };
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
      const todoService = { listAllPending: jest.fn().mockResolvedValue([fakeTodo()]) };
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
});

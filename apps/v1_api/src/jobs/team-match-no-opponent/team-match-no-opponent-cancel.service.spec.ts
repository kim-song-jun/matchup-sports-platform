import {
  noOpponentCancelVerdict,
  TEAM_MATCH_NO_OPPONENT_SCAN_TYPE,
  TeamMatchNoOpponentCancelService,
} from './team-match-no-opponent-cancel.service';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

function match(overrides: Partial<Parameters<typeof noOpponentCancelVerdict>[0]> = {}) {
  return {
    status: 'recruiting',
    startAt: at(3 * HOUR),
    deadlineAt: at(-HOUR),
    approvedApplicantTeamId: null,
    leagueId: null,
    tournamentId: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('noOpponentCancelVerdict — 상대 없이 끝난 팀매치 판정', () => {
  it('신청 마감이 지났고 대기 신청이 없으면 마감 시각에 끝난 것으로 보고 알린다', () => {
    expect(noOpponentCancelVerdict(match(), 0, NOW)).toEqual({ cancel: true, endedAt: at(-HOUR), notify: true });
  });

  it('마감이 지나도 대기 신청이 있으면 팀장이 승인할 수 있게 시작 전까지 기다린다', () => {
    expect(noOpponentCancelVerdict(match(), 2, NOW)).toEqual({ cancel: false });
  });

  it('대기 신청이 있어도 경기 시작이 지나면 그 시각에 끝난 것으로 본다', () => {
    expect(noOpponentCancelVerdict(match({ startAt: at(-10 * 60 * 1000) }), 1, NOW)).toEqual({
      cancel: true,
      endedAt: at(-10 * 60 * 1000),
      notify: true,
    });
  });

  it('마감 시각이 없으면 경기 시작 시각까지 기다린다', () => {
    expect(noOpponentCancelVerdict(match({ deadlineAt: null }), 0, NOW)).toEqual({ cancel: false });
    expect(noOpponentCancelVerdict(match({ deadlineAt: null, startAt: at(-HOUR) }), 0, NOW).cancel).toBe(true);
  });

  it('직접 마감한 매치도 마감 시각 전에는 다시 열 수 있어 취소하지 않는다', () => {
    expect(noOpponentCancelVerdict(match({ status: 'closed', deadlineAt: at(HOUR) }), 0, NOW)).toEqual({ cancel: false });
    expect(noOpponentCancelVerdict(match({ status: 'closed' }), 0, NOW).cancel).toBe(true);
  });

  it('24시간보다 오래전에 끝난 매치는 취소만 하고 알리지 않는다 (배포 전에 쌓인 매치)', () => {
    expect(noOpponentCancelVerdict(match({ deadlineAt: at(-25 * HOUR), startAt: at(-24 * HOUR) }), 0, NOW)).toEqual({
      cancel: true,
      endedAt: at(-25 * HOUR),
      notify: false,
    });
  });

  it('마감이 24시간보다 오래전이어도 경기 전이면 알린다 (배포 직후 쌓인 매치 중 아직 열리지 않은 경기)', () => {
    expect(noOpponentCancelVerdict(match({ deadlineAt: at(-25 * HOUR), startAt: at(3 * HOUR) }), 0, NOW)).toEqual({
      cancel: true,
      endedAt: at(-25 * HOUR),
      notify: true,
    });
  });

  it.each([
    ['상대가 정해진 매치', { approvedApplicantTeamId: 'team-b', status: 'matched' }],
    ['리그 대진', { leagueId: 'league-1' }],
    ['대회 대진', { tournamentId: 'cup-1' }],
    ['이미 취소된 매치', { status: 'cancelled' }],
    ['삭제된 매치', { deletedAt: at(-HOUR) }],
  ])('%s 은 대상이 아니다', (_, overrides) => {
    expect(noOpponentCancelVerdict(match(overrides), 0, NOW)).toEqual({ cancel: false });
  });
});

describe('TeamMatchNoOpponentCancelService.scanHandler', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  function build(row: Record<string, unknown>, pending: Array<{ applicantTeamId: string }>) {
    const tx = {
      $queryRaw: jest.fn(async () => []),
      $executeRaw: jest.fn(async () => 1),
      v1TeamMatch: {
        findMany: jest.fn(async () => [{ id: 'tm-1' }]),
        findUnique: jest.fn(async () => ({ title: '토요일 친선', hostTeamId: 'team-host', ...match(), ...row })),
        update: jest.fn(async () => ({})),
      },
      v1TeamMatchApplication: { findMany: jest.fn(async () => pending), updateMany: jest.fn(async () => ({ count: pending.length })) },
      v1TeamSchedule: { findMany: jest.fn(async () => [{ id: 'schedule-1' }]) },
      v1Game: { updateMany: jest.fn(async () => ({ count: 1 })) },
      v1StatusChangeLog: { create: jest.fn(async () => ({})) },
      v1TeamMembership: {
        findMany: jest.fn(async ({ where }: { where: { teamId: { in: string[] } } }) =>
          where.teamId.in.map((teamId) => ({ userId: `${teamId}-manager` }))),
      },
      v1NotificationPreference: { findMany: jest.fn(async () => []) },
      v1Notification: { findMany: jest.fn(async () => []), createMany: jest.fn(async () => ({ count: 0 })) },
    };
    const scheduleTx = { v1OutboxEvent: { createMany: jest.fn(async () => ({ count: 1 })) } };
    const prisma = { $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(scheduleTx)) };
    const service = new TeamMatchNoOpponentCancelService(prisma as never);
    const run = () => service.scanHandler({ afterCommit: [] } as never, tx as never);
    return { tx, scheduleTx, run };
  }

  it('1팀 매치는 취소하고, 그 팀과 대기 신청 팀 팀장·매니저에게 알린다 — 행은 지우지 않는다', async () => {
    const { tx, scheduleTx, run } = build({ startAt: at(-HOUR) }, [{ applicantTeamId: 'team-applicant' }]);

    await run();

    expect(scheduleTx.v1OutboxEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ type: TEAM_MATCH_NO_OPPONENT_SCAN_TYPE })] }),
    );
    expect(tx.v1TeamMatch.update).toHaveBeenCalledWith({ where: { id: 'tm-1' }, data: { status: 'cancelled', cancelledAt: NOW } });
    expect(tx.v1TeamMatchApplication.updateMany).toHaveBeenCalledWith({
      where: { teamMatchId: 'tm-1', status: 'requested' },
      data: { status: 'expired', reviewedAt: NOW },
    });
    expect(tx.v1Game.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teamMatchId: 'tm-1', state: 'SCHEDULED' } }));
    expect(tx.v1StatusChangeLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toStatus: 'cancelled', actorType: 'system', reason: 'no_opponent_auto_cancelled' }),
    });
    const rows = (tx.v1Notification.createMany.mock.calls[0] as unknown as [{ data: Array<{ recipientUserId: string; body: string; deepLink: string }> }])[0].data;
    expect(rows).toEqual([
      expect.objectContaining({ recipientUserId: 'team-host-manager', body: '상대 팀이 정해지지 않아 "토요일 친선" 팀매치가 취소됐어요.', deepLink: '/team-matches' }),
      expect.objectContaining({ recipientUserId: 'team-applicant-manager', body: '"토요일 친선" 팀매치가 취소되어 대기 중이던 신청이 종료됐어요.' }),
    ]);
  });

  it('0팀(승인된 팀이 없는 플랫폼 주관 매치)은 취소만 하고 알리지 않는다', async () => {
    const { tx, run } = build({ hostTeamId: null }, []);

    await run();

    expect(tx.v1TeamMatch.update).toHaveBeenCalled();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('오래전에 끝난 매치는 알리지 않는다', async () => {
    const { tx, run } = build({ deadlineAt: at(-30 * HOUR), startAt: at(-26 * HOUR) }, []);

    await run();

    expect(tx.v1TeamMatch.update).toHaveBeenCalled();
    expect(tx.v1Notification.createMany).not.toHaveBeenCalled();
  });

  it('잠근 뒤 다시 보니 상대가 정해졌으면(승인과 겹침) 아무것도 바꾸지 않는다', async () => {
    const { tx, run } = build({ approvedApplicantTeamId: 'team-b', status: 'matched' }, []);

    await run();

    expect(tx.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(tx.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });
});

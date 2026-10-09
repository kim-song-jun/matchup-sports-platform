import type { Prisma } from '@prisma/client';
import {
  COMPETITION_ROSTER_RESYNC_TYPE,
  competitionTeamTargets,
  completeQueuedDuplicates,
  enqueueRosterResync,
  parseRosterResyncTarget,
} from './roster-resync-events';

function fakeTx() {
  const executeRaw = jest.fn(async (..._args: unknown[]) => 1);
  return { tx: { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient, executeRaw };
}

/** `$executeRaw` 값 순서: id, business_key, aggregate_type, aggregate_id, type, payload. */
function inserted(executeRaw: jest.Mock) {
  return executeRaw.mock.calls.map((call: unknown[]) => ({
    businessKey: call[2],
    aggregate: `${String(call[3])}:${String(call[4])}`,
    type: call[5],
    payload: JSON.parse(String(call[6])),
  }));
}

describe('enqueueRosterResync', () => {
  it('대상마다 한 행을 남기고, 같은 호출 안의 같은 대상은 한 번만 남긴다', async () => {
    const { tx, executeRaw } = fakeTx();
    await enqueueRosterResync(tx, [
      ...competitionTeamTargets('league-1', ['team-a', null, 'team-b', 'team-a', undefined]),
      { scope: 'game', gameId: 'game-1' },
    ]);
    const rows = inserted(executeRaw);
    expect(rows.map((row) => row.payload)).toEqual([
      { scope: 'competitionTeam', competitionId: 'league-1', teamId: 'team-a' },
      { scope: 'competitionTeam', competitionId: 'league-1', teamId: 'team-b' },
      { scope: 'game', gameId: 'game-1' },
    ]);
    expect(rows.map((row) => row.aggregate)).toEqual(['TEAM:team-a', 'TEAM:team-b', 'GAME:game-1']);
    expect(rows.every((row) => row.type === COMPETITION_ROSTER_RESYNC_TYPE)).toBe(true);
    // 연속 이벤트가 서로를 덮지 않게 업무 키는 매번 새로 만든다(중복 처리는 워커가 한다).
    expect(new Set(rows.map((row) => row.businessKey)).size).toBe(3);
  });

  it('대상이 없으면 아무것도 쓰지 않는다', async () => {
    const { tx, executeRaw } = fakeTx();
    await enqueueRosterResync(tx, competitionTeamTargets('league-1', [null]));
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('고정 업무 키는 대상 하나에만 쓴다 — 둘 이상이면 뒤 대상이 조용히 사라진다', async () => {
    const { tx, executeRaw } = fakeTx();
    await expect(
      enqueueRosterResync(tx, competitionTeamTargets('league-1', ['team-a', 'team-b']), { businessKey: 'k' }),
    ).rejects.toThrow('exactly one target');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});

describe('parseRosterResyncTarget', () => {
  it.each([
    [{ scope: 'competitionTeam', competitionId: 'c', teamId: 't' }],
    [{ scope: 'teamMembers', teamId: 't' }],
    [{ scope: 'teamPeriod', teamId: 't', startsAt: '2099-01-01T00:00:00.000Z', endsAt: '2099-01-02T00:00:00.000Z' }],
    [{ scope: 'game', gameId: 'g' }],
    [{ scope: 'result', gameId: 'g' }],
    [{ scope: 'startedGameSide', gameId: 'g', sideId: 's' }],
  ])('%j 를 그대로 읽는다', (payload) => {
    expect(parseRosterResyncTarget(payload)).toEqual(payload);
  });

  it.each([[{}], [null], [{ scope: 'teamMembers' }], [{ scope: 'game', gameId: '' }], [{ scope: 'unknown', teamId: 't' }], [{ scope: 'startedGameSide', gameId: 'g' }]])(
    '%j 는 던진다',
    (payload) => {
      expect(() => parseRosterResyncTarget(payload)).toThrow(`Invalid ${COMPETITION_ROSTER_RESYNC_TYPE} payload`);
    },
  );
});

describe('completeQueuedDuplicates', () => {
  it('같은 대상의 대기 행만 닫는다 — 자기 행 제외, 다른 워커가 잡은 행은 기다리지 않고 건너뛴다', async () => {
    const { tx, executeRaw } = fakeTx();
    await completeQueuedDuplicates(tx, { id: 'event-1', payload: { scope: 'teamMembers', teamId: 'team-a' } });
    const [strings, ...values] = executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(sql).toContain("status IN ('PENDING', 'RETRY')");
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('id <> ?');
    expect(values).toEqual([
      COMPETITION_ROSTER_RESYNC_TYPE,
      'TEAM',
      'team-a',
      JSON.stringify({ scope: 'teamMembers', teamId: 'team-a' }),
      'event-1',
    ]);
  });
});

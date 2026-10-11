import { Prisma } from '@prisma/client';
import {
  assertLeagueFixtureGenerationAllowedInTx,
  assertLeagueNotEndedInTx,
  assertLeagueNotEndedUnderShareLockInTx,
} from './league-fixture-generation-guard';

function txWithStatus(status: string | null): Prisma.TransactionClient {
  return {
    v1Tournament: {
      findFirst: async () => (status === null ? null : { status }),
    },
  } as unknown as Prisma.TransactionClient;
}

async function codeOf(status: string | null): Promise<string | null> {
  try {
    await assertLeagueFixtureGenerationAllowedInTx(txWithStatus(status), 'league-1');
    return null;
  } catch (err) {
    return (err as { getResponse: () => { code: string } }).getResponse().code;
  }
}

describe('assertLeagueFixtureGenerationAllowedInTx', () => {
  it.each(['completed', 'cancelled'])('%s 리그는 LEAGUE_ENDED 로 거부한다', async (status) => {
    expect(await codeOf(status)).toBe('LEAGUE_ENDED');
  });

  it('보류 리그는 기존대로 LEAGUE_ON_HOLD', async () => {
    expect(await codeOf('on_hold')).toBe('LEAGUE_ON_HOLD');
  });

  it.each(['draft', 'open', 'closed', 'in_progress'])('%s 리그는 통과한다', async (status) => {
    expect(await codeOf(status)).toBeNull();
  });

  it('없는 리그는 LEAGUE_NOT_FOUND', async () => {
    expect(await codeOf(null)).toBe('LEAGUE_NOT_FOUND');
  });
});

describe('assertLeagueNotEndedInTx', () => {
  async function endedCodeOf(status: string | null): Promise<string | null> {
    try {
      await assertLeagueNotEndedInTx(txWithStatus(status), 'league-1');
      return null;
    } catch (err) {
      return (err as { getResponse: () => { code: string } }).getResponse().code;
    }
  }

  it.each(['completed', 'cancelled'])('%s 리그는 LEAGUE_ENDED 로 거부한다', async (status) => {
    expect(await endedCodeOf(status)).toBe('LEAGUE_ENDED');
  });

  // 대조군: 일괄 생성 가드는 on_hold 를 막지만 이 가드는 막지 않는다.
  it.each(['draft', 'open', 'closed', 'in_progress', 'on_hold'])('%s 리그는 통과한다', async (status) => {
    expect(await endedCodeOf(status)).toBeNull();
  });

  it('없는 리그는 LEAGUE_NOT_FOUND', async () => {
    expect(await endedCodeOf(null)).toBe('LEAGUE_NOT_FOUND');
  });
});

describe('assertLeagueNotEndedUnderShareLockInTx', () => {
  function txWith(status: string, lock: () => Promise<unknown>) {
    const sql: string[] = [];
    const tx = {
      $queryRaw: async (strings: TemplateStringsArray) => { sql.push(strings.join('?')); return lock(); },
      v1Tournament: { findFirst: async () => ({ status }) },
    } as unknown as Prisma.TransactionClient;
    return { tx, sql };
  }
  const nowaitContention = () => Promise.reject(new Prisma.PrismaClientKnownRequestError('could not obtain lock on row', {
    code: 'P2010', clientVersion: Prisma.prismaVersion.client, meta: { code: '55P03' },
  }));
  const codeOf = (promise: Promise<void>) =>
    promise.then(() => null, (err) => (err as { getResponse?: () => { code: string } }).getResponse?.().code ?? 'RETHROWN');

  it('리그 행을 기다리지 않는 공유 잠금으로 잡은 뒤 끝남을 본다', async () => {
    const { tx, sql } = txWith('completed', async () => []);
    expect(await codeOf(assertLeagueNotEndedUnderShareLockInTx(tx, 'league-1'))).toBe('LEAGUE_ENDED');
    expect(sql).toHaveLength(1);
    expect(sql[0]).toMatch(/v1_tournaments.*FOR SHARE NOWAIT/s);
  });

  it('잠금을 못 얻으면(55P03) 재시도 가능한 COMMAND_CONCURRENCY_CONFLICT', async () => {
    const { tx } = txWith('in_progress', nowaitContention);
    expect(await codeOf(assertLeagueNotEndedUnderShareLockInTx(tx, 'league-1'))).toBe('COMMAND_CONCURRENCY_CONFLICT');
  });

  it('다른 DB 오류는 그대로 던진다', async () => {
    const { tx } = txWith('in_progress', () => Promise.reject(new Error('connection reset')));
    expect(await codeOf(assertLeagueNotEndedUnderShareLockInTx(tx, 'league-1'))).toBe('RETHROWN');
  });

  it.each(['in_progress', 'on_hold'])('%s 리그는 통과한다', async (status) => {
    const { tx } = txWith(status, async () => []);
    expect(await codeOf(assertLeagueNotEndedUnderShareLockInTx(tx, 'league-1'))).toBeNull();
  });
});

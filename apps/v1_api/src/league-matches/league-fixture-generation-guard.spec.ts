import type { Prisma } from '@prisma/client';
import { assertLeagueFixtureGenerationAllowedInTx, assertLeagueNotEndedInTx } from './league-fixture-generation-guard';

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

import type { Prisma } from '@prisma/client';
import { fillLeagueTeamRoster, notifyLeagueRosterFillOutcomes } from '../../league-matches/league-roster-autofill';
import {
  handleCompetitionRosterResync,
  syncCompetitionTeamRosters,
  syncGameSideRoster,
  syncTeamMemberFallbackRosters,
  syncTeamRostersWithinPeriod,
} from './game-roster-sync';

jest.mock('../../league-matches/league-roster-autofill', () => ({
  fillLeagueTeamRoster: jest.fn(async (_tx: unknown, _leagueId: string, registration: { id: string; teamId: string }) => ({
    kind: 'filled',
    registrationId: registration.id,
    teamId: registration.teamId,
    added: 1,
    skipped: [],
  })),
  notifyLeagueRosterFillOutcomes: jest.fn(),
}));

interface UpcomingWhere {
  sides: { some: { teamId: string } };
  teamMatch: { AND: [{ OR: Array<{ leagueId?: unknown }> }] };
}

const LEAGUE_MATCH = { id: 'lm-1', tournamentId: 'league-1', leagueId: 'league-1', startAt: new Date('2099-01-01T00:00:00Z') };

interface Options {
  /** 잠금을 기다리는 사이 커밋된 경기 시작을 흉내 낸다 — 잠근 뒤 읽으면 이 상태가 보인다. */
  readonly stateAfterLock?: string;
  readonly emptyRegistrations?: Array<{ id: string; teamId: string }>;
  readonly upcomingByTeam?: Record<string, string[]>;
  /** 경기 → 리그 id(대회 경기는 null). 없으면 전부 league-1. */
  readonly leagueOfGame?: Record<string, string | null>;
  /** 활성 선수가 있는 확정 참가 명단을 가진 리그. */
  readonly leaguesWithRoster?: string[];
  /** 결장 기간 안 팀 매치의 리그 id. */
  readonly periodLeagueIds?: string[];
}

/**
 * 잠금(`$queryRaw ... FOR UPDATE`)과 그 뒤 호출 순서를 기록하는 fake. 기준 명단은 비어 있어(팀 없음)
 * 계산은 null 로 끝난다 — 이 스펙은 명단 계산이 아니라 잠금·자동 채움의 위치만 본다.
 */
function fakeTx(options: Options = {}) {
  const calls: string[] = [];
  const locked = new Set<string>();
  const tx = {
    // 같은 대상의 대기 이벤트 닫기(completeQueuedDuplicates).
    $executeRaw: jest.fn(async () => {
      calls.push('complete-duplicates');
      return 0;
    }),
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, gameId: string) => {
      calls.push(`lock:${gameId}`);
      locked.add(gameId);
      return [];
    }),
    v1Game: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        calls.push(`read-state:${where.id}`);
        return {
          id: where.id,
          state: locked.has(where.id) ? (options.stateAfterLock ?? 'SCHEDULED') : 'SCHEDULED',
          teamMatch: LEAGUE_MATCH,
          sides: [{ id: 'side-1', teamId: 'team-A' }],
        };
      }),
      findMany: jest.fn(async ({ where }: { where: UpcomingWhere & { OR?: UpcomingWhere[] } }) => {
        const byTeam = options.upcomingByTeam ?? {};
        const leagueOf = (id: string) => (options.leagueOfGame ? (options.leagueOfGame[id] ?? null) : 'league-1');
        const ids = (where.OR ?? [where]).flatMap((row) => {
          const competitionId = row.teamMatch.AND[0].OR[0].leagueId;
          return (byTeam[row.sides.some.teamId] ?? []).filter(
            (id) => typeof competitionId !== 'string' || leagueOf(id) === competitionId,
          );
        });
        return [...new Set(ids)].map((id) => ({ id, teamMatch: { leagueId: leagueOf(id) }, sides: [{ id: `side-${id}` }] }));
      }),
    },
    v1TournamentRegistration: {
      findMany: jest.fn(async ({ where }: { where: { tournamentId: unknown; players?: { none?: object; some?: object } } }) => {
        if (where.players?.some !== undefined) {
          const asked = (where.tournamentId as { in: string[] }).in;
          return (options.leaguesWithRoster ?? []).filter((id) => asked.includes(id)).map((id) => ({ tournamentId: id }));
        }
        if (where.players?.none === undefined) return [];
        calls.push('fill-query');
        return options.emptyRegistrations ?? [];
      }),
    },
    v1TeamMatch: {
      findMany: jest.fn(async () => (options.periodLeagueIds ?? []).map((leagueId) => ({ leagueId, tournamentId: leagueId }))),
    },
    v1Tournament: { findFirst: jest.fn(async () => ({ title: '가을 리그' })) },
    v1Team: { findMany: jest.fn(async () => []) },
    v1GameSide: { findMany: jest.fn(async () => [{ id: 'side-1' }]) },
    v1GameLineup: { findFirst: jest.fn(), create: jest.fn() },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls, raw: tx };
}

beforeEach(() => jest.clearAllMocks());

describe('syncGameSideRoster — 경기 행 잠금', () => {
  it('잠근 뒤 상태를 읽는다 — 잠금을 기다리는 사이 시작된 경기에는 쓰지 않는다', async () => {
    const { tx, calls, raw } = fakeTx({ stateAfterLock: 'LIVE' });
    await expect(syncGameSideRoster(tx, { gameId: 'g1', sideId: 'side-1' })).resolves.toBe(false);
    expect(calls.indexOf('lock:g1')).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf('lock:g1')).toBeLessThan(calls.indexOf('read-state:g1'));
    expect(raw.v1GameLineup.create).not.toHaveBeenCalled();
    expect(fillLeagueTeamRoster).not.toHaveBeenCalled();
  });

  it('쓰기 경로라 명단 행 없는 리그 확정 신청은 잠근 뒤 채우고 팀장에게 알린다', async () => {
    const { tx, calls } = fakeTx({ emptyRegistrations: [{ id: 'reg-1', teamId: 'team-A' }] });
    await syncGameSideRoster(tx, { gameId: 'g1', sideId: 'side-1' });
    expect(fillLeagueTeamRoster).toHaveBeenCalledWith(tx, 'league-1', { id: 'reg-1', teamId: 'team-A' });
    expect(notifyLeagueRosterFillOutcomes).toHaveBeenCalledTimes(1);
    expect(calls.indexOf('lock:g1')).toBeLessThan(calls.indexOf('fill-query'));
  });
});

describe('syncTeamMemberFallbackRosters — 멤버십 변경 뒤 폴백 리그 재계산', () => {
  it('참가 명단 없이 팀원 기준으로 뛰는 리그 경기만 잠그고 다시 계산한다', async () => {
    const { tx, calls } = fakeTx({
      upcomingByTeam: { 'team-A': ['g1', 'g2', 'g3'] },
      leagueOfGame: { g1: 'league-registered', g2: 'league-fallback', g3: null },
      leaguesWithRoster: ['league-registered'],
    });
    await syncTeamMemberFallbackRosters(tx, ['team-A']);
    // 참가 명단이 있는 리그(g1)와 대회 경기(g3)는 명단 정리 경로 몫이다.
    expect(new Set(calls.filter((call) => call.startsWith('lock:')))).toEqual(new Set(['lock:g2']));
    expect(calls).toContain('fill-query');
  });

  it('시작 전 리그 경기가 없으면 아무것도 잠그지 않는다', async () => {
    const { tx, calls } = fakeTx({ upcomingByTeam: {} });
    await expect(syncTeamMemberFallbackRosters(tx, ['team-A'])).resolves.toBe(0);
    expect(calls).toEqual([]);
  });
});

describe('여러 경기 재계산 — 대상 경기를 처음 한 번 id 순으로 잡고 그 밖은 잡지 않는다', () => {
  it('잠그기 전 조회와 잠근 뒤 조회 사이에 끼어든 경기는 잠그지 않고 409 로 끝낸다(재시도 가능)', async () => {
    const { tx, calls, raw } = fakeTx({ upcomingByTeam: { 'team-A': ['g2'] } });
    // 잠근 뒤 다시 읽을 때 다른 트랜잭션이 커밋한 g1(더 작은 id)이 보인다.
    raw.v1Game.findMany.mockImplementationOnce(async () => [{ id: 'g2', teamMatch: { leagueId: 'league-1' }, sides: [] }]);
    raw.v1Game.findMany.mockImplementationOnce(async () => [
      { id: 'g1', teamMatch: { leagueId: 'league-1' }, sides: [{ id: 'side-g1' }] },
      { id: 'g2', teamMatch: { leagueId: 'league-1' }, sides: [{ id: 'side-g2' }] },
    ]);
    await expect(syncCompetitionTeamRosters(tx, { competitionId: 'league-1', teamId: 'team-A' })).rejects.toMatchObject({
      response: { code: 'COMMAND_CONCURRENCY_CONFLICT', details: { gameIds: ['g1'] } },
    });
    expect(calls.filter((call) => call.startsWith('lock:'))).toEqual(['lock:g2']);
  });

  it('결장 기간이 여러 리그에 걸쳐도 전부 한 번에 id 순으로 잠그고, 그 뒤에는 새로 잡지 않는다', async () => {
    const { tx, calls } = fakeTx({
      upcomingByTeam: { 'team-A': ['g3', 'g1', 'g2'] },
      leagueOfGame: { g1: 'league-2', g2: 'league-1', g3: 'league-1' },
      periodLeagueIds: ['league-1', 'league-2'],
    });
    await syncTeamRostersWithinPeriod(tx, {
      teamId: 'team-A',
      startsAt: new Date('2099-01-01T00:00:00Z'),
      endsAt: new Date('2099-02-01T00:00:00Z'),
    });
    expect(calls.filter((call) => call.startsWith('lock:'))).toEqual(['lock:g1', 'lock:g2', 'lock:g3']);
    expect(calls.lastIndexOf('lock:g3')).toBeLessThan(calls.indexOf('fill-query'));
  });
});

describe('handleCompetitionRosterResync — 후속 이벤트 워커 핸들러', () => {
  it('같은 대상의 대기 이벤트를 먼저 닫고, 팀의 시작 전 경기를 id 순으로 잠근 뒤 다시 계산한다', async () => {
    const { tx, calls } = fakeTx({ upcomingByTeam: { 'team-A': ['g3', 'g1'] } });
    await handleCompetitionRosterResync(tx, {
      id: 'event-1',
      payload: { scope: 'competitionTeam', competitionId: 'league-1', teamId: 'team-A' },
    });
    expect(calls[0]).toBe('complete-duplicates');
    const locks = calls.filter((call) => call.startsWith('lock:'));
    expect(locks.slice(0, 2)).toEqual(['lock:g1', 'lock:g3']);
    expect(new Set(locks)).toEqual(new Set(['lock:g1', 'lock:g3']));
    expect(calls.indexOf('lock:g3')).toBeLessThan(calls.indexOf('fill-query'));
  });

  it('경기 대상: 그 경기를 잠근 뒤 판정해 그 사이 시작된 경기에는 쓰지 않는다', async () => {
    const { tx, calls, raw } = fakeTx({ stateAfterLock: 'LIVE' });
    await expect(handleCompetitionRosterResync(tx, { id: 'event-1', payload: { scope: 'game', gameId: 'g1' } })).resolves.toBe(0);
    expect(calls.indexOf('lock:g1')).toBeLessThan(calls.indexOf('read-state:g1'));
    expect(raw.v1GameLineup.create).not.toHaveBeenCalled();
  });

  it('모양이 다른 payload 는 던진다 — 재시도 끝에 POISONED 로 드러난다', async () => {
    const { tx, calls } = fakeTx();
    await expect(handleCompetitionRosterResync(tx, { id: 'event-1', payload: { scope: 'competitionTeam' } })).rejects.toThrow(
      'Invalid COMPETITION_ROSTER_RESYNC payload',
    );
    expect(calls).toEqual([]);
  });
});

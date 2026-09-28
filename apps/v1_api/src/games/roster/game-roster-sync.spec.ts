import type { Prisma } from '@prisma/client';
import { fillLeagueTeamRoster, notifyLeagueRosterFillOutcomes } from '../../league-matches/league-roster-autofill';
import { syncGameSideRoster, syncRostersForTeamMatchTeams } from './game-roster-sync';

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

const LEAGUE_MATCH = { id: 'lm-1', tournamentId: 'league-1', leagueId: 'league-1', startAt: new Date('2099-01-01T00:00:00Z') };

interface Options {
  /** 잠금을 기다리는 사이 커밋된 경기 시작을 흉내 낸다 — 잠근 뒤 읽으면 이 상태가 보인다. */
  readonly stateAfterLock?: string;
  readonly emptyRegistrations?: Array<{ id: string; teamId: string }>;
  readonly upcomingByTeam?: Record<string, string[]>;
}

/**
 * 잠금(`$queryRaw ... FOR UPDATE`)과 그 뒤 호출 순서를 기록하는 fake. 기준 명단은 비어 있어(팀 없음)
 * 계산은 null 로 끝난다 — 이 스펙은 명단 계산이 아니라 잠금·자동 채움의 위치만 본다.
 */
function fakeTx(options: Options = {}) {
  const calls: string[] = [];
  const locked = new Set<string>();
  const tx = {
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
      findMany: jest.fn(async ({ where }: { where: { OR?: Array<{ sides: { some: { teamId: string } } }>; sides?: { some: { teamId: string } } } }) => {
        const byTeam = options.upcomingByTeam ?? {};
        const teamIds = where.OR ? where.OR.map((row) => row.sides.some.teamId) : [where.sides!.some.teamId];
        const ids = [...new Set(teamIds.flatMap((teamId) => byTeam[teamId] ?? []))];
        return ids.map((id) => ({ id, teamMatch: { leagueId: 'league-1' }, sides: [{ id: `side-${id}` }] }));
      }),
    },
    v1TournamentRegistration: {
      findMany: jest.fn(async ({ where }: { where: { players?: { none: object } } }) => {
        if (where.players?.none === undefined) return [];
        calls.push('fill-query');
        return options.emptyRegistrations ?? [];
      }),
    },
    v1Tournament: { findFirst: jest.fn(async () => ({ title: '가을 리그' })) },
    v1Team: { findMany: jest.fn(async () => []) },
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

describe('syncRostersForTeamMatchTeams — 여러 팀의 잠금 순서', () => {
  it('두 팀의 시작 전 경기를 먼저 id 순으로 전부 잠근다(교착 방지)', async () => {
    const { tx, calls } = fakeTx({ upcomingByTeam: { 'team-A': ['g3', 'g1'], 'team-B': ['g2', 'g3'] } });
    await syncRostersForTeamMatchTeams(tx, { competitionId: 'league-1', teamIds: ['team-A', 'team-B', null] });
    const locks = calls.filter((call) => call.startsWith('lock:'));
    expect(locks.slice(0, 3)).toEqual(['lock:g1', 'lock:g2', 'lock:g3']);
    // 팀별 동기화가 다시 잡는 행은 이미 쥔 행뿐이다.
    expect(new Set(locks)).toEqual(new Set(['lock:g1', 'lock:g2', 'lock:g3']));
    expect(calls.indexOf('lock:g3')).toBeLessThan(calls.indexOf('fill-query'));
  });
});

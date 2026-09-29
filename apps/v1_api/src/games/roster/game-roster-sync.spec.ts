import type { Prisma } from '@prisma/client';
import { fillLeagueTeamRoster } from '../../league-matches/league-roster-autofill';
import {
  carryArrivals,
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

interface FakeGame {
  readonly id: string;
  /** null 이면 대회 경기. */
  readonly leagueId: string | null;
  readonly tournamentId: string | null;
  readonly teamIds: readonly string[];
}

interface Options {
  readonly games?: readonly FakeGame[];
  /** 잠금을 기다리는 사이 커밋된 경기 시작을 흉내 낸다 — 잠근 뒤 읽으면 이 상태가 보인다. */
  readonly stateAfterLock?: string;
  /** 리그 → 명단 행 없는 확정 신청. */
  readonly emptyRegistrations?: Record<string, Array<{ id: string; teamId: string }>>;
  /** 활성 선수가 있는 확정 참가 명단을 가진 리그. */
  readonly leaguesWithRoster?: readonly string[];
  /** 시작 전 경기 조회가 차례로 돌려줄 경기 id(없으면 `games` 에서 계산). */
  readonly upcomingSequence?: ReadonlyArray<readonly string[]>;
}

const sideId = (gameId: string, teamId: string) => `side-${gameId}-${teamId}`;
const LEAGUE_GAME: FakeGame = { id: 'g1', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-A', 'team-B'] };

interface UpcomingWhere {
  sides: { some: { teamId: string } };
  teamMatch: { AND: [{ OR: Array<{ leagueId?: unknown; tournamentId?: unknown }> }] };
}

/**
 * 잠금(`$queryRaw`)·빈 리그 명단 채우기·상태 읽기의 순서를 기록하는 fake. 기준 명단은 비어 있어(팀 없음)
 * 계산은 null 로 끝난다 — 이 스펙은 명단 계산이 아니라 잠금 순서만 본다.
 */
function fakeTx(options: Options = {}) {
  const games = options.games ?? [LEAGUE_GAME];
  const gameById = new Map(games.map((game) => [game.id, game]));
  const upcoming = [...(options.upcomingSequence ?? [])];
  const calls: string[] = [];
  const locked = new Set<string>();
  const row = (game: FakeGame, teamId?: string) => ({
    id: game.id,
    teamMatch: { tournamentId: game.tournamentId, leagueId: game.leagueId },
    sides: game.teamIds.filter((id) => teamId === undefined || id === teamId).map((id) => ({ id: sideId(game.id, id), teamId: id })),
  });
  const upcomingRows = (where: UpcomingWhere) => {
    const teamId = where.sides.some.teamId;
    const competitionId = where.teamMatch.AND[0].OR[0].leagueId;
    const ids =
      upcoming.shift() ??
      games
        .filter((game) => game.teamIds.includes(teamId))
        .filter((game) => typeof competitionId !== 'string' || (game.leagueId ?? game.tournamentId) === competitionId)
        .map((game) => game.id);
    return ids.map((id) => row(gameById.get(id) ?? { ...LEAGUE_GAME, id }, teamId));
  };
  const tx = {
    // 같은 대상의 대기 이벤트 닫기(completeQueuedDuplicates).
    $executeRaw: jest.fn(async () => {
      calls.push('complete-duplicates');
      return 0;
    }),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, id: string) => {
      const sql = strings.join('?');
      if (sql.includes('v1_tournaments')) calls.push(`competition:${id}`);
      else if (sql.includes('v1_games')) {
        calls.push(`lock:${id}`);
        locked.add(id);
      } else calls.push(`raw:${sql}`);
      return [];
    }),
    v1Game: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        calls.push(`read-state:${where.id}`);
        const game = gameById.get(where.id) ?? { ...LEAGUE_GAME, id: where.id };
        return {
          id: game.id,
          state: locked.has(game.id) ? (options.stateAfterLock ?? 'SCHEDULED') : 'SCHEDULED',
          teamMatch: { id: `tm-${game.id}`, tournamentId: game.tournamentId, leagueId: game.leagueId, startAt: new Date('2099-01-01T00:00:00Z') },
          sides: game.teamIds.map((teamId) => ({ id: sideId(game.id, teamId), teamId })),
        };
      }),
      findMany: jest.fn(
        async ({
          where,
          select,
        }: {
          where: { id?: { in: string[] }; AND?: [UpcomingWhere] } & Partial<UpcomingWhere>;
          select?: { sides?: { where?: { id?: { in: string[] } } } };
        }) => {
        if (where.id !== undefined) {
          const onlySides = select?.sides?.where?.id?.in;
          return where.id.in.flatMap((id) => {
            if (!gameById.has(id)) return [];
            const found = row(gameById.get(id)!);
            return [{ ...found, sides: found.sides.filter((side) => onlySides === undefined || onlySides.includes(side.id)) }];
          });
        }
        return upcomingRows(where.AND !== undefined ? where.AND[0] : (where as UpcomingWhere));
        },
      ),
    },
    v1GameSide: {
      findMany: jest.fn(async ({ where }: { where: { gameId: string } }) =>
        row(gameById.get(where.gameId) ?? { ...LEAGUE_GAME, id: where.gameId }).sides,
      ),
    },
    v1TournamentRegistration: {
      findMany: jest.fn(
        async ({ where }: { where: { tournamentId: unknown; teamId?: { in: string[] }; players?: { none?: object; some?: object } } }) => {
          if (where.players?.some !== undefined) {
            const asked = (where.tournamentId as { in: string[] }).in;
            return (options.leaguesWithRoster ?? []).filter((id) => asked.includes(id)).map((id) => ({ tournamentId: id }));
          }
          if (where.players?.none === undefined) return [];
          const leagueId = where.tournamentId as string;
          calls.push(`fill-query:${leagueId}:${where.teamId!.in.join(',')}`);
          return (options.emptyRegistrations?.[leagueId] ?? []).filter((reg) => where.teamId!.in.includes(reg.teamId));
        },
      ),
      findFirst: jest.fn(async () => null),
    },
    v1Tournament: { findFirst: jest.fn(async () => ({ title: '가을 리그' })) },
    v1Team: { findMany: jest.fn(async () => []) },
    v1GameLineup: { findFirst: jest.fn(), create: jest.fn() },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls, raw: tx };
}

const firstIndex = (calls: readonly string[], prefix: string) => calls.findIndex((call) => call.startsWith(prefix));
const lastIndex = (calls: readonly string[], prefix: string) =>
  calls.reduce((last, call, index) => (call.startsWith(prefix) ? index : last), -1);

beforeEach(() => jest.clearAllMocks());

describe('명단 쓰기 잠금 순서 — 대회 행(KEY SHARE) → 빈 리그 명단 채우기 → 경기(id 순)', () => {
  it('한 사이드: 그 팀 신청만 채운 뒤 경기를 잠그고, 잠근 뒤 읽은 상태로 시작된 경기에는 쓰지 않는다', async () => {
    const { tx, calls, raw } = fakeTx({
      stateAfterLock: 'LIVE',
      emptyRegistrations: { 'league-1': [{ id: 'reg-A', teamId: 'team-A' }, { id: 'reg-B', teamId: 'team-B' }] },
    });
    await expect(syncGameSideRoster(tx, { gameId: 'g1', sideId: sideId('g1', 'team-A') })).resolves.toBe(false);

    expect(calls.filter((call) => /^(competition|fill-query|lock):/.test(call))).toEqual([
      'competition:league-1',
      'fill-query:league-1:team-A',
      'lock:g1',
    ]);
    expect(firstIndex(calls, 'lock:g1')).toBeLessThan(firstIndex(calls, 'read-state:g1'));
    // 상대 사이드(team-B)의 빈 신청은 이 사이드를 쓰는 트랜잭션이 건드리지 않는다.
    expect(fillLeagueTeamRoster).toHaveBeenCalledTimes(1);
    expect(fillLeagueTeamRoster).toHaveBeenCalledWith(tx, 'league-1', { id: 'reg-A', teamId: 'team-A' });
    expect(raw.v1GameLineup.create).not.toHaveBeenCalled();
  });

  it('대회 경기는 채울 것이 없고 대회 행만 먼저 잡는다', async () => {
    const { tx, calls } = fakeTx({ games: [{ id: 'g1', leagueId: null, tournamentId: 'cup-1', teamIds: ['team-A'] }] });
    await syncGameSideRoster(tx, { gameId: 'g1', sideId: sideId('g1', 'team-A') });
    expect(calls.filter((call) => /^(competition|fill-query|lock):/.test(call))).toEqual(['competition:cup-1', 'lock:g1']);
  });
});

describe('후속 이벤트 워커 핸들러', () => {
  const games: FakeGame[] = [
    { id: 'g3', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-A', 'team-C'] },
    { id: 'g1', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-B', 'team-A'] },
  ];

  it('대기 이벤트를 먼저 닫고, 대회 행 → 채우기 → 팀의 시작 전 경기(id 순)로 잡은 뒤에는 새로 잡지 않는다', async () => {
    const { tx, calls } = fakeTx({ games, emptyRegistrations: { 'league-1': [{ id: 'reg-A', teamId: 'team-A' }] } });
    await handleCompetitionRosterResync(tx, {
      id: 'event-1',
      payload: { scope: 'competitionTeam', competitionId: 'league-1', teamId: 'team-A' },
    });

    expect(calls[0]).toBe('complete-duplicates');
    expect(calls.filter((call) => /^(competition|fill-query|lock):/.test(call))).toEqual([
      'competition:league-1',
      'fill-query:league-1:team-A',
      'lock:g1',
      'lock:g3',
    ]);
  });

  it('경기 대상: 그 경기의 두 팀 신청을 채우고 잠근 뒤 판정해, 그 사이 시작된 경기에는 쓰지 않는다', async () => {
    const { tx, calls, raw } = fakeTx({ games, stateAfterLock: 'LIVE' });
    await expect(handleCompetitionRosterResync(tx, { id: 'event-1', payload: { scope: 'game', gameId: 'g1' } })).resolves.toBe(0);
    expect(calls).toContain('fill-query:league-1:team-A,team-B');
    expect(lastIndex(calls, 'fill-query:')).toBeLessThan(firstIndex(calls, 'lock:g1'));
    expect(firstIndex(calls, 'lock:g1')).toBeLessThan(firstIndex(calls, 'read-state:g1'));
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

describe('여러 대회·리그 재계산', () => {
  it('결장 기간이 두 리그에 걸치면 대회 행 둘 → 리그별 채우기 → 경기 셋을 id 순으로, 그 뒤엔 새로 잡지 않는다', async () => {
    const { tx, calls } = fakeTx({
      games: [
        { id: 'g3', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-A'] },
        { id: 'g1', leagueId: 'league-2', tournamentId: 'league-2', teamIds: ['team-A'] },
        { id: 'g2', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-A'] },
      ],
    });
    await syncTeamRostersWithinPeriod(tx, {
      teamId: 'team-A',
      startsAt: new Date('2099-01-01T00:00:00Z'),
      endsAt: new Date('2099-02-01T00:00:00Z'),
    });
    expect(calls.filter((call) => /^(competition|fill-query|lock):/.test(call))).toEqual([
      'competition:league-1',
      'competition:league-2',
      'fill-query:league-1:team-A',
      'fill-query:league-2:team-A',
      'lock:g1',
      'lock:g2',
      'lock:g3',
    ]);
  });

  it('참가 명단 없이 팀원 기준으로 뛰는 리그 경기만 잡는다 — 명단 있는 리그·대회 경기는 명단 정리 경로 몫이다', async () => {
    const { tx, calls } = fakeTx({
      games: [
        { id: 'g1', leagueId: 'league-registered', tournamentId: 'league-registered', teamIds: ['team-A'] },
        { id: 'g2', leagueId: 'league-fallback', tournamentId: 'league-fallback', teamIds: ['team-A'] },
        { id: 'g3', leagueId: null, tournamentId: 'cup-1', teamIds: ['team-A'] },
      ],
      leaguesWithRoster: ['league-registered'],
    });
    await syncTeamMemberFallbackRosters(tx, ['team-A']);
    expect(calls.filter((call) => /^(competition|lock):/.test(call))).toEqual(['competition:league-fallback', 'lock:g2']);
  });

  it('시작 전 경기가 없으면 아무것도 잡지 않는다', async () => {
    const { tx, calls } = fakeTx({ games: [] });
    await expect(syncTeamMemberFallbackRosters(tx, ['team-A'])).resolves.toBe(0);
    expect(calls).toEqual([]);
  });

  it('잠그기 전 조회와 잠근 뒤 조회 사이에 끼어든 경기는 잡지 않고 409 로 끝낸다(재시도 가능)', async () => {
    const { tx, calls } = fakeTx({
      games: [
        { id: 'g1', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-A'] },
        { id: 'g2', leagueId: 'league-1', tournamentId: 'league-1', teamIds: ['team-A'] },
      ],
      // 잠근 뒤 다시 읽을 때 다른 트랜잭션이 커밋한 g1(더 작은 id)이 보인다.
      upcomingSequence: [['g2'], ['g1', 'g2']],
    });
    await expect(syncCompetitionTeamRosters(tx, { competitionId: 'league-1', teamId: 'team-A' })).rejects.toMatchObject({
      response: { code: 'COMMAND_CONCURRENCY_CONFLICT', details: { gameIds: ['g1'] } },
    });
    expect(calls.filter((call) => call.startsWith('lock:'))).toEqual(['lock:g2']);
  });
});

describe('carryArrivals — 새 리비전이 화면에 보이던 검인을 잇는다', () => {
  const at = (hhmm: string) => new Date(`2099-01-01T${hhmm}:00Z`);
  const account = (userId: string, jerseyNumber: number | null = null) => ({ userId, displayNameSnapshot: `선수 ${userId}`, jerseyNumber });
  const guest = (name: string) => ({ userId: null, displayNameSnapshot: name, jerseyNumber: null });

  it('계정은 계정으로 잇고(등번호가 바뀌어도), 명단에서 빠진 사람의 검인은 누구에게도 옮겨 가지 않는다', () => {
    const shown = [
      { userId: 'u1', displayNameSnapshot: '선수 u1', arrivedAt: at('09:40') },
      { userId: 'u2', displayNameSnapshot: '선수 u2', arrivedAt: at('09:41') },
      { userId: 'u3', displayNameSnapshot: '선수 u3', arrivedAt: null },
    ];
    expect(carryArrivals(shown, [account('u3'), account('u1', 7), account('u4')])).toEqual([null, at('09:40'), null]);
  });

  it('계정 없는 행은 이름으로, 같은 이름은 보이던 순서대로 1:1 — 계정 행과는 이름이 같아도 섞지 않는다', () => {
    const shown = [
      { userId: null, displayNameSnapshot: '김철수', arrivedAt: at('09:30') },
      { userId: null, displayNameSnapshot: '김철수', arrivedAt: null },
      { userId: 'u9', displayNameSnapshot: '이영희', arrivedAt: at('09:35') },
    ];
    expect(carryArrivals(shown, [guest('김철수'), guest('김철수'), guest('김철수'), guest('이영희')])).toEqual([
      at('09:30'),
      null,
      null,
      null,
    ]);
  });
});

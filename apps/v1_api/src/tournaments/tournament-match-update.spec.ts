import type { Prisma } from '@prisma/client';
import { lockGameScope, syncGameSideRoster, syncRostersForTeamMatchTeams, type GameLockScope } from '../games/roster/game-roster-sync';
import { updateTournamentMatchInTx } from './tournament-match-update';

// 명단 계산 자체는 game-roster-sync 스펙·통합 스펙이 본다. 여기서는 대진 수정이 무엇을 어떤 순서로 잠그고
// 그 잠금 범위를 동기화에 넘기는지만 본다.
jest.mock('../games/roster/game-roster-sync', () => {
  const actual = jest.requireActual('../games/roster/game-roster-sync');
  return { ...actual, syncGameSideRoster: jest.fn(async () => false), syncRostersForTeamMatchTeams: jest.fn(async () => 0) };
});

const UPCOMING_BY_TEAM: Record<string, string[]> = {
  'team-a': ['game-z', 'game-m'],
  'team-b': ['game-a'],
  'team-c': ['game-b'],
};
const REGISTRATIONS: Record<string, { id: string; teamId: string; team: { name: string } }> = {
  'reg-a': { id: 'reg-a', teamId: 'team-a', team: { name: 'A' } },
  'reg-b': { id: 'reg-b', teamId: 'team-b', team: { name: 'B' } },
  'reg-c': { id: 'reg-c', teamId: 'team-c', team: { name: 'C' } },
};

/** 대진 X(tm-x, 경기 game-m)는 team-a 대 team-b. team-a 의 다른 경기 game-z 는 id 가 더 크다. */
function detailRow() {
  return {
    teamMatchId: 'tm-x',
    tournamentId: 'tour-1',
    groupId: null,
    round: 'r1',
    fixtureNumber: 1,
    legNumber: 1,
    parentTeamMatchId: null,
    homeRegistrationId: 'reg-a',
    awayRegistrationId: 'reg-b',
    teamMatch: {
      id: 'tm-x',
      title: 'X',
      hostTeamId: 'team-a',
      approvedApplicantTeamId: 'team-b',
      startAt: null,
      endAt: null,
      placeName: null,
      status: 'matched',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      game: {
        id: 'game-m',
        sides: [
          { id: 'side-home', sideKey: 'HOME', teamId: 'team-a' },
          { id: 'side-away', sideKey: 'AWAY', teamId: 'team-b' },
        ],
      },
    },
  };
}

function fakeTx() {
  const calls: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      if (query.includes('FROM v1_games WHERE id =') && query.includes('FOR UPDATE')) {
        calls.push(`lock-game:${String(values[0])}`);
        return [];
      }
      if (query.includes('FROM v1_games')) {
        calls.push(`read-game${query.includes('FOR UPDATE') ? ':locking' : ''}`);
        return [{ id: 'game-m', state: 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: null }];
      }
      if (query.includes('v1_tournament_match_details')) {
        calls.push('lock-details');
        return [];
      }
      if (query.includes('v1_team_matches')) {
        calls.push('lock-team-match');
        return [{ id: 'tm-x', deletedAt: null }];
      }
      throw new Error(`unexpected raw query: ${query}`);
    }),
    v1TournamentMatchDetails: {
      findUnique: jest.fn(async () => detailRow()),
      findUniqueOrThrow: jest.fn(async () => detailRow()),
      update: jest.fn(async () => {
        calls.push('write');
        return {};
      }),
    },
    v1TournamentRegistration: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => REGISTRATIONS[id]).filter((row) => row !== undefined),
      ),
    },
    v1Game: {
      findMany: jest.fn(
        async ({ where }: { where: { sides?: { some: { teamId: string } }; OR?: Array<{ sides: { some: { teamId: string } } }> } }) =>
          (where.OR ?? [where]).flatMap((row) => UPCOMING_BY_TEAM[row.sides!.some.teamId] ?? []).map((id) => ({ id })),
      ),
      update: jest.fn(async () => ({})),
    },
    v1GameResultRevision: { findUnique: jest.fn() },
    v1TeamMatch: {
      update: jest.fn(async () => {
        calls.push('write');
        return {
          id: 'tm-x',
          tournamentId: 'tour-1',
          title: 'X',
          startAt: null,
          placeName: null,
          status: 'matched',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    },
    v1GameLineup: {
      findFirst: jest.fn(async () => ({ id: 'lineup-1', revision: 1 })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async () => ({ id: 'lineup-2' })),
    },
    v1TeamTacticsBoard: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    v1GameSide: { update: jest.fn(async () => ({})) },
    v1TeamSchedule: { updateMany: jest.fn(async () => ({ count: 0 })) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

beforeEach(() => jest.clearAllMocks());

describe('updateTournamentMatchInTx — 경기 잠금 순서', () => {
  it('자기 경기와 바뀌기 전·후 팀의 시작 전 경기를 한 번에 id 순으로 잠근 뒤에만 상세·팀 매치를 잡는다', async () => {
    const { tx, calls } = fakeTx();
    await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c' });

    const firstNonGameLock = calls.findIndex((call) => !call.startsWith('lock-game:'));
    // 옛 팀(team-a·team-b)·새 팀(team-c)의 경기와 자기 경기(game-m) 전부. game-z 가 자기 경기보다 뒤인데도
    // 자기 경기를 먼저 잡지 않는다 — 먼저 잡으면 game-z 를 쥔 다른 대진 수정과 서로를 기다린다.
    expect(calls.slice(0, firstNonGameLock)).toEqual([
      'lock-game:game-a',
      'lock-game:game-b',
      'lock-game:game-m',
      'lock-game:game-z',
    ]);
    expect(calls.slice(firstNonGameLock).some((call) => call.startsWith('lock-game:') || call === 'read-game:locking')).toBe(false);
    expect(calls.indexOf('lock-details')).toBeLessThan(calls.indexOf('lock-team-match'));
    expect(calls.indexOf('lock-team-match')).toBeLessThan(calls.indexOf('write'));

    // 동기화는 방금 잡은 범위를 받는다 — 그 밖의 경기가 필요하면 잠그지 않고 409 로 끝난다.
    const sideScope = (syncGameSideRoster as jest.Mock).mock.calls[0][3] as GameLockScope;
    const teamScope = (syncRostersForTeamMatchTeams as jest.Mock).mock.calls[0][2] as GameLockScope;
    expect([...teamScope.gameIds].sort()).toEqual(['game-a', 'game-b', 'game-m', 'game-z']);
    expect(sideScope).toBe(teamScope);
  });

  it('장소만 고치면 자기 경기만 잠그고 팀 경기는 건드리지 않는다', async () => {
    const { tx, calls } = fakeTx();
    await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', venue: '새 구장' });
    expect(calls.filter((call) => call.startsWith('lock-game:'))).toEqual(['lock-game:game-m']);
    expect(syncRostersForTeamMatchTeams).not.toHaveBeenCalled();
  });

  it('호출자가 넘긴 잠금 범위에 자기 경기가 없으면 상세·팀 매치를 잡기 전에 409 로 끝낸다', async () => {
    const { tx, calls } = fakeTx();
    const scope = await lockGameScope(tx, ['game-a']);
    calls.length = 0;
    await expect(
      updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c' }, scope),
    ).rejects.toMatchObject({ response: { code: 'COMMAND_CONCURRENCY_CONFLICT', details: { gameIds: ['game-m'] } } });
    expect(calls).toEqual(['read-game']);
  });
});

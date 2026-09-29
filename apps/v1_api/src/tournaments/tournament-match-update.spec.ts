import type { Prisma } from '@prisma/client';
import { updateTournamentMatchInTx } from './tournament-match-update';

// 명단 계산 자체는 game-roster-sync 스펙·통합 스펙이 본다. 여기서는 대진 수정이 자기 경기만 잠그고
// 명단 재계산을 후속 이벤트로 남기는지만 본다.

const REGISTRATIONS: Record<string, { id: string; teamId: string; team: { name: string } }> = {
  'reg-a': { id: 'reg-a', teamId: 'team-a', team: { name: 'A' } },
  'reg-b': { id: 'reg-b', teamId: 'team-b', team: { name: 'B' } },
  'reg-c': { id: 'reg-c', teamId: 'team-c', team: { name: 'C' } },
};

/** 대진 X(tm-x, 경기 game-m)는 team-a 대 team-b. */
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
  const events: unknown[] = [];
  const tx = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      if (!strings.join('?').includes('INSERT INTO v1_outbox_events')) throw new Error('unexpected raw execute');
      calls.push('enqueue');
      events.push(JSON.parse(String(values[5])));
      return 1;
    }),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join('?');
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
      findMany: jest.fn(async () => {
        throw new Error('대진 수정은 다른 경기를 조회·잠그지 않는다');
      }),
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
    v1GameRosterAdjustment: {
      updateMany: jest.fn(async () => {
        calls.push('revoke-adjustments');
        return { count: 1 };
      }),
    },
    v1TeamSchedule: { updateMany: jest.fn(async () => ({ count: 0 })), findUnique: jest.fn(async () => ({ id: 'schedule-1' })), update: jest.fn(async () => ({})) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, calls, events };
}

beforeEach(() => jest.clearAllMocks());

describe('updateTournamentMatchInTx — 자기 경기만 잠그고 명단은 후속 이벤트로', () => {
  it('팀을 바꾸면 자기 경기 → 상세 → 팀 매치 순으로 잡고, 새 팀 사이드와 옛·새 팀 재계산 이벤트만 남긴다', async () => {
    const { tx, calls, events } = fakeTx();
    await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c' });

    // 다른 경기를 잡으면 같은 팀이 걸린 두 대진 수정이 서로를 기다린다(40P01).
    expect(calls.slice(0, 3)).toEqual(['read-game:locking', 'lock-details', 'lock-team-match']);
    expect(calls.filter((call) => call.startsWith('read-game'))).toEqual(['read-game:locking']);
    expect(calls.indexOf('lock-team-match')).toBeLessThan(calls.indexOf('write'));
    expect(events).toEqual([
      { scope: 'game', gameId: 'game-m' },
      { scope: 'competitionTeam', competitionId: 'tour-1', teamId: 'team-a' },
      { scope: 'competitionTeam', competitionId: 'tour-1', teamId: 'team-b' },
      { scope: 'competitionTeam', competitionId: 'tour-1', teamId: 'team-c' },
    ]);
    // 바뀐 홈 사이드에서 새 팀(C)이 아닌 활성 조정만 시스템으로 되돌린다. 원정 사이드는 건드리지 않는다.
    const revoke = (tx as unknown as { v1GameRosterAdjustment: { updateMany: jest.Mock } }).v1GameRosterAdjustment.updateMany;
    expect(revoke.mock.calls).toEqual([
      [
        {
          where: { gameId: 'game-m', sideId: 'side-home', revokedAt: null },
          data: { revokedAt: expect.any(Date), revokedByUserId: null, revokedByRole: 'SYSTEM' },
        },
      ],
    ]);
    expect(calls.indexOf('read-game:locking')).toBeLessThan(calls.indexOf('revoke-adjustments'));
  });

  it('시각만 바꾸면 양 팀 재계산 이벤트만 남긴다(사이드 명단·조정은 그대로)', async () => {
    const { tx, calls, events } = fakeTx();
    await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', scheduledAt: new Date('2099-01-01T00:00:00Z') });
    expect(calls).not.toContain('revoke-adjustments');
    expect(events).toEqual([
      { scope: 'competitionTeam', competitionId: 'tour-1', teamId: 'team-a' },
      { scope: 'competitionTeam', competitionId: 'tour-1', teamId: 'team-b' },
    ]);
  });

  it('장소만 고치면 이벤트를 남기지 않는다', async () => {
    const { tx, calls, events } = fakeTx();
    await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', venue: '새 구장' });
    expect(events).toEqual([]);
    expect(calls).not.toContain('enqueue');
  });
});

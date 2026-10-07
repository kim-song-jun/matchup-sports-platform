import { Prisma } from '@prisma/client';
import { updateTournamentMatchInTx } from './tournament-match-update';

// 명단 계산 자체는 game-roster-sync 스펙·통합 스펙이 본다. 여기서는 대진 수정이 자기 경기만 잠그고
// 명단 재계산을 후속 이벤트로 남기는지만 본다.

const REGISTRATIONS: Record<string, { id: string; teamId: string; team: { name: string } }> = {
  'reg-a': { id: 'reg-a', teamId: 'team-a', team: { name: 'A' } },
  'reg-b': { id: 'reg-b', teamId: 'team-b', team: { name: 'B' } },
  'reg-c': { id: 'reg-c', teamId: 'team-c', team: { name: 'C' } },
};

/** 대진 X(tm-x, 경기 game-m)는 team-a 대 team-b. */
function detailRow(startAt: Date | null = null) {
  return {
    teamMatchId: 'tm-x',
    tournamentId: 'tour-1',
    groupId: null,
    round: 'r1',
    fixtureNumber: 1,
    legNumber: 1,
    tournament: { title: '대회' },
    group: null,
    parentTeamMatchId: null,
    homeRegistrationId: 'reg-a',
    awayRegistrationId: 'reg-b',
    teamMatch: {
      id: 'tm-x',
      title: 'X',
      hostTeamId: 'team-a',
      approvedApplicantTeamId: 'team-b',
      startAt,
      endAt: null,
      competitionConfigVersionId: 'config-1',
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

function fakeTx(startAt: Date | null = null) {
  const calls: string[] = [];
  const events: unknown[] = [];
  const tx = {
    v1CompetitionConfigVersion: { findUnique: jest.fn().mockResolvedValue(null) },
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
      findFirst: jest.fn(async () => null),
      findUnique: jest.fn(async () => detailRow(startAt)),
      findUniqueOrThrow: jest.fn(async () => detailRow(startAt)),
      update: jest.fn(async () => {
        calls.push('write');
        return {};
      }),
    },
    v1TournamentMatchAdvancementEdge: { findMany: jest.fn(async () => []) },
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
  return { tx: tx as unknown as Prisma.TransactionClient, mocks: tx, calls, events };
}

beforeEach(() => jest.clearAllMocks());

describe('updateTournamentMatchInTx — 자기 경기만 잠그고 명단은 후속 이벤트로', () => {
  it.each([{ venue: '새 구장' }, { fixtureNumber: 7 }])('종료 없는 경기의 부분 수정은 경기와 양 팀 캘린더 종료를 함께 보충한다: %j', async (patch) => {
    const startAt = new Date('2026-11-15T09:00:00Z');
    const endAt = new Date('2026-11-15T09:40:00Z');
    const { tx, mocks } = fakeTx(startAt);
    mocks.v1CompetitionConfigVersion.findUnique.mockResolvedValue({ periods: [
      { durationMinutes: 20, extraTime: false }, { durationMinutes: 20, extraTime: false }, { durationMinutes: 10, extraTime: true },
    ] });
    await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', ...patch });
    expect(tx.v1TeamMatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ startAt, endAt }) }));
    expect(tx.v1TeamSchedule.findUnique).toHaveBeenCalledTimes(2);
    for (const teamId of ['team-a', 'team-b']) {
      expect(tx.v1TeamSchedule.findUnique).toHaveBeenCalledWith({ where: { teamId_teamMatchId: { teamId, teamMatchId: 'tm-x' } }, select: { id: true } });
    }
    expect(tx.v1TeamSchedule.update).toHaveBeenCalledTimes(2);
    expect(tx.v1TeamSchedule.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ startAt, endAt }) }));
    expect(tx.v1TeamSchedule.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: expect.objectContaining({ startAt, endAt }) }));
  });

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

  it('번호만 고치면 새 번호를 저장·응답하고 제목과 일정은 동기화하며 경기·결과·사이드는 유지한다', async () => {
    const { tx, events } = fakeTx();
    const input = { teamMatchId: 'tm-x', fixtureNumber: 7 };
    const result = await updateTournamentMatchInTx(tx, input);
    expect(result).toMatchObject({ id: 'tm-x', fixtureNumber: 7, homeRegistrationId: 'reg-a', awayRegistrationId: 'reg-b' });
    expect(tx.v1TournamentMatchDetails.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fixtureNumber: 7 }) }));
    expect(tx.v1TeamMatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: expect.stringMatching(/7$/) }) }));
    expect(tx.v1TeamSchedule.updateMany).toHaveBeenCalledWith({ where: { teamMatchId: 'tm-x' }, data: { title: expect.stringMatching(/7$/), version: { increment: 1 } } });
    expect(tx.v1Game.update).not.toHaveBeenCalled();
    expect(tx.v1GameSide.update).not.toHaveBeenCalled();
    expect(tx.v1GameLineup.updateMany).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
  });

  it('같은 대회·라운드·차수의 중복 번호는 아무것도 쓰기 전에 거절한다', async () => {
    const { tx, calls } = fakeTx();
    (tx.v1TournamentMatchDetails.findFirst as jest.Mock).mockResolvedValue({ teamMatchId: 'tm-other' });
    const input = { teamMatchId: 'tm-x', fixtureNumber: 7 };
    await expect(updateTournamentMatchInTx(tx, input)).rejects.toMatchObject({ response: { code: 'FIXTURE_NUMBER_CONFLICT' } });
    expect(tx.v1TournamentMatchDetails.findFirst).toHaveBeenCalledWith({ where: { tournamentId: 'tour-1', round: 'r1', fixtureNumber: 7, legNumber: 1, teamMatchId: { not: 'tm-x' } }, select: { teamMatchId: true } });
    expect(calls).not.toContain('write');
    expect(calls).not.toContain('enqueue');
  });

  it('같은 번호는 충돌 검사·제목 재작성·명단 이벤트 없이 유지한다', async () => {
    const { tx, events } = fakeTx();
    expect(await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', fixtureNumber: 1 })).toMatchObject({ fixtureNumber: 1 });
    expect(tx.v1TournamentMatchDetails.findFirst).not.toHaveBeenCalled();
    expect(tx.v1TeamSchedule.updateMany).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('DB 유일성 경쟁도 중복 번호 409로 변환한다', async () => {
    const { tx } = fakeTx();
    (tx.v1TournamentMatchDetails.update as jest.Mock).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique conflict', { code: 'P2002', clientVersion: '6.19.2' }));
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', fixtureNumber: 7 })).rejects.toMatchObject({ response: { code: 'FIXTURE_NUMBER_CONFLICT' } });
    expect(tx.v1TeamMatch.update).not.toHaveBeenCalled();
    expect(tx.v1TeamSchedule.updateMany).not.toHaveBeenCalled();
  });
});


it('연결된 슬롯을 null로 덮으려는 요청은 잠금 뒤 최신 승자 배정과 비교하여 409로 거절한다', async () => {
  const { tx, calls } = fakeTx();
  (tx.v1TournamentMatchAdvancementEdge.findMany as jest.Mock).mockResolvedValue([{ targetSide: 'HOME' }]);
  await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: null }))
    .rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_SLOT_LINKED' } });
  expect(calls).not.toContain('write');
});

it('연결된 슬롯의 최신 팀을 그대로 보내는 수정은 허용한다', async () => {
  const { tx } = fakeTx();
  (tx.v1TournamentMatchAdvancementEdge.findMany as jest.Mock).mockResolvedValue([{ targetSide: 'HOME' }]);
  await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-a', venue: '새 장소' }))
    .resolves.toMatchObject({ homeRegistrationId: 'reg-a' });
});

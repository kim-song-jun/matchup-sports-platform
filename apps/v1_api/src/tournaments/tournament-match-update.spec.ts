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

type FakeEvent = {
  id: string;
  type: string;
  sideId: string | null;
  participantId: string | null;
  assistParticipantId: string | null;
  reversesEventId: string | null;
};

/** 홈(team-a) 선수 p-home, 어웨이(team-b) 선수 p-away. 점수는 GOAL/OWN_GOAL 의 sideId(득점 사이드)로 센다. */
const GAME_EVENTS: FakeEvent[] = [
  { id: 'e-period', type: 'PERIOD_START', sideId: null, participantId: null, assistParticipantId: null, reversesEventId: null },
  { id: 'e-home-goal', type: 'GOAL', sideId: 'side-home', participantId: 'p-home', assistParticipantId: null, reversesEventId: null },
  { id: 'e-home-card', type: 'CARD', sideId: 'side-home', participantId: 'p-home', assistParticipantId: null, reversesEventId: null },
  { id: 'e-away-goal', type: 'GOAL', sideId: 'side-away', participantId: 'p-away', assistParticipantId: null, reversesEventId: null },
  { id: 'e-away-card', type: 'CARD', sideId: 'side-away', participantId: 'p-away', assistParticipantId: null, reversesEventId: null },
  // 홈 선수의 자책골 → 어웨이 득점
  { id: 'e-home-own-goal', type: 'OWN_GOAL', sideId: 'side-away', participantId: 'p-home', assistParticipantId: null, reversesEventId: null },
  // 취소된 홈 골과 그 취소 이벤트
  { id: 'e-home-voided-goal', type: 'GOAL', sideId: 'side-home', participantId: 'p-home', assistParticipantId: null, reversesEventId: null },
  { id: 'e-home-correction', type: 'CORRECTION', sideId: 'side-home', participantId: 'p-home', assistParticipantId: null, reversesEventId: 'e-home-voided-goal' },
];

const REVISION_ROW = {
  id: 'rev-latest', gameId: 'game-m', revision: 3, state: 'SUBMITTED', score: { home: 1, away: 2 }, goalEvents: null, eventsHash: 'hash',
  missingScorer: false, mvpParticipantId: null, outcomeReason: 'NORMAL', outcomeNote: null,
};

type FakeGame = {
  state?: string;
  currentOfficialRevisionId?: string | null;
  officialState?: string | null;
  latestRevisionState?: string | null;
  unconfirmedRevisions?: Array<{ id: string; state: string }>;
};

function fakeTx(startAt: Date | null = null, gameOptions: FakeGame = {}) {
  const calls: string[] = [];
  const events: unknown[] = [];
  const gameEvents = GAME_EVENTS.map((event) => ({ ...event }));
  const tx = {
    v1CompetitionConfigVersion: { findUnique: jest.fn().mockResolvedValue(null) },
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      if (query.includes('UPDATE v1_result_escalations') || query.includes('UPDATE v1_outbox_events')) {
        calls.push(`close-sla:${String(values[values.length - 1])}`);
        return 1;
      }
      if (!query.includes('INSERT INTO v1_outbox_events')) throw new Error('unexpected raw execute');
      calls.push('enqueue');
      events.push(JSON.parse(String(values[5])));
      return 1;
    }),
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join('?');
      if (query.includes('FROM v1_games')) {
        calls.push(`read-game${query.includes('FOR UPDATE') ? ':locking' : ''}`);
        return [{ id: 'game-m', state: gameOptions.state ?? 'SCHEDULED', sourceType: 'TEAM_MATCH', currentOfficialRevisionId: gameOptions.currentOfficialRevisionId ?? null }];
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
    v1GameResultRevision: {
      findUnique: jest.fn(async () => (gameOptions.officialState === undefined ? null : { state: gameOptions.officialState })),
      findFirst: jest.fn(async () => (gameOptions.latestRevisionState == null ? null : { ...REVISION_ROW, id: 'rev-latest', revision: 3, state: gameOptions.latestRevisionState })),
      findMany: jest.fn(async () => (gameOptions.unconfirmedRevisions ?? []).map((row) => ({ ...row }))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { state: string } }) => {
        calls.push(`revision-void:${where.id}:${data.state}`);
        return {};
      }),
      create: jest.fn(async () => {
        calls.push('revision-void-create');
        return { id: 'rev-discard-void' };
      }),
    },
    v1GameParticipant: {
      findMany: jest.fn(async ({ where }: { where: { sideId: { in: string[] } } }) =>
        [{ id: 'p-home', sideId: 'side-home' }, { id: 'p-away', sideId: 'side-away' }].filter((row) => where.sideId.in.includes(row.sideId)),
      ),
    },
    v1GameEvent: {
      findMany: jest.fn(async () => gameEvents.map((event) => ({ ...event }))),
      deleteMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        calls.push('delete-events');
        for (const id of where.id.in) gameEvents.splice(gameEvents.findIndex((event) => event.id === id), 1);
        return { count: where.id.in.length };
      }),
    },
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
    v1GameSide: {
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async () => [{ id: 'side-home', sideKey: 'HOME' }, { id: 'side-away', sideKey: 'AWAY' }]),
    },
    v1GameRosterAdjustment: {
      updateMany: jest.fn(async () => {
        calls.push('revoke-adjustments');
        return { count: 1 };
      }),
    },
    v1TeamSchedule: { updateMany: jest.fn(async () => ({ count: 0 })), findUnique: jest.fn(async () => ({ id: 'schedule-1' })), update: jest.fn(async () => ({})) },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, mocks: tx, calls, events, gameEvents };
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


describe('updateTournamentMatchInTx — 시작된 경기의 팀 교체', () => {
  const reason = '참가 팀 사정으로 교체';

  it('허용 플래그 없이는 진행 중 경기의 팀 교체가 기존대로 FIXTURE_HAS_RESULT 409 이고 아무것도 지우지 않는다', async () => {
    const { tx, calls } = fakeTx(null, { state: 'LIVE' });
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c' }))
      .rejects.toMatchObject({ response: { code: 'FIXTURE_HAS_RESULT' } });
    expect(calls).not.toContain('write');
    expect(calls).not.toContain('delete-events');
  });

  it('진행 중 경기: 홈 팀을 바꾸면 홈 기록(골·카드·취소된 골과 취소)과 홈 선수의 자책골만 지우고 어웨이 기록은 남긴다', async () => {
    const { tx, calls, events, gameEvents } = fakeTx(null, { state: 'LIVE' });
    const result = await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: ` ${reason} `, actorUserId: 'admin-1' });

    expect(gameEvents.map((event) => event.id)).toEqual(['e-period', 'e-away-goal', 'e-away-card']);
    expect(result.startedTeamChange).toEqual({
      gameState: 'LIVE',
      reason,
      discardedRevisions: [],
      sides: [{ sideKey: 'HOME', removedEventCount: 4 }],
      removedEventCount: 5,
      scoreBefore: { home: 1, away: 2 },
      scoreAfter: { home: 0, away: 1 },
    });
    expect(calls.indexOf('delete-events')).toBeLessThan(calls.indexOf('revoke-adjustments'));
    // 새 팀 명단은 시작 전 경기용 'game' 이벤트가 아니라 그 사이드만 맞추는 이벤트로 채운다(상대 사이드 보존).
    expect(events).toContainEqual({ scope: 'startedGameSide', gameId: 'game-m', sideId: 'side-home' });
    expect(events).not.toContainEqual({ scope: 'game', gameId: 'game-m' });
    // 콘솔의 expectedVersion 이 낡아 이후 커맨드가 VERSION_CONFLICT 로 거부된다.
    expect(tx.v1Game.update).toHaveBeenCalledWith({ where: { id: 'game-m' }, data: { version: { increment: 1 } } });
  });

  it('양쪽 팀을 모두 바꾸면 양쪽 기록과 서로의 자책골이 모두 지워진다', async () => {
    const { tx, gameEvents } = fakeTx(null, { state: 'PAUSED' });
    const result = await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', awayRegistrationId: 'reg-a', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' });
    expect(gameEvents.map((event) => event.id)).toEqual(['e-period']);
    expect(result.startedTeamChange).toMatchObject({ scoreAfter: { home: 0, away: 0 } });
  });

  it('종료됐지만 결과가 무효(VOID)인 경기는 교체할 수 있다', async () => {
    const { tx } = fakeTx(null, { state: 'ENDED', currentOfficialRevisionId: 'rev-void', officialState: 'VOID', latestRevisionState: 'VOID' });
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', awayRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' }))
      .resolves.toMatchObject({ startedTeamChange: { gameState: 'ENDED' } });
  });

  it.each([
    ['공식 결과 확정', { state: 'ENDED', currentOfficialRevisionId: 'rev-1', officialState: 'OFFICIAL', latestRevisionState: 'OFFICIAL' }, 'FIXTURE_RESULT_MUST_BE_VOIDED'],
    ['취소된 경기', { state: 'CANCELLED' }, 'FIXTURE_CANCELLED'],
  ])('%s 이면 409 %s 이고 아무것도 쓰지 않는다', async (_label, game, code) => {
    const { tx, calls } = fakeTx(null, game);
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' }))
      .rejects.toMatchObject({ response: { code } });
    expect(calls).not.toContain('write');
    expect(calls).not.toContain('delete-events');
  });

  it('종료되고 결과가 제출됨(SUBMITTED)인 경기도 교체되고, 그 결과는 사유와 함께 VOID 로 폐기돼 공식 결과로 남지 않는다', async () => {
    const { tx, mocks, calls, gameEvents } = fakeTx(null, {
      state: 'ENDED',
      latestRevisionState: 'SUBMITTED',
      unconfirmedRevisions: [{ id: 'rev-latest', state: 'SUBMITTED' }],
    });
    const result = await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' });

    expect(result.startedTeamChange).toMatchObject({ gameState: 'ENDED', discardedRevisions: [{ id: 'rev-latest', state: 'SUBMITTED' }] });
    expect(mocks.v1GameResultRevision.update).toHaveBeenCalledWith({ where: { id: 'rev-latest' }, data: { state: 'VOID' } });
    expect(mocks.v1GameResultRevision.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ gameId: 'game-m', revision: 4, state: 'VOID', reason, createdByUserId: 'admin-1', supersedesId: 'rev-latest' }),
      select: { id: true },
    });
    // The pointer moves to the VOID revision: the game reads as "no confirmed result" and accepts a VOID_REENTRY correction.
    expect(mocks.v1Game.update).toHaveBeenCalledWith({ where: { id: 'game-m' }, data: { currentOfficialRevisionId: 'rev-discard-void' } });
    expect(calls).toContain('close-sla:rev-latest');
    expect(calls.indexOf('revision-void:rev-latest:VOID')).toBeLessThan(calls.indexOf('delete-events'));
    expect(gameEvents.map((event) => event.id)).toEqual(['e-period', 'e-away-goal', 'e-away-card']);
  });

  it('종료 경기의 마지막 결과가 CHANGE_REQUESTED(불변)이면 그 행은 그대로 두고 VOID 후속만 붙인다', async () => {
    const { tx, mocks } = fakeTx(null, { state: 'ENDED', latestRevisionState: 'CHANGE_REQUESTED' });
    const result = await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' });
    expect(result.startedTeamChange).toMatchObject({ discardedRevisions: [{ id: 'rev-latest', state: 'CHANGE_REQUESTED' }] });
    expect(mocks.v1GameResultRevision.update).not.toHaveBeenCalled();
    expect(mocks.v1GameResultRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'VOID', supersedesId: 'rev-latest' }) }));
  });

  it('이미 VOID 이거나 결과가 없는 경기는 폐기할 것이 없어 리비전을 건드리지 않는다', async () => {
    const { tx, mocks } = fakeTx(null, { state: 'LIVE' });
    const result = await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' });
    expect(result.startedTeamChange).toMatchObject({ discardedRevisions: [] });
    expect(mocks.v1GameResultRevision.create).not.toHaveBeenCalled();
    expect(mocks.v1Game.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentOfficialRevisionId: expect.anything() }) }));
  });

  it.each([undefined, null, '   ', 'x'.repeat(201)])('사유가 %j 이면 400 TEAM_CHANGE_REASON_REQUIRED 이고 아무것도 지우지 않는다', async (teamChangeReason) => {
    const { tx, calls } = fakeTx(null, { state: 'LIVE' });
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason, actorUserId: 'admin-1' }))
      .rejects.toMatchObject({ response: { code: 'TEAM_CHANGE_REASON_REQUIRED' } });
    expect(calls).not.toContain('write');
    expect(calls).not.toContain('delete-events');
  });

  it('시작 전 경기의 팀 교체는 사유 없이 기존대로 동작하고 기록 삭제·startedGameSide 이벤트가 없다', async () => {
    const { tx, calls, events } = fakeTx();
    const result = await updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true });
    expect(result.startedTeamChange).toBeNull();
    expect(calls).not.toContain('delete-events');
    expect(events).toContainEqual({ scope: 'game', gameId: 'game-m' });
  });

  it('팀은 그대로 두고 장소만 고치면 진행 중 경기도 사유·삭제 없이 수정된다', async () => {
    const { tx, calls } = fakeTx(null, { state: 'LIVE' });
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', venue: '새 구장', allowStartedTeamChange: true })).resolves.toMatchObject({ startedTeamChange: null });
    expect(calls).not.toContain('delete-events');
  });

  it('진출 연결 자리는 시작된 경기에서도 여전히 팀을 직접 바꿀 수 없다', async () => {
    const { tx, calls } = fakeTx(null, { state: 'LIVE' });
    (tx.v1TournamentMatchAdvancementEdge.findMany as jest.Mock).mockResolvedValue([{ targetSide: 'HOME' }]);
    await expect(updateTournamentMatchInTx(tx, { teamMatchId: 'tm-x', homeRegistrationId: 'reg-c', allowStartedTeamChange: true, teamChangeReason: reason, actorUserId: 'admin-1' }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_SOURCE_SLOT_LINKED' } });
    expect(calls).not.toContain('delete-events');
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

import type { Prisma } from '@prisma/client';
import { syncAdminEndedGameRoster } from './admin-ended-game-roster';
import { loadGameRoster, loadPlayedLineup } from './game-roster-loader';

jest.mock('./game-roster-loader', () => ({ loadGameRoster: jest.fn(), loadPlayedLineup: jest.fn() }));
jest.mock('../../team-matches/lineup-consent-carry', () => ({ loadRevokedConsentByUserId: async () => new Map(), carryRevokedConsent: async () => undefined }));
jest.mock('../games.service', () => ({ createSourceRosterIdentityLinks: jest.fn() }));

function fixture(state: 'OFFICIAL' | 'SUBMITTED' | null = 'OFFICIAL') {
  const game: { id: string; state: string; currentOfficialRevisionId: string | null; version: number } = { id: 'game', state: 'ENDED', currentOfficialRevisionId: state === 'OFFICIAL' ? 'r1' : null, version: 2 };
  const lineups = [{ id: 'l1', revision: 1, formation: null }];
  const snapshots = ['a', 'b', 'away'].map((userId) => ({ id: `p-${userId}`, userId, gameId: 'game', sideId: userId === 'away' ? 'away' : 'home', displayNameSnapshot: userId, position: null, jerseyNumber: null, lineupId: 'l1' }));
  const revisions = [{ id: 'r1', gameId: 'game', revision: 1, state: state ?? 'OFFICIAL', score: { home: 0, away: 0 }, eventsHash: 'hash', missingScorer: false, mvpParticipantId: null, outcomeReason: 'NORMAL', outcomeNote: null, submittedAt: new Date(), goalEvents: null }];
  const resultRows = snapshots.map((row) => ({ id: `r1-${row.id}`, resultRevisionId: 'r1', participantId: row.id, sideId: row.sideId, started: true, goals: 0, assists: 0, fouls: 0, goalkeeper: false, cards: { yellow: 0, red: 0 } }));
  if (state === null) revisions.length = 0;
  const events: unknown[] = [];
  jest.mocked(loadGameRoster).mockResolvedValue({ context: { gameState: 'ENDED' }, base: snapshots.slice(0, 2).map((row) => ({ userId: row.userId, accountLinked: true })) } as never);
  jest.mocked(loadPlayedLineup).mockImplementation(async () => snapshots.filter((row) => row.sideId === 'home' && (game.currentOfficialRevisionId === null ? row.lineupId === lineups.at(-1)!.id : resultRows.some((result) => result.resultRevisionId === game.currentOfficialRevisionId && result.participantId === row.id))));
  const tx = {
    v1Game: {
      findUniqueOrThrow: async () => game,
      update: async ({ data }: { data: { currentOfficialRevisionId?: string; version?: unknown } }) => {
        if (data.currentOfficialRevisionId) game.currentOfficialRevisionId = data.currentOfficialRevisionId;
        if (data.version) game.version += 1;
        return game;
      },
    },
    $executeRaw: async () => 0,
    v1GameEvent: { findMany: async () => [] },
    v1GameLineup: {
      findFirst: async () => lineups.at(-1),
      create: async ({ data }: { data: typeof lineups[number] }) => { const row = { ...data, id: `l${lineups.length + 1}` }; lineups.push(row); return row; },
    },
    v1GameParticipant: {
      findMany: async () => snapshots.filter((row) => row.sideId === 'home'),
      createManyAndReturn: async ({ data }: { data: typeof snapshots }) => {
        const rows = data.map((row, i) => ({ ...row, id: `new-${snapshots.length}-${i}` }));
        snapshots.push(...rows); return rows;
      },
    },
    v1GameResultRevision: {
      findFirst: async () => revisions.at(-1),
      findUnique: async ({ where }: { where: { id: string } }) => revisions.find((row) => row.id === where.id),
      create: async ({ data }: { data: typeof revisions[number] }) => { const row = { ...data, id: `r${revisions.length + 1}` }; revisions.push(row); return row; },
    },
    v1GameResultParticipant: {
      findMany: async ({ where }: { where: { resultRevisionId: string } }) => resultRows.filter((row) => row.resultRevisionId === where.resultRevisionId),
      createMany: async ({ data }: { data: typeof resultRows }) => { resultRows.push(...data); },
    },
    v1OperationAudit: { create: async () => ({ id: 'audit' }) },
    v1OutboxEvent: { create: async ({ data }: { data: unknown }) => { events.push(data); } },
  };
  const save = (op: 'EXCLUDE' | 'REVOKE') => syncAdminEndedGameRoster(tx as unknown as Prisma.TransactionClient, { gameId: 'game', sideId: 'home' }, 'admin', [{ userId: 'a', op }]);
  return { game, revisions, resultRows, events, save };
}

describe('어드민 종료 경기 출전 정정', () => {
  it('빠짐·되돌리기가 새 공식 리비전에 반영되고 이전 결과·상대팀 기록·점수를 보존한다', async () => {
    const data = fixture();
    const original = structuredClone(data.revisions[0]);
    await data.save('EXCLUDE');
    expect(data.game.currentOfficialRevisionId).toBe('r2');
    expect(data.resultRows.filter((row) => row.resultRevisionId === 'r2').map((row) => row.participantId)).toEqual(['p-b', 'p-away']);
    expect(data.revisions[0]).toEqual(original);
    await data.save('EXCLUDE');
    expect(data.revisions).toHaveLength(2);
    expect(data.events).toHaveLength(1);
    expect(data.revisions[1]).toMatchObject({ supersedesId: 'r1', createdByUserId: 'admin', score: original.score, state: 'OFFICIAL' });
    await data.save('REVOKE');
    expect(data.game.currentOfficialRevisionId).toBe('r3');
    expect(data.resultRows.filter((row) => row.resultRevisionId === 'r3').map((row) => row.participantId).sort()).toEqual(['p-a', 'p-away', 'p-b']);
    expect(data.game.version).toBe(4);
    expect(data.events).toEqual([
      expect.objectContaining({ type: 'GAME_RESULT_OFFICIAL', revisionId: 'r2', payload: { revisionId: 'r2' } }),
      expect.objectContaining({ type: 'GAME_RESULT_OFFICIAL', revisionId: 'r3' }),
    ]);
  });

  it('이전 빠짐 조정이 남아 있어도 외부 공식 정정으로 복귀한 선수를 다시 뺄 수 있다', async () => {
    const data = fixture();
    await data.save('EXCLUDE');
    data.game.currentOfficialRevisionId = 'r1';
    await data.save('EXCLUDE');
    expect(data.game.currentOfficialRevisionId).toBe('r3');
    expect(data.resultRows.filter((row) => row.resultRevisionId === 'r3').map((row) => row.participantId)).toEqual(['p-b', 'p-away']);
  });

  it.each(['SUBMITTED', null] as const)('%s 결과도 빠짐·되돌리기와 제출 명단의 후속 이력을 유지한다', async (state) => {
    const data = fixture(state);
    await data.save('EXCLUDE');
    expect((await loadPlayedLineup({} as never, {} as never))?.map((row) => row.userId)).toEqual(['b']);
    await data.save('REVOKE');
    expect((await loadPlayedLineup({} as never, {} as never))?.map((row) => row.userId).sort()).toEqual(['a', 'b']);
    expect(data.game.currentOfficialRevisionId).toBeNull();
    if (state !== null) {
      expect(data.revisions).toHaveLength(3);
      expect(data.events).toEqual([
        expect.objectContaining({ type: 'GAME_RESULT_SUBMITTED', revisionId: 'r2' }),
        expect.objectContaining({ type: 'GAME_RESULT_SUBMITTED', revisionId: 'r3' }),
      ]);
    } else expect(data.events).toEqual([]);
  });

  it.each(['goals' , 'assists', 'fouls', 'cards', 'mvp', 'timeline'])('%s 기록을 조용히 삭제하지 않고 결과 정정을 안내한다', async (field) => {
    const data = fixture();
    const row = data.resultRows[0];
    if (field === 'cards') row.cards.yellow = 1;
    else if (field === 'mvp') Object.assign(data.revisions[0], { mvpParticipantId: row.participantId });
    else if (field === 'timeline') Object.assign(data.revisions[0], { goalEvents: [{ participantId: row.participantId }] });
    else Object.assign(row, { [field]: 1 });
    await expect(data.save('EXCLUDE')).rejects.toMatchObject({ response: { code: 'ROSTER_RESULT_CORRECTION_REQUIRED' } });
    expect(data.revisions).toHaveLength(1);
    expect(data.game.currentOfficialRevisionId).toBe('r1');
    expect(data.events).toEqual([]);
  });
});

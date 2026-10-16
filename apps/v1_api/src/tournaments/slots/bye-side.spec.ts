import type { Prisma } from '@prisma/client';
import { setByeSideInTx } from './bye-side';
import type { SlotMutationContext } from './tournament-slot.service';
import { updateTournamentMatchInTx } from '../tournament-match-update';
jest.mock('../tournament-match-update', () => ({ updateTournamentMatchInTx: jest.fn() }));

function setup(registrationId: string | null = 'bye-team') {
  const slot = { id: 'slot', tournamentId: 't', kind: 'BYE', groupId: 'r12', position: 2, byeSortOrder: 2,
    registrationId, group: { phase: 'round12' } };
  const detail = { teamMatchId: 'q2', tournamentId: 't', groupId: 'quarter', group: { phase: 'quarter' }, homeRegistrationId: registrationId, awayRegistrationId: 'winner' };
  const match = { id: 'q2', homeSlotId: 'slot', awaySlotId: null as string | null, status: 'matched', deletedAt: null, tournamentDetails: detail };
  let edges = [
    { id: 'incoming', tournamentId: 't', sourceTeamMatchId: 'r2', sourceOutcome: 'WINNER', targetTeamMatchId: 'q2', targetSide: 'AWAY', createdAt: new Date() },
    { id: 'outgoing', tournamentId: 't', sourceTeamMatchId: 'q2', sourceOutcome: 'WINNER', targetTeamMatchId: 'semi', targetSide: 'HOME', createdAt: new Date() },
  ];
  const guarded = ['q2', 'semi'].map((id) => ({ id, status: 'matched', deletedAt: null, game: {
    state: 'SCHEDULED', currentOfficialRevisionId: null, _count: { events: 0 }, resultRevisions: [] as { id: string }[],
  } }));
  const tx = {
    $queryRaw: jest.fn(async () => []),
    v1TournamentSlot: { findUnique: jest.fn(async () => slot), update: jest.fn(async ({ data }) => Object.assign(slot, data)) },
    v1TeamMatch: {
      findMany: jest.fn(async (args) => args.where.OR ? [match] : guarded),
      update: jest.fn(async ({ data }) => Object.assign(match, data)),
    },
    v1Game: { findMany: jest.fn(async () => [{ id: 'game' }]) },
    v1TournamentMatchDetails: {
      findUnique: jest.fn(async () => ({ teamMatchId: 'r2', groupId: 'r12' })),
      findUniqueOrThrow: jest.fn(async () => detail),
    },
    v1TournamentMatchAdvancementEdge: {
      findMany: jest.fn(async () => edges),
      delete: jest.fn(async ({ where }) => { edges = edges.filter((edge) => edge.id !== where.id); }),
      create: jest.fn(async ({ data }) => { edges.push(data); return data; }),
    },
    v1TournamentGroupTeam: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: registrationId ? 1 : 0 })) },
    v1TournamentByeSlot: { findUnique: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: registrationId ? 0 : 1 })) },
  };
  jest.mocked(updateTournamentMatchInTx).mockImplementation(async (_tx, input) => {
    expect(edges.some((edge) => edge.id === 'incoming')).toBe(false);
    Object.assign(detail, { homeRegistrationId: input.homeRegistrationId, awayRegistrationId: input.awayRegistrationId });
    return {} as never;
  });
  const ctx = { admin: { id: 'admin' }, adminContext: { logAdminAction: jest.fn() } } as unknown as SlotMutationContext;
  const run = (side: 'HOME' | 'AWAY' = 'AWAY', expectedSide: 'HOME' | 'AWAY' = 'HOME') =>
    setByeSideInTx(tx as unknown as Prisma.TransactionClient, ctx, 't', 'slot', side, expectedSide);
  return { tx, slot, match, detail, guarded, run, edges: () => edges };
}

describe('부전승의 같은 경기 홈·어웨이 교환', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['bye-team', null])('배정 여부 %s: 팀·슬롯·위치·승자 연결만 바꾸고 후속 연결을 보존한다', async (registrationId) => {
    const s = setup(registrationId);
    const outgoing = { ...s.edges()[1] };
    await expect(s.run()).resolves.toMatchObject({ side: 'AWAY', sortOrder: 3 });
    expect(s.detail).toMatchObject({ homeRegistrationId: 'winner', awayRegistrationId: registrationId });
    expect(s.match).toMatchObject({ homeSlotId: null, awaySlotId: 'slot' });
    expect(s.edges()).toContainEqual(outgoing);
    expect(s.edges().find((edge) => edge.id === 'incoming')).toMatchObject({ sourceTeamMatchId: 'r2', targetTeamMatchId: 'q2', targetSide: 'HOME' });
    expect(s.slot).toMatchObject({ position: 2, byeSortOrder: 3 });
  });
  it('같은 요청 재시도는 다시 뒤집지 않는다', async () => {
    const s = setup();
    await s.run();
    await s.run();
    expect(updateTournamentMatchInTx).toHaveBeenCalledTimes(1);
  });
  it('어웨이에서 홈으로 되돌릴 수 있다', async () => {
    const s = setup(); await s.run(); await s.run('HOME', 'AWAY');
    expect(s.detail).toMatchObject({ homeRegistrationId: 'bye-team', awayRegistrationId: 'winner' });
    expect(s.slot.byeSortOrder).toBe(2);
  });
  it.each(['state', 'record', 'revision'])('후속 경기 %s가 있으면 변경 전에 차단한다', async (condition) => {
    const s = setup();
    if (condition === 'state') s.guarded[1].game.state = 'LIVE';
    if (condition === 'record') s.guarded[1].game._count.events = 1;
    if (condition === 'revision') s.guarded[1].game.resultRevisions = [{ id: 'revision' }];
    await expect(s.run()).rejects.toMatchObject({ response: { code: 'SLOT_LOCKED' } });
    expect(s.tx.v1TournamentMatchAdvancementEdge.delete).not.toHaveBeenCalled();
    expect(updateTournamentMatchInTx).not.toHaveBeenCalled();
  });
  it('다른 대회 슬롯은 거절한다', async () => {
    const s = setup(); s.slot.tournamentId = 'other';
    await expect(s.run()).rejects.toMatchObject({ response: { code: 'BYE_SIDE_INVALID' } });
    expect(updateTournamentMatchInTx).not.toHaveBeenCalled();
  });
});

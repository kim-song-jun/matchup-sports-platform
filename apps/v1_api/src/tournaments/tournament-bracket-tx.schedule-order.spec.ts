import type { Prisma } from '@prisma/client';
import type { V1ActiveAdmin } from '../common/admin-context.service';
import { updateTournamentFixtureInTx } from './tournament-bracket-tx';
import { updateTournamentMatchInTx } from './tournament-match-update';

// 일정 저장 본문은 따로 검증되고, 여기서는 PATCH 경로가 단계 순서 가드를 부르는지만 본다.
jest.mock('./tournament-match-update');
jest.mock('../common/admin-context.service', () => ({ ...jest.requireActual('../common/admin-context.service'), writeAdminActionLog: jest.fn() }));

const at = (hhmm: string) => new Date(`2026-10-10T${hhmm}:00.000Z`);
const ADMIN = { userId: 'admin-1' } as V1ActiveAdmin;

const stored = [
  { id: 'group-match', startAt: at('23:00'), tournamentDetails: { round: 'league_r1', group: { phase: 'group' } } },
  { id: 'final', startAt: at('23:40'), tournamentDetails: { round: '결승', group: { phase: 'final' } } },
];

function fakeTx() {
  const findFirst = jest.fn(async ({ where }: { where: { id: string } }) => stored.find((match) => match.id === where.id) ?? null);
  const findMany = jest.fn(async ({ where }: { where: { id: { not: string } } }) => stored.filter((match) => match.id !== where.id.not));
  return { tx: { v1TeamMatch: { findFirst, findMany } } as unknown as Prisma.TransactionClient, findFirst, findMany };
}

const update = (tx: Prisma.TransactionClient, scheduledAt?: Date | null) =>
  updateTournamentFixtureInTx(tx, ADMIN, { fixtureId: 'final', tournamentId: 't', groupId: null, scheduledAt });

describe('updateTournamentFixtureInTx 일정 단계 순서', () => {
  beforeEach(() => {
    jest.mocked(updateTournamentMatchInTx).mockReset();
    jest.mocked(updateTournamentMatchInTx).mockResolvedValue({ startedTeamChange: null, startAt: null } as never);
  });

  it('결승 시각을 조별 경기보다 이르게 보내면 409 로 막고 저장하지 않는다', async () => {
    const { tx } = fakeTx();
    await expect(update(tx, at('22:00'))).rejects.toMatchObject({ response: { code: 'FIXTURE_SCHEDULE_STAGE_ORDER' } });
    expect(updateTournamentMatchInTx).not.toHaveBeenCalled();
  });

  it('단계 순서를 지키는 시각은 저장 단계로 넘긴다', async () => {
    const { tx } = fakeTx();
    await update(tx, at('23:50'));
    expect(updateTournamentMatchInTx).toHaveBeenCalledWith(tx, expect.objectContaining({ scheduledAt: at('23:50') }));
  });

  it.each([['미전송', undefined], ['null(시각 비우기)', null]])('시각이 %s 이면 가드를 거치지 않고 저장한다', async (_label, scheduledAt) => {
    const { tx, findFirst, findMany } = fakeTx();
    await update(tx, scheduledAt);
    expect(findFirst).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(updateTournamentMatchInTx).toHaveBeenCalledTimes(1);
  });
});

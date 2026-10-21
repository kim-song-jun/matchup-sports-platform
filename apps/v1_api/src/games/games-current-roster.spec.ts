import type { Prisma } from '@prisma/client';
import { GamesService } from './games.service';

/** append와 retry가 공유하는 실제 이벤트 검증 경로를 실행한다. */
describe('GamesService 경기 기록 출전 명단 경계', () => {
  it.each(['GOAL', 'FOUL', 'CARD'])('%s는 같은 경기의 이전 명단 선수도 거부한다', async (type) => {
    const service = Object.create(GamesService.prototype) as {
      assertEventReferences: (tx: Prisma.TransactionClient, game: unknown, dto: unknown) => Promise<unknown>;
    };
    const tx = {
      v1GamePeriod: { findFirst: jest.fn().mockResolvedValue({ state: 'LIVE' }) },
      v1GameSide: { findFirst: jest.fn().mockResolvedValue({ id: 'home' }) },
      v1GameParticipant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'excluded', sideId: 'home', lineupId: 'old' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'excluded', sideId: 'home', lineupId: 'old' }]),
      },
      v1GameLineup: { findMany: jest.fn().mockResolvedValue([
        { id: 'old', sideId: 'home', revision: 1, state: 'SUBMITTED', invalidatedAt: null },
        { id: 'current', sideId: 'home', revision: 2, state: 'SUBMITTED', invalidatedAt: null },
      ]) },
    } as unknown as Prisma.TransactionClient;
    await expect(service.assertEventReferences(tx,
      { id: 'game', sourceType: 'TOURNAMENT_FIXTURE' },
      { type, participantId: 'excluded', sideId: 'home', period: 1, payload: {} },
    )).rejects.toMatchObject({ response: { code: 'PARTICIPANT_NOT_IN_CURRENT_ROSTER' } });
  });
});

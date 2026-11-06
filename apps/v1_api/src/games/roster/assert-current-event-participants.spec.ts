import type { Prisma } from '@prisma/client';
import { assertCurrentEventParticipants } from './assert-current-event-participants';

describe('경기 기록의 현재 출전 명단 검증', () => {
  const current = { id: 'current', sideId: 'home', revision: 2, state: 'SUBMITTED', invalidatedAt: null };
  function setup(rows: Array<{ id: string; sideId: string; lineupId: string }>, lineups: unknown[] = [
    { ...current, id: 'old', revision: 1 }, current,
  ]) {
    const tx = {
      v1GameLineup: { findMany: jest.fn().mockResolvedValue(lineups) },
      v1GameParticipant: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return tx as unknown as Prisma.TransactionClient;
  }

  it('새 기록에 이전 명단 참가자 ID를 재사용할 수 없다', async () => {
    const tx = setup([{ id: 'excluded-player', sideId: 'home', lineupId: 'old' }]);
    await expect(assertCurrentEventParticipants(tx, 'game', ['excluded-player'])).rejects.toMatchObject({
      response: { code: 'PARTICIPANT_NOT_IN_CURRENT_ROSTER' },
    });
  });

  it('최신 출전 명단의 선수는 도착 검인 없이 사용할 수 있다', async () => {
    const tx = setup([{ id: 'player', sideId: 'home', lineupId: 'current' }]);
    await expect(assertCurrentEventParticipants(tx, 'game', ['player', null])).resolves.toBeUndefined();
  });

  it('득점자는 유효해도 도움 선수가 제외됐으면 거부한다', async () => {
    const tx = setup([{ id: 'scorer', sideId: 'home', lineupId: 'current' }, { id: 'assist', sideId: 'home', lineupId: 'old' }]);
    await expect(assertCurrentEventParticipants(tx, 'game', ['scorer', 'assist'])).rejects.toMatchObject({
      response: { code: 'PARTICIPANT_NOT_IN_CURRENT_ROSTER' },
    });
  });

  it('다른 경기 선수나 무효화된 사이드 명단도 사용할 수 없다', async () => {
    await expect(assertCurrentEventParticipants(setup([]), 'game', ['foreign'])).rejects.toThrow();
    await expect(assertCurrentEventParticipants(setup([{ id: 'player', sideId: 'home', lineupId: 'current' }], [{ ...current, invalidatedAt: new Date() }]), 'game', ['player'])).rejects.toThrow();
  });

  it('참가자 없는 팀 기록은 불필요한 명단 조회 없이 유지한다', async () => {
    const tx = setup([]);
    await assertCurrentEventParticipants(tx, 'game', [undefined, null]);
    expect(tx.v1GameLineup.findMany).not.toHaveBeenCalled();
  });
});

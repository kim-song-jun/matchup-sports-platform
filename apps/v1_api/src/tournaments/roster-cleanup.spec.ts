import { Prisma } from '@prisma/client';
import { removeUserFromActiveRosters } from './roster-cleanup';

describe('removeUserFromActiveRosters', () => {
  it('does not overwrite a concurrent removal and returns the actual update count', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'player-1' }, { id: 'player-2' }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      v1TournamentPlayer: { findMany, updateMany },
    } as unknown as Prisma.TransactionClient;
    const removedAt = new Date('2026-08-07T00:00:00.000Z');

    const count = await removeUserFromActiveRosters(tx, 'user-1', {
      teamId: 'team-1',
      at: removedAt,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['player-1', 'player-2'] },
        removedAt: null,
      },
      data: { removedAt },
    });
    expect(count).toBe(1);
  });

  // 파일 상단 주석(2026-08-03 프로덕션 사고 재발 방지): 잠긴 명단(rosterLockedAt)에서도
  // 정리는 그대로 진행되지만, 그 사실이 감사 로그에 남아야 대회 운영진이 확정·인쇄된
  // 출전 명단이 조용히 줄어든 것을 알 수 있다. 이 분기는 findMany가 반환하는 각 행에
  // `registration.rosterLockedAt`가 실려 있어야만 진입한다 — mock을 얕게(`{id}`만) 두면
  // `target.registration?.rosterLockedAt`가 항상 undefined라 이 분기를 아예 못 타면서도
  // 위 테스트는 통과해 버린다. 여기서는 실제 select 형태(registration: {rosterLockedAt,
  // tournamentId})를 그대로 채운 픽스처로 잠금/비잠금을 섞어 분기를 검증한다.
  it('잠긴 신청건에서 선수가 제거되면 V1StatusChangeLog에 감사 행을 남긴다', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'player-locked',
        registrationId: 'reg-locked',
        registration: { rosterLockedAt: new Date('2026-08-01T00:00:00.000Z'), tournamentId: 'tournament-1' },
      },
      {
        id: 'player-unlocked',
        registrationId: 'reg-unlocked',
        registration: { rosterLockedAt: null, tournamentId: 'tournament-1' },
      },
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      v1TournamentPlayer: { findMany, updateMany },
      v1StatusChangeLog: { createMany },
    } as unknown as Prisma.TransactionClient;
    const removedAt = new Date('2026-08-07T00:00:00.000Z');

    const count = await removeUserFromActiveRosters(tx, 'user-1', { at: removedAt });

    expect(count).toBe(2);
    // 잠긴 신청건(reg-locked)만 감사 행이 생성되고, 잠기지 않은 신청건(reg-unlocked)은
    // 조용히 정리만 된다 — 감사 로그는 "잠금 우회"라는 예외적 사실에만 붙는다.
    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          targetType: 'tournament_registration',
          targetId: 'reg-locked',
          fromStatus: 'roster_locked',
          toStatus: 'roster_locked_player_removed_via_membership_cleanup',
          reason: expect.stringContaining('player=player-locked'),
        }),
      ],
    });
  });

  it('잠긴 신청건이 없으면 감사 로그를 남기지 않는다', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'player-unlocked',
        registrationId: 'reg-unlocked',
        registration: { rosterLockedAt: null, tournamentId: 'tournament-1' },
      },
    ]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createMany = jest.fn();
    const tx = {
      v1TournamentPlayer: { findMany, updateMany },
      v1StatusChangeLog: { createMany },
    } as unknown as Prisma.TransactionClient;

    await removeUserFromActiveRosters(tx, 'user-1', { at: new Date('2026-08-07T00:00:00.000Z') });

    expect(createMany).not.toHaveBeenCalled();
  });
});

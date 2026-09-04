import { ConflictException } from '@nestjs/common';
import { assertJerseyAvailable, readJerseyNumbers } from './tournament-player-jersey';

function fakeClient(rows: unknown[]) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as never;
}

describe('등번호 헬퍼', () => {
  it('번호 없는 선수는 맵에 아예 넣지 않는다 — null 을 0 으로 오해하지 않게', () => {
    // `0` 은 유효한 등번호다. 없는 것을 0 으로 채우면 0번을 단 선수와 구분이 사라진다.
    return expect(
      readJerseyNumbers(
        fakeClient([
          { id: 'p1', jersey_number: null },
          { id: 'p2', jersey_number: 0 },
        ]),
        'reg-1',
      ),
    ).resolves.toEqual(new Map([['p2', 0]]));
  });

  it('같은 팀에 그 번호가 있으면 409 로 막는다', async () => {
    await expect(assertJerseyAvailable(fakeClient([{ id: 'other' }]), 'reg-1', 7)).rejects.toMatchObject({
      response: { code: 'ROSTER_DUPLICATE_JERSEY_NUMBER' },
    });
    await expect(assertJerseyAvailable(fakeClient([{ id: 'other' }]), 'reg-1', 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('자기 자신이 이미 그 번호를 달고 있으면 막지 않는다 — 제외 후 재추가가 자기 번호에 걸리면 안 된다', async () => {
    await expect(
      assertJerseyAvailable(fakeClient([{ id: 'me' }]), 'reg-1', 7, 'me'),
    ).resolves.toBeUndefined();
  });

  it('아무도 안 달았으면 통과한다', async () => {
    await expect(assertJerseyAvailable(fakeClient([]), 'reg-1', 7)).resolves.toBeUndefined();
  });
});

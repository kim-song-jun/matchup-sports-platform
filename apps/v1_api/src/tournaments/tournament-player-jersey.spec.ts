import { ConflictException } from '@nestjs/common';
import { assertJerseyAvailable, readJerseyNumbers } from './tournament-player-jersey';

/**
 * DB 를 흉내 내는 fake — **쿼리에 실린 값으로 실제 필터링을 한다.**
 *
 * 단순히 정해진 배열을 돌려주는 fake 를 쓰면, 제외를 SQL 이 하든 JS 가 하든 결과가 같아
 * 이 파일의 핵심 회귀(플래너가 자기 행을 먼저 주면 중복을 놓치는 것)를 재현할 수 없다.
 * 그래서 `LIMIT 1` 을 **필터를 적용한 뒤** 적용한다 — 실제 DB 와 같은 순서다.
 */
function fakeDb(rows: Array<{ id: string; jersey: number }>) {
  return {
    $queryRaw: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      // 값 순서: registrationId, jerseyNumber, [excludePlayerId]
      const jersey = values[1] as number;
      const exclude = sql.includes('id <>') ? (values[2] as string) : undefined;
      const matched = rows
        .filter((row) => row.jersey === jersey)
        .filter((row) => (exclude === undefined ? true : row.id !== exclude));
      // LIMIT 1 — 정렬이 없으므로 "어느 행이 먼저 오는지" 는 보장되지 않는다.
      // 자기 행을 먼저 두어 옛 구현(JS 제외)이 실제로 놓치는 순서를 만든다.
      return Promise.resolve(matched.slice(0, 1).map((row) => ({ id: row.id })));
    }),
    $executeRaw: jest.fn().mockResolvedValue(1),
  } as never;
}

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
    // 제외가 SQL 에 있으므로 fake 도 DB 처럼 걸러야 의미가 있다.
    await expect(
      assertJerseyAvailable(fakeDb([{ id: 'me', jersey: 7 }]), 'reg-1', 7, 'me'),
    ).resolves.toBeUndefined();
  });

  it('아무도 안 달았으면 통과한다', async () => {
    await expect(assertJerseyAvailable(fakeClient([]), 'reg-1', 7)).resolves.toBeUndefined();
  });
});

/**
 * 2026-09-04 Copilot 리뷰가 짚은 자리. 제외를 JS 에서 하면 `LIMIT 1` 이 **필터 전** 한 행을
 * 집어 오므로, 같은 번호를 가진 행이 둘(자기 + 남)일 때 자기 행이 먼저 오면 중복이 통과한다.
 */
describe('등번호 중복 — 자기 행이 먼저 오는 순서', () => {
  it('자기 행과 타인 행이 같은 번호면, 자기 행이 먼저 와도 409 로 막는다', async () => {
    await expect(
      assertJerseyAvailable(
        fakeDb([
          { id: 'me', jersey: 7 },
          { id: 'other', jersey: 7 },
        ]),
        'reg-1',
        7,
        'me',
      ),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_DUPLICATE_JERSEY_NUMBER' } });
  });

  it('자기 행만 그 번호를 갖고 있으면 통과한다 (회귀 방지)', async () => {
    await expect(
      assertJerseyAvailable(fakeDb([{ id: 'me', jersey: 7 }]), 'reg-1', 7, 'me'),
    ).resolves.toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { mergeByFixtureId } from './merge-board-pages';

describe('mergeByFixtureId', () => {
  it('같은 경기가 두 번 오면 나중 것이 이기고 자리는 처음 등장한 곳을 지킨다', () => {
    const merged = mergeByFixtureId([
      { fixtureId: 'a', state: 'LIVE' },
      { fixtureId: 'b', state: 'LIVE' },
      { fixtureId: 'a', state: 'ENDED' },
    ]);
    expect(merged).toEqual([
      { fixtureId: 'a', state: 'ENDED' },
      { fixtureId: 'b', state: 'LIVE' },
    ]);
  });

  it('겹치지 않으면 그대로다', () => {
    expect(mergeByFixtureId([{ fixtureId: 'a' }, { fixtureId: 'b' }])).toEqual([{ fixtureId: 'a' }, { fixtureId: 'b' }]);
  });
});

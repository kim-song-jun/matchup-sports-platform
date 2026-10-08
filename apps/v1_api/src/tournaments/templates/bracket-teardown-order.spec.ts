import { orderFixturesForTeardown } from './bracket-teardown-order';

const edge = (sourceTeamMatchId: string, targetTeamMatchId: string) => ({ sourceTeamMatchId, targetTeamMatchId });

describe('orderFixturesForTeardown', () => {
  it('8강 대진: 결승·3·4위전 → 4강 → 8강 순서로, 연결 대상이 항상 먼저 지워진다', () => {
    const ids = ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'final', 'third'];
    const edges = [
      edge('q1', 's1'), edge('q2', 's1'), edge('q3', 's2'), edge('q4', 's2'),
      edge('s1', 'final'), edge('s2', 'final'), edge('s1', 'third'), edge('s2', 'third'),
    ];
    const order = orderFixturesForTeardown(ids, edges);
    expect(order).toHaveLength(8);
    for (const { sourceTeamMatchId, targetTeamMatchId } of edges) {
      expect(order.indexOf(targetTeamMatchId)).toBeLessThan(order.indexOf(sourceTeamMatchId));
    }
  });

  it('연결이 없는 경기(리그)는 id 오름차순이다', () => {
    expect(orderFixturesForTeardown(['c', 'a', 'b'], [])).toEqual(['a', 'b', 'c']);
  });

  it('입력 순서가 달라도 결과가 같다', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(orderFixturesForTeardown(['a', 'b', 'c'], edges)).toEqual(orderFixturesForTeardown(['c', 'a', 'b'], edges));
    expect(orderFixturesForTeardown(['a', 'b', 'c'], edges)).toEqual(['c', 'b', 'a']);
  });

  it('지우는 집합 밖의 경기로 가는 연결은 순서를 막지 않는다(대조군)', () => {
    expect(orderFixturesForTeardown(['a', 'b'], [edge('a', 'outside'), edge('outside', 'b')])).toEqual(['a', 'b']);
  });

  it('연결에 순환이 있으면 조용히 넘기지 않고 던진다', () => {
    expect(() => orderFixturesForTeardown(['a', 'b'], [edge('a', 'b'), edge('b', 'a')])).toThrow('cycle');
  });
});

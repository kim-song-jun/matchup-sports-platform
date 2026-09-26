import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { findInListCache } from './list-cache-seed';

type Item = { id: string; title: string };

const PREFIX = ['v1', 'matches'] as const;

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('findInListCache', () => {
  it('목록 캐시에 있는 항목을 찾아 준다', () => {
    const qc = client();
    qc.setQueryData([...PREFIX, {}], { items: [{ id: 'a', title: '첫 매치' }, { id: 'b', title: '둘째 매치' }] });

    const found = findInListCache<Item>(qc, PREFIX, (item) => item.id === 'b');

    expect(found?.title).toBe('둘째 매치');
  });

  it('필터가 다른 여러 목록 캐시를 모두 훑는다', () => {
    const qc = client();
    qc.setQueryData([...PREFIX, { sportId: 'futsal' }], { items: [{ id: 'a', title: '풋살' }] });
    qc.setQueryData([...PREFIX, { sportId: 'soccer' }], { items: [{ id: 'b', title: '축구' }] });

    expect(findInListCache<Item>(qc, PREFIX, (i) => i.id === 'b')?.title).toBe('축구');
  });

  it('접두사를 공유하는 상세 캐시(`[...prefix, id]`)를 목록으로 오인하지 않는다', () => {
    const qc = client();
    // 상세 응답은 items 가 없다 — 이걸 목록으로 읽으면 런타임에서 터진다.
    qc.setQueryData([...PREFIX, 'a'], { id: 'a', title: '상세 응답' });

    expect(() => findInListCache<Item>(qc, PREFIX, (i) => i.id === 'a')).not.toThrow();
    expect(findInListCache<Item>(qc, PREFIX, (i) => i.id === 'a')).toBeUndefined();
  });

  it('캐시에 없으면 undefined 를 준다', () => {
    expect(findInListCache<Item>(client(), PREFIX, () => true)).toBeUndefined();
  });
});

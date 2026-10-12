import { describe, expect, it } from 'vitest';
import { TEAM_LIST_PAGE_SIZE, TEAM_LIST_SEED_PATH } from './public-list-seed';

describe('TEAM_LIST_SEED_PATH', () => {
  it('클라이언트 첫 페이지 요청과 같이 includeFacets 를 보내 시드 첫 렌더에도 totalCount 가 실린다', () => {
    const [path, query] = TEAM_LIST_SEED_PATH.split('?');
    const params = new URLSearchParams(query);

    expect(path).toBe('/teams');
    expect(params.get('limit')).toBe(String(TEAM_LIST_PAGE_SIZE));
    expect(params.get('includeFacets')).toBe('true');
  });
});

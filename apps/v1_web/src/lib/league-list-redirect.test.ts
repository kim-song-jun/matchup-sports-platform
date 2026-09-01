import { describe, expect, it } from 'vitest';
import { buildLeagueListRedirect } from './league-list-redirect';

/**
 * 사용자 확정: *"목록을 넘길 때 **고른 상태도 함께** 넘겨줘 — 진행 중을 보던 사람은
 * 넘어가서도 진행 중"*. 그래서 쿼리를 버리지 않고 옮긴다.
 */
describe('buildLeagueListRedirect', () => {
  it('아무것도 없으면 리그 탭으로만 보낸다', () => {
    expect(buildLeagueListRedirect({})).toBe('/tournaments?kind=league');
  });

  /**
   * **축마다 이름이 다르다.** `active` 를 그대로 실어 보내면 서버가 400 이고,
   * 리다이렉트 직후의 에러는 원인이 가장 안 보인다 — 사용자는 자기가 누른 링크가
   * 깨졌다고 생각한다.
   */
  it('active 는 in_progress 로 옮긴다 — 그대로 넘기면 400 이다', () => {
    expect(buildLeagueListRedirect({ state: 'active' })).toBe(
      '/tournaments?kind=league&status=in_progress',
    );
  });

  it('draft·completed 는 이름이 같아 그대로 간다', () => {
    expect(buildLeagueListRedirect({ state: 'draft' })).toContain('status=draft');
    expect(buildLeagueListRedirect({ state: 'completed' })).toContain('status=completed');
  });

  it('종목도 함께 옮긴다 — 이름도 값도 같다', () => {
    expect(buildLeagueListRedirect({ state: 'active', sportId: 's-futsal' })).toBe(
      '/tournaments?kind=league&status=in_progress&sportId=s-futsal',
    );
  });

  it('모르는 상태는 버리고 목록은 연다 — 옛 링크가 죽으면 안 된다', () => {
    expect(buildLeagueListRedirect({ state: 'archived' })).toBe('/tournaments?kind=league');
    expect(buildLeagueListRedirect({ state: 'open' })).toBe('/tournaments?kind=league');
  });

  it('프로토타입 키도 버린다 — URL 은 사용자 입력이다', () => {
    expect(buildLeagueListRedirect({ state: 'toString' })).toBe('/tournaments?kind=league');
    expect(buildLeagueListRedirect({ state: '__proto__' })).toBe('/tournaments?kind=league');
  });

  it('빈 문자열은 없는 것과 같다 — 그대로 실으면 서버가 400 이다', () => {
    expect(buildLeagueListRedirect({ state: '', sportId: '' })).toBe('/tournaments?kind=league');
  });

  /**
   * `?state=a&state=b` 처럼 같은 키가 두 번 오면 Next 가 배열을 준다. 문자열로 만들면
   * `"a,b"` 가 되어 아무 매핑에도 안 맞는다 — 조용히 첫 값을 쓰는 편이 링크를 살린다.
   */
  it('같은 키가 두 번 와도 첫 값으로 살린다', () => {
    expect(buildLeagueListRedirect({ state: ['active', 'draft'] })).toContain('status=in_progress');
    expect(buildLeagueListRedirect({ sportId: ['s-futsal', 's-basket'] })).toContain(
      'sportId=s-futsal',
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLeagueMatchDetailPage from './page';

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect }));

async function open(searchParams: Record<string, string | string[] | undefined> = {}) {
  await AdminLeagueMatchDetailPage({
    params: Promise.resolve({ leagueId: 'league-1' }),
    searchParams: Promise.resolve(searchParams),
  });
  return new URL(String(redirect.mock.calls.at(-1)?.[0]), 'http://localhost');
}

describe('리그 상세 기본 진입', () => {
  beforeEach(() => redirect.mockClear());

  it('주소는 그대로 두고 일정 섹션으로 보낸다 — 목록·시리즈·팀매치·운영 콘솔이 이 주소로 링크한다', async () => {
    const target = await open();

    expect(target.pathname).toBe('/admin/league-matches/league-1/schedule');
    expect(target.search).toBe('');
  });

  it('목록 출처(from)와 보기(view)를 그대로 이어 준다', async () => {
    const from = '/admin/league-matches?seriesId=series-1&from=%2Fadmin';
    const target = await open({ from, view: 'list' });

    expect(target.searchParams.get('from')).toBe(from);
    expect(target.searchParams.get('view')).toBe('list');
  });

  it('같은 키가 여러 번 와도 버리지 않고 이어 준다 — 믿을지는 셸이 정한다', async () => {
    const target = await open({ from: ['/admin/league-matches', '//evil.example'] });

    expect(target.searchParams.getAll('from')).toEqual(['/admin/league-matches', '//evil.example']);
  });
});

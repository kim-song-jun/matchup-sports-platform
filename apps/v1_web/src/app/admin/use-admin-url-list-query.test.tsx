import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAdminListReturnHref, useAdminUrlListQuery } from './use-admin-url-list-query';

const navigation = vi.hoisted(() => ({ querySnapshot: null as string | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(navigation.querySnapshot ?? window.location.search),
}));

const STATUSES = [{ value: '' }, { value: 'active' }, { value: 'suspended' }] as const;

function TeamsList() {
  const list = useAdminUrlListQuery(STATUSES, 20);
  return (
    <>
      <button type="button" onClick={() => list.setActiveStatus('active')}>활성</button>
      <button type="button" onClick={() => list.setPage(3)}>3페이지</button>
    </>
  );
}

afterEach(() => {
  navigation.querySnapshot = null;
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('관리자 목록 조건의 상세 왕복 (MD-QA #21)', () => {
  it('목록 조건을 바꿀 때마다 그 주소를 기억하고, 상세의 목록 버튼이 그 주소로 돌아간다', () => {
    window.history.replaceState(null, '', '/admin/teams?q=E2E');
    navigation.querySnapshot = window.location.search;
    const { unmount } = render(<TeamsList />);
    act(() => screen.getByRole('button', { name: '활성' }).click());
    act(() => screen.getByRole('button', { name: '3페이지' }).click());
    expect(window.location.search).toBe('?q=E2E&status=active&page=3');
    expect(navigation.querySnapshot).toBe('?q=E2E');
    unmount();

    // 상세로 이동한 뒤 — 목록 버튼은 마지막으로 본 목록 주소다.
    window.history.replaceState(null, '', '/admin/teams/team-1');
    const { result } = renderHook(() => useAdminListReturnHref('/admin/teams'));
    expect(result.current).toBe('/admin/teams?q=E2E&status=active&page=3');
  });

  it('기억된 주소가 없거나 다른 경로면 조건 없는 목록으로 돌아간다', () => {
    expect(renderHook(() => useAdminListReturnHref('/admin/users')).result.current).toBe('/admin/users');

    window.sessionStorage.setItem('teameet.admin.listReturn:/admin/users', 'https://example.com/admin/users');
    expect(renderHook(() => useAdminListReturnHref('/admin/users')).result.current).toBe('/admin/users');
    window.sessionStorage.setItem('teameet.admin.listReturn:/admin/users', '/admin/users-archive?q=x');
    expect(renderHook(() => useAdminListReturnHref('/admin/users')).result.current).toBe('/admin/users');
  });

  it('주소의 조건으로 다시 열면 검색·상태·페이지가 그대로고, 허용 목록에 없는 상태는 전체다', () => {
    window.history.replaceState(null, '', '/admin/teams?q=E2E&status=active&page=3');
    expect(renderHook(() => useAdminUrlListQuery(STATUSES, 20)).result.current.filters).toEqual({ q: 'E2E', status: 'active', page: 3, limit: 20 });

    window.history.replaceState(null, '', '/admin/teams?status=typo');
    expect(renderHook(() => useAdminUrlListQuery(STATUSES, 20)).result.current.filters).toEqual({ page: 1, limit: 20 });
  });
});

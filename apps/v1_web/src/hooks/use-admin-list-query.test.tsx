import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminListQuery } from './use-admin-list-query';

describe('useAdminListQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces the search input by 300ms and trims it into filters.q', () => {
    const { result } = renderHook(() => useAdminListQuery());

    act(() => result.current.setSearch('  홍길동 '));
    // debounce 전에는 q가 비어 있어야 한다
    expect(result.current.filters.q).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.debouncedSearch).toBe('홍길동');
    expect(result.current.filters).toEqual({ q: '홍길동', page: 1, limit: 20 });
  });

  it('resets to page 1 when the status filter or debounced search changes', () => {
    const { result } = renderHook(() => useAdminListQuery({ initialStatus: 'active' }));

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    act(() => result.current.setActiveStatus('suspended'));
    expect(result.current.page).toBe(1);
    expect(result.current.filters).toEqual({ status: 'suspended', page: 1, limit: 20 });

    act(() => result.current.setPage(2));
    act(() => result.current.setSearch('kim'));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.page).toBe(1);
  });

  it('omits empty q/status keys entirely so the API does not receive blank params', () => {
    const { result } = renderHook(() => useAdminListQuery({ pageSize: 50 }));
    expect(result.current.filters).toEqual({ page: 1, limit: 50 });
    expect('q' in result.current.filters).toBe(false);
    expect('status' in result.current.filters).toBe(false);
  });

  it('buildPagination returns undefined without totalPages and assembles props otherwise', () => {
    const { result } = renderHook(() => useAdminListQuery());

    expect(result.current.buildPagination(undefined, false)).toBeUndefined();
    expect(result.current.buildPagination({ total: 0 }, false)).toBeUndefined();

    const pagination = result.current.buildPagination(
      { page: 2, totalPages: 5, total: 96, limit: 20 },
      true,
    );
    expect(pagination).toMatchObject({ page: 2, totalPages: 5, total: 96, limit: 20, loading: true });

    act(() => pagination!.onPageChange(4));
    expect(result.current.page).toBe(4);
  });
});

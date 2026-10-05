import { useSyncExternalStore } from 'react';
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistoryRouter, nextPopState } from '@/test/history-router';
import { installActualNextReplaceBoundary } from '@/test/helpers/next-history-boundary';
import type { AdminListFilters, V1AdminInquiryRow } from '@/types/api';
import AdminInquiriesPage from './page';

const state = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn(), error: false }));
const router = createHistoryRouter();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => window.location.pathname,
  useSearchParams: () => {
    const query = useSyncExternalStore(
      (notify) => {
        window.addEventListener('popstate', notify);
        return () => window.removeEventListener('popstate', notify);
      },
      () => window.location.search,
    );
    return new URLSearchParams(query);
  },
}));

type LinkProps = ComponentProps<'a'> & { readonly href: string; readonly prefetch?: boolean };
// Only Next's navigation boundary is replaced; the rendered links use real history entries.
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, prefetch: _prefetch, ...props }: LinkProps) => (
    <a {...props} href={href} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      event.preventDefault();
      router.push(href);
    }}>{children}</a>
  ),
}));

const row: V1AdminInquiryRow = {
  inquiryId: 'synthetic-inquiry', userId: 'synthetic-admin', isGuest: false,
  requesterName: '합성 사용자', requesterEmail: null, guestEmail: null, guestPhone: null,
  title: '합성 QA 문의', category: 'report', status: 'received', relatedType: null,
  relatedId: null, reportReason: 'spam', replyCount: 0, closedAt: null, purgedAt: null,
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: undefined }),
  useV1AdminGuestInquiryPurgeCandidates: () => ({
    data: { retentionDays: 365, total: 0, items: [] }, isError: false,
  }),
  useV1PurgeGuestInquiries: () => ({ mutate: vi.fn(), isPending: false }),
  useV1AdminInquiries: (filters: AdminListFilters) => {
    state.query(filters);
    const matches = (!filters.q || row.title.includes(filters.q))
      && (!filters.status || filters.status === row.status)
      && (!filters.category || filters.category === row.category)
      && (!filters.reportReason || filters.reportReason === row.reportReason);
    return {
      data: {
        items: matches ? [row] : [],
        pageInfo: { page: filters.page, totalPages: 3, total: 41, limit: 20 },
        summary: {
          total: 1, byStatus: { received: 1 }, byCategory: { report: 1 },
          byReportReason: { spam: 1 }, reportReasonTotal: 1,
        },
      },
      isPending: false, isFetching: false, isError: state.error,
      error: state.error ? new Error('문의 조회 권한이 없어요.') : null, refetch: state.refetch,
    };
  },
}));

const searchInput = () => screen.getByLabelText('문의 검색');
const params = () => new URLSearchParams(window.location.search);
const detailPath = `/admin/inquiries/${row.inquiryId}`;
let restoreNextBoundary: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  state.error = false;
  window.history.replaceState(null, '', '/admin/inquiries');
});
afterEach(() => {
  cleanup();
  restoreNextBoundary?.();
  restoreNextBoundary = undefined;
  vi.useRealTimers();
});

describe('문의 검색 입력과 상세 왕복의 URL 계약', () => {
  it.each([0, 300])('입력 후 %sms에 상세를 열어도 실제 Back/Forward에서 검색을 보존한다', async (elapsed) => {
    // Given: a visible inquiry before the search API debounce finishes.
    vi.useFakeTimers();
    const view = render(<AdminInquiriesPage />);
    fireEvent.change(searchInput(), { target: { value: 'QA' } });
    act(() => vi.advanceTimersByTime(elapsed));

    // When: open the rendered detail link and traverse the actual history.
    fireEvent.click(screen.getAllByRole('link', { name: '조회' })[0]);
    expect(window.location.pathname).toBe(detailPath);
    view.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(window.location.pathname).toBe(detailPath);
    vi.useRealTimers();
    const back = nextPopState();
    window.history.back();
    await back;
    const returned = render(<AdminInquiriesPage />);

    // Then: the input, query, and matching rows are restored together.
    expect(searchInput()).toHaveValue('QA');
    expect(params().get('q')).toBe('QA');
    expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
    returned.unmount();
    const forward = nextPopState();
    window.history.forward();
    await forward;
    expect(window.location.pathname).toBe(detailPath);
  });

  it('빠른 연속 입력과 신고 필터를 합치고 API에만 300ms debounce를 적용한다', () => {
    // Given: the unfiltered list and its existing history entry.
    vi.useFakeTimers();
    const length = window.history.length;
    render(<AdminInquiriesPage />);

    // When: multiple inputs occur before Next has a fresh URL snapshot.
    act(() => {
      fireEvent.change(searchInput(), { target: { value: 'Q' } });
      fireEvent.click(screen.getByRole('button', { name: '접수 1' }));
      fireEvent.change(screen.getByLabelText('문의 분류 필터'), { target: { value: 'report' } });
      fireEvent.change(searchInput(), { target: { value: 'QA' } });
    });
    fireEvent.change(screen.getByLabelText('신고 사유 필터'), { target: { value: 'spam' } });

    // Then: URL persistence is immediate; API search still waits for the timer.
    expect(params().get('q')).toBe('QA');
    expect(params().get('status')).toBe('received');
    expect(params().get('category')).toBe('report');
    expect(params().get('reportReason')).toBe('spam');
    expect(window.history.length).toBe(length);
    expect(state.query.mock.lastCall?.[0].q).toBeUndefined();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
    expect(state.query).toHaveBeenLastCalledWith({
      q: 'QA', status: 'received', category: 'report', reportReason: 'spam', page: 1, limit: 20,
    });
  });

  it('마운트 중 URL 복원은 입력과 필터를 복원하고 이전 debounce가 URL을 덮지 않는다', () => {
    // Given: a pending local search.
    vi.useFakeTimers();
    render(<AdminInquiriesPage />);
    fireEvent.change(searchInput(), { target: { value: '오래된 검색' } });

    // When: browser traversal restores another list entry without remounting.
    act(() => {
      window.history.pushState(null, '', '/admin/inquiries?q=QA&category=report&reportReason=spam');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    // Then: the restored URL controls the list and invalidates the old timer.
    expect(searchInput()).toHaveValue('QA');
    expect(screen.getByLabelText('신고 사유 필터')).toHaveValue('spam');
    expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(300));
    expect(params().get('q')).toBe('QA');
    expect(state.query.mock.lastCall?.[0].q).toBe('QA');
  });

  it('검색 비우기는 즉시 URL에서 삭제하고 페이지는 기존처럼 URL에 저장하지 않는다', () => {
    // Given: a deep linked search and a later pagination page.
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/admin/inquiries?q=QA');
    render(<AdminInquiriesPage />);
    fireEvent.click(screen.getByRole('button', { name: '3페이지' }));

    // When: clear the search before another debounce cycle finishes.
    fireEvent.change(searchInput(), { target: { value: '' } });

    // Then: no stale query is left in browser history and the list resets.
    expect(params().has('q')).toBe(false);
    expect(params().has('page')).toBe(false);
    act(() => vi.advanceTimersByTime(300));
    expect(searchInput()).toHaveValue('');
    expect(state.query).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
  });

  it('설치된 Next history 경계에서도 내부 router state를 보존하며 검색을 즉시 저장한다', () => {
    // Given: the actual installed Next history patch and an existing router tree.
    const tree = { synthetic: 'inquiry-router-tree' };
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: tree }, '', '/admin/inquiries');
    const restore = vi.fn();
    restoreNextBoundary = installActualNextReplaceBoundary(restore);
    render(<AdminInquiriesPage />);

    // When: type before the search debounce can finish.
    fireEvent.change(searchInput(), { target: { value: 'QA' } });

    // Then: URL and Next's restoration action receive the input immediately.
    expect(params().get('q')).toBe('QA');
    expect(restore.mock.lastCall?.[0].url.searchParams.get('q')).toBe('QA');
    expect(window.history.state.__NA).toBe(true);
    expect(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(tree);
  });

  it('API 권한 오류는 검색 조건을 유지하고 오류와 재시도를 보여준다', () => {
    // Given: a protected search URL whose API rejects access.
    window.history.replaceState(null, '', '/admin/inquiries?q=QA');
    state.error = true;
    render(<AdminInquiriesPage />);

    // When / Then: the failure remains visible instead of becoming an empty success.
    expect(searchInput()).toHaveValue('QA');
    expect(screen.getByText('문의 조회 권한이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('문의가 없어요')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});

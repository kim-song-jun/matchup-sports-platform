import { useSyncExternalStore } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHistoryRouter, nextPopState } from '@/test/history-router';
import type { V1AdminMatchRow } from '@/types/api';
import AdminMatchesPage from './page';

const state = vi.hoisted(() => ({
  query: vi.fn(), refetch: vi.fn(), mutate: vi.fn(), error: false, canWrite: false, mixed: false,
}));
const router = createHistoryRouter();
vi.mock('next/navigation', () => ({
  useRouter: () => router,
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

const row: V1AdminMatchRow = {
  matchId: 'abc11044-1e5e-4657-a390-589d2daa4eb3', title: '(테스트) 1.0.3 QA 수명주기',
  sportName: '풋살', sportCode: 'futsal', hostUserId: 'synthetic-host', hostName: 'QA 호스트',
  placeName: 'QA 구장', startAt: '2026-10-01T09:00:00Z', status: 'completed',
  participantCount: 10, maxParticipants: 10, createdAt: '2026-10-01T08:00:00Z', hiddenAt: null,
};
const hiddenRow: V1AdminMatchRow = {
  ...row, matchId: 'hidden-match', title: '(테스트) 숨긴 경기', status: 'cancelled', hiddenAt: '2026-11-22T08:05:00Z',
};
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: state.canWrite ? ['status:write'] : [] } }),
  useV1ChangeMatchStatus: () => ({ mutate: state.mutate, isPending: false }),
  useV1AdminMatches: (filters: { q?: string; status?: string; visibility?: string; page: number }) => {
    state.query(filters);
    const matches = (!filters.q || row.title.includes(filters.q))
      && (!filters.status || filters.status === row.status);
    // 서버처럼 공개 여부 필터로 숨긴 행과 공개 행을 가른다(필터 없음 = 둘 다).
    const items = filters.visibility === 'hidden' ? [hiddenRow]
      : filters.visibility === 'public' ? [row]
        : state.mixed ? [row, hiddenRow] : [row];
    return {
      data: {
        items: matches || filters.visibility === 'hidden' ? items : [],
        pageInfo: { page: filters.page, totalPages: 3, total: 41, limit: 20 },
        summary: { total: 29, byStatus: { completed: 1 } },
      },
      isPending: false, isFetching: false, isError: state.error,
      error: state.error ? new Error('목록 서버 오류') : null, refetch: state.refetch,
    };
  },
}));

const searchInput = () => screen.getByLabelText('제목·장소 검색');
const completed = () => screen.getByRole('button', { name: '완료 1' });
const params = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  vi.clearAllMocks();
  state.error = false;
  state.canWrite = false;
  state.mixed = false;
  window.history.replaceState(null, '', '/admin/matches');
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('관리자 매치 목록의 URL 조회 조건', () => {
  it('새로 마운트할 때 검색·완료·페이지와 실제 목록 결과를 즉시 복원한다', () => {
    window.history.replaceState(null, '', '/admin/matches?q=1.0.3&status=completed&page=2');
    render(<AdminMatchesPage />);
    expect(searchInput()).toHaveValue('1.0.3');
    expect(completed()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page');
    expect(state.query.mock.calls[0][0]).toEqual({ q: '1.0.3', status: 'completed', page: 2, limit: 20 });
  });

  it('검색·완료→상세→실제 history Back/Forward에서 목록 조건을 보존한다', async () => {
    const view = render(<AdminMatchesPage />);
    fireEvent.change(searchInput(), { target: { value: '1.0.3' } });
    fireEvent.click(completed());
    await waitFor(() => expect(state.query).toHaveBeenLastCalledWith({ q: '1.0.3', status: 'completed', page: 1, limit: 20 }));
    fireEvent.click(screen.getAllByRole('button', { name: `${row.title} 상세 보기` })[0]);
    expect(window.location.pathname).toBe(`/admin/matches/${row.matchId}`);
    view.unmount();
    const back = nextPopState();
    window.history.back();
    await back;
    const returned = render(<AdminMatchesPage />);
    expect(searchInput()).toHaveValue('1.0.3');
    expect(completed()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
    expect(params().get('q')).toBe('1.0.3');
    expect(params().get('status')).toBe('completed');
    returned.unmount();
    const forward = nextPopState();
    window.history.forward();
    await forward;
    expect(window.location.pathname).toBe(`/admin/matches/${row.matchId}`);
  });

  it('빠른 검색과 상태 변경을 병합하고 API debounce·history 길이·다른 query/hash를 유지한다', () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/admin/matches?from=hub#results');
    const length = window.history.length;
    render(<AdminMatchesPage />);
    act(() => {
      fireEvent.change(searchInput(), { target: { value: '1.0' } });
      fireEvent.click(completed());
      fireEvent.change(searchInput(), { target: { value: '1.0.3' } });
    });
    expect(state.query.mock.lastCall?.[0].q).toBeUndefined();
    expect(params().get('q')).toBe('1.0.3');
    expect(params().get('status')).toBe('completed');
    expect(params().get('from')).toBe('hub');
    expect(window.location.hash).toBe('#results');
    expect(window.history.length).toBe(length);
    act(() => vi.advanceTimersByTime(300));
    expect(state.query).toHaveBeenLastCalledWith({ q: '1.0.3', status: 'completed', page: 1, limit: 20 });
    expect(searchInput()).toHaveValue('1.0.3');
  });

  it('마운트를 유지한 URL 복원은 입력·상태·페이지를 갱신하고 이전 검색 timer를 중단한다', () => {
    vi.useFakeTimers();
    render(<AdminMatchesPage />);
    fireEvent.change(searchInput(), { target: { value: '오래된 검색' } });
    act(() => {
      window.history.replaceState(null, '', '/admin/matches?q=1.0.3&status=completed&page=3');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(searchInput()).toHaveValue('1.0.3');
    expect(completed()).toHaveAttribute('aria-pressed', 'true');
    expect(state.query).toHaveBeenLastCalledWith({ q: '1.0.3', status: 'completed', page: 3, limit: 20 });
    act(() => vi.advanceTimersByTime(300));
    expect(params().get('q')).toBe('1.0.3');
    expect(state.query.mock.lastCall?.[0].q).toBe('1.0.3');
  });

  it('페이지를 URL에 저장하고 필터 변경·해제 시 첫 페이지로 돌아간다', () => {
    vi.useFakeTimers();
    render(<AdminMatchesPage />);
    fireEvent.click(screen.getByRole('button', { name: '3페이지' }));
    expect(params().get('page')).toBe('3');
    expect(state.query.mock.lastCall?.[0].page).toBe(3);
    fireEvent.click(completed());
    expect(params().has('page')).toBe(false);
    fireEvent.change(searchInput(), { target: { value: ' 1.0.3 ' } });
    act(() => vi.advanceTimersByTime(300));
    expect(state.query.mock.lastCall?.[0].q).toBe('1.0.3');
    fireEvent.change(searchInput(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '전체 29' }));
    act(() => vi.advanceTimersByTime(300));
    expect(window.location.search).toBe('');
    expect(state.query).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
  });

  it.each(['0', '-2', '1.5', 'Infinity', '9007199254740992'])('잘못된 status/page=%s는 허용된 전체/첫 페이지로 조회한다', (page) => {
    window.history.replaceState(null, '', `/admin/matches?status=bad&page=${page}`);
    render(<AdminMatchesPage />);
    expect(state.query.mock.calls[0][0]).toEqual({ page: 1, limit: 20 });
    expect(screen.getByRole('button', { name: '전체 29' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('검색 대기 중 상세로 이동해 unmount하면 timer가 상세 URL을 덮지 않는다', () => {
    vi.useFakeTimers();
    const view = render(<AdminMatchesPage />);
    fireEvent.change(searchInput(), { target: { value: '1.0.3' } });
    fireEvent.click(screen.getAllByRole('button', { name: `${row.title} 상세 보기` })[0]);
    view.unmount();
    act(() => vi.advanceTimersByTime(300));
    expect(window.location.pathname).toBe(`/admin/matches/${row.matchId}`);
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('정상 빈 결과와 API 오류·재시도를 구분하고 읽기 권한에 쓰기 버튼을 제공하지 않는다', () => {
    window.history.replaceState(null, '', '/admin/matches?q=없는경기&status=completed');
    const view = render(<AdminMatchesPage />);
    expect(screen.getByText('조건에 맞는 매치가 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도하기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /상태 변경/ })).not.toBeInTheDocument();
    state.error = true;
    view.rerender(<AdminMatchesPage />);
    expect(screen.queryByText('조건에 맞는 매치가 없어요')).not.toBeInTheDocument();
    expect(screen.getByText('목록 서버 오류')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('행이 있는 read-only 목록에도 상태 변경 버튼을 제공하지 않는다', () => {
    render(<AdminMatchesPage />);
    expect(screen.getAllByText(row.title).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /상태 변경/ })).not.toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('상태 변경 모달의 취소·Escape는 조회 조건을 유지하고 mutation을 실행하지 않는다', async () => {
    state.canWrite = true;
    window.history.replaceState(null, '', '/admin/matches?q=1.0.3&status=completed');
    render(<AdminMatchesPage />);
    const openModal = () => fireEvent.click(screen.getAllByRole('button', { name: `${row.title} 상태 변경` })[0]);
    openModal();
    expect(screen.getByRole('dialog', { name: '매치 상태 변경' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    openModal();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(searchInput()).toHaveValue('1.0.3');
    expect(completed()).toHaveAttribute('aria-pressed', 'true');
    expect(params().get('q')).toBe('1.0.3');
    expect(params().get('status')).toBe('completed');
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('숨긴 행에는 숨김 배지를 달고 상태 변경 버튼을 잠그며, 공개 행은 그대로 둔다', () => {
    state.canWrite = true;
    state.mixed = true;
    render(<AdminMatchesPage />);
    const hiddenButton = screen.getAllByRole('button', { name: `${hiddenRow.title} 상태 변경 — 숨긴 매치는 바꿀 수 없어요` })[0];
    expect(hiddenButton).toBeDisabled();
    expect(screen.getAllByRole('button', { name: `${row.title} 상태 변경` })[0]).toBeEnabled();
    // 숨김 배지는 숨긴 행에만 달린다. 목록이 표·카드 두 벌로 그려져도 행 수만큼이고, 필터의 '숨김' 옵션은 뺀다.
    const badges = screen.getAllByText('숨김').filter((node) => node.tagName !== 'OPTION');
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.length).toBe(screen.getAllByText(hiddenRow.title).length);
  });

  it('공개 여부 필터를 고르면 visibility 로 조회하고 URL 에 남기며 전체로 돌리면 지운다', () => {
    render(<AdminMatchesPage />);
    expect(state.query).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
    fireEvent.change(screen.getByLabelText('공개 여부'), { target: { value: 'hidden' } });
    expect(state.query).toHaveBeenLastCalledWith({ visibility: 'hidden', page: 1, limit: 20 });
    expect(params().get('visibility')).toBe('hidden');
    expect(screen.getAllByText(hiddenRow.title).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('공개 여부'), { target: { value: '' } });
    expect(params().has('visibility')).toBe(false);
    expect(state.query).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
  });

  it('URL 의 visibility 를 복원하고 허용 밖 값은 전체로 본다', () => {
    window.history.replaceState(null, '', '/admin/matches?visibility=hidden');
    const view = render(<AdminMatchesPage />);
    expect(screen.getByLabelText('공개 여부')).toHaveValue('hidden');
    expect(state.query.mock.calls[0][0]).toEqual({ visibility: 'hidden', page: 1, limit: 20 });
    view.unmount();
    window.history.replaceState(null, '', '/admin/matches?visibility=bogus');
    render(<AdminMatchesPage />);
    expect(screen.getByLabelText('공개 여부')).toHaveValue('');
    expect(state.query.mock.calls.at(-1)?.[0]).toEqual({ page: 1, limit: 20 });
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamScheduleSummary } from '@/types/api';
import { TeamScheduleListPageClient } from './team-schedules-client';

const replaceHistory = window.history.replaceState.bind(window.history);
const state = vi.hoisted(() => ({ role: 'owner', items: [] as V1TeamScheduleSummary[],
  loading: false, error: false, refetch: vi.fn(), query: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/fixture-team/schedules',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamDetail: () => ({ data: { teamId: 'fixture-team', name: '합성 일정 팀', viewer: { role: state.role } } }),
  useV1TeamSchedules: (teamId: string, filters: { type?: string; state?: string }) => {
    state.query(teamId, filters);
    return { data: { items: state.items.filter((item) => (!filters.type || item.type === filters.type)
      && (!filters.state || item.state === filters.state)) },
      isLoading: state.loading, isError: state.error, refetch: state.refetch };
  },
}));

beforeEach(() => {
  replaceHistory(null, '', '/teams/fixture-team/schedules');
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T12:00:00.000Z'));
  Object.assign(state, { role: 'owner', loading: false, error: false });
  state.items = [{ id: 'fixture-schedule', title: '합성 기존 훈련', type: 'TRAINING',
    startAt: '2026-10-04T01:00:00.000Z', endAt: '2026-10-04T03:00:00.000Z',
    timezone: 'Asia/Seoul', capacity: null, rsvpDeadlineAt: null, visibility: 'TEAM',
    state: 'SCHEDULED', version: 1, teamMatchId: null, linkedMatch: null,
    matchConfirmed: null, goingCount: 0, waitlistedCount: 0 }];
});
afterEach(() => {
  vi.useRealTimers();
  replaceHistory(null, '', '/');
});
function page() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TeamScheduleListPageClient teamId="fixture-team" />
  </QueryClientProvider>);
}
function chooseEmptyDay() {
  fireEvent.click(screen.getByRole('tab', { name: '캘린더' }));
  fireEvent.click(screen.getByRole('button', { name: '8일' }));
}

// 실제 client/page/calendar와 query 경계 fixture. JSDOM 조작은 alpha viewport/서버 정확성 판정이 아니다.
describe('#1547 빈 일정의 조회 범위', () => {
  it.each(['owner', 'manager', 'member'])('%s가 빈 날짜를 선택하면 날짜 안내와 기존 CTA 역할을 유지한다', (role) => {
    state.role = role; page(); chooseEmptyDay();
    expect(screen.getByText('선택한 날짜에 일정이 없어요')).toBeInTheDocument();
    expect(screen.getByText('다른 날짜를 선택하거나 날짜 필터를 해제해 보세요.')).toBeInTheDocument();
    expect(screen.queryByText(/첫 일정을/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '8일' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryAllByRole('link', { name: '일정 만들기' }).length > 0).toBe(role !== 'member');
    expect(state.query).toHaveBeenLastCalledWith('fixture-team', { limit: 100 });
  });

  it.each(['owner', 'manager', 'member'])('%s의 필터 없는 전체0은 원래 등록 안내를 유지한다', (role) => {
    state.role = role; state.items = []; page();
    expect(screen.getByText('아직 등록된 일정이 없어요')).toBeInTheDocument();
    expect(screen.getByText(role === 'member'
      ? '팀장·매니저가 일정을 등록하면 여기서 확인할 수 있어요.'
      : '팀원과 함께할 첫 일정을 만들어 보세요.')).toBeInTheDocument();
  });

  it('일정 있는 날짜→빈 날짜→해제로 같은 일정의 링크를 회복한다', () => {
    page(); fireEvent.click(screen.getByRole('tab', { name: '캘린더' }));
    fireEvent.click(screen.getByRole('button', { name: '4일, 일정 1건' }));
    const detailHref = new URL(screen.getByRole('link', { name: /합성 기존 훈련/ }).getAttribute('href')!, window.location.origin);
    expect(detailHref.pathname).toBe('/teams/fixture-team/schedules/fixture-schedule');
    expect(detailHref.searchParams.get('from')).toBe('/teams/fixture-team/schedules?view=calendar&month=2026-10&date=2026-10-04');
    fireEvent.click(screen.getByRole('button', { name: '8일' }));
    expect(screen.queryByRole('link', { name: /합성 기존 훈련/ })).not.toBeInTheDocument();
    expect(screen.getByText('선택한 날짜에 일정이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '날짜 필터 해제' }));
    expect(screen.getByRole('link', { name: /합성 기존 훈련/ })).toBeInTheDocument();
    expect(screen.queryByText('선택한 날짜에 일정이 없어요')).not.toBeInTheDocument();
  });

  it('전체0에서도 날짜가 선택돼 있으면 현재 날짜의 빈 범위를 안내한다', () => {
    state.items = []; page(); chooseEmptyDay();
    expect(screen.getByText('선택한 날짜에 일정이 없어요')).toBeInTheDocument();
  });

  it('목록으로 전환할 때 숨겨진 날짜 선택을 빈 문구에 적용하지 않는다', () => {
    state.items = []; page(); chooseEmptyDay();
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByText('아직 등록된 일정이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('선택한 날짜에 일정이 없어요')).not.toBeInTheDocument();
  });

  it.each(['이벤트', '완료'])('%s 조건의 결과0을 최초 등록 상태로 오해시키지 않는다', (label) => {
    page(); fireEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByText('조건에 맞는 일정이 없어요')).toBeInTheDocument();
    expect(screen.getByText('종류·상태 필터를 바꿔서 다시 확인해 보세요.')).toBeInTheDocument();
    expect(screen.queryByText(/첫 일정을/)).not.toBeInTheDocument();
  });

  it('오류는 빈 성공 안내보다 우선하고 실제 refetch를 호출한다', () => {
    state.items = []; state.error = true; page();
    expect(screen.getByRole('alert')).toHaveTextContent('일정을 불러오지 못했어요.');
    expect(screen.queryByText('아직 등록된 일정이 없어요')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it('로딩에는 최초 빈 안내를 성공처럼 표시하지 않는다', () => {
    state.items = []; state.loading = true; page();
    expect(screen.queryByText('아직 등록된 일정이 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('조건에 맞는 일정이 없어요')).not.toBeInTheDocument();
  });

  it('연속 날짜 선택과 재선택 해제로 문구·카드를 함께 갱신한다', () => {
    page(); chooseEmptyDay();
    fireEvent.click(screen.getByRole('button', { name: '4일, 일정 1건' }));
    expect(screen.getByRole('link', { name: /합성 기존 훈련/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8일' }));
    expect(screen.getByText('선택한 날짜에 일정이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '8일' }));
    expect(screen.getByRole('link', { name: /합성 기존 훈련/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '날짜 필터 해제' })).not.toBeInTheDocument();
  });
});

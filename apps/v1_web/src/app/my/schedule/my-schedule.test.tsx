// Task 13 QA gate — /my/schedule 라우트(page.tsx)를 렌더링해 view-model 배선, API 실패
// 상태, 상태 필터 상호작용을 검증한다. 팀 라우트의 권한 게이팅/409 충돌은
// `../../teams/[id]/schedules/team-schedules.test.tsx`가 담당한다 — 이 화면은 팀 역할과
// 무관한 "내 개인 일정" 조회 전용이라 권한 분기가 없다.
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1MyScheduleItem } from '@/types/api';
import MySchedulePage from './page';

const myScheduleApiMocks = vi.hoisted(() => ({
  useV1MySchedule: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...myScheduleApiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/schedule',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function myScheduleItem(overrides: Partial<V1MyScheduleItem> = {}): V1MyScheduleItem {
  return {
    id: 'sched-1',
    title: '정기 훈련',
    type: 'TRAINING',
    startAt: '2026-08-10T12:00:00.000Z',
    endAt: '2026-08-10T14:00:00.000Z',
    timezone: 'Asia/Seoul',
    capacity: 20,
    rsvpDeadlineAt: null,
    visibility: 'TEAM',
    state: 'SCHEDULED',
    version: 0,
    teamMatchId: null,
    goingCount: 5,
    waitlistedCount: 0,
    teamId: 'team-1',
    teamName: '성수 풋살 크루',
    myRole: 'member',
    myAttendanceStatus: 'GOING',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MySchedulePage — 빈 상태 / 데이터 렌더링', () => {
  it('일정이 하나도 없으면 빈 상태 안내를 보여준다', () => {
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(MySchedulePage());

    expect(screen.getByText('예정된 일정이 없어요')).toBeInTheDocument();
  });

  it('일정 항목을 팀명·종류·일시·내 참석 상태와 함께 목록으로 보여주고, 각 항목은 팀 상세 일정으로 링크된다', () => {
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: { items: [myScheduleItem()], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(MySchedulePage());

    const link = screen.getByRole('link', { name: /정기 훈련/ });
    expect(link).toHaveAttribute('href', '/teams/team-1/schedules/sched-1');
    expect(link).toHaveTextContent('성수 풋살 크루');
    expect(link).toHaveTextContent('훈련');
    expect(link).toHaveTextContent('참석');
  });

  it('내 참석 상태가 미정/불참이면 (본인 응답이므로) 그 라벨을 그대로 보여준다', () => {
    // 주의: 이건 팀 전체 미정/불참 "합계"를 지어내는 것과는 다르다 — 여기서는 서버가
    // 실제로 반환하는 이 사용자 본인의 myAttendanceStatus 필드를 그대로 라벨링할 뿐이다.
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: { items: [myScheduleItem({ id: 'sched-2', myAttendanceStatus: 'MAYBE' })], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(MySchedulePage());

    expect(screen.getByRole('link', { name: /정기 훈련/ })).toHaveTextContent('미정');
  });

  it('내 참석 상태가 아직 없으면(myAttendanceStatus=null) 참석 라벨을 표시하지 않는다', () => {
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: { items: [myScheduleItem({ myAttendanceStatus: null })], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(MySchedulePage());

    const link = screen.getByRole('link', { name: /정기 훈련/ });
    expect(link).not.toHaveTextContent('참석');
    expect(link).not.toHaveTextContent('미정');
    expect(link).not.toHaveTextContent('불참');
  });
});

describe('MySchedulePage — API 실패 상태', () => {
  it('조회 실패 시 재시도 가능한 에러 상태를 보여주고, 재시도 버튼은 refetch를 호출한다', () => {
    const refetch = vi.fn();
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(MySchedulePage());

    const errorState = screen.getByRole('alert');
    expect(errorState).toHaveTextContent('일정을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});

describe('MySchedulePage — 상태 필터 상호작용', () => {
  it('완료 필터를 누르면 useV1MySchedule이 status=completed로 다시 호출된다', () => {
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: { items: [myScheduleItem()], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(MySchedulePage());

    // 최초 렌더는 필터 없음(all) — limit만 보낸다.
    expect(myScheduleApiMocks.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50 });

    fireEvent.click(screen.getByRole('button', { name: '완료' }));

    expect(myScheduleApiMocks.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50, status: 'completed' });
  });

  it('전체로 되돌리면 status 파라미터가 다시 사라진다', () => {
    myScheduleApiMocks.useV1MySchedule.mockReturnValue({
      data: { items: [], nextCursor: null },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(MySchedulePage());

    fireEvent.click(screen.getByRole('button', { name: '취소됨' }));
    expect(myScheduleApiMocks.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50, status: 'cancelled' });

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(myScheduleApiMocks.useV1MySchedule).toHaveBeenLastCalledWith({ limit: 50 });
  });
});
